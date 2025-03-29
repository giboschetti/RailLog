-- Final fix for duplicate trajectories during drag-and-drop operations
-- This version DOES NOT rely on adding new columns to existing tables

BEGIN;

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);

-- Create updated function with safer duplicate prevention
CREATE OR REPLACE FUNCTION public.create_internal_trip_v2(
  trip_data json,
  wagon_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trip_id UUID;
  v_source_track_id UUID;
  v_dest_track_id UUID;
  v_is_planned BOOLEAN;
  v_source_node_id UUID;
  v_dest_node_id UUID;
  v_trip_datetime TIMESTAMPTZ;
  v_traj_id UUID;
BEGIN
  -- Extract data from the JSON - use v_ prefix to avoid ambiguity
  v_trip_id := (trip_data->>'id')::UUID;
  v_source_track_id := (trip_data->>'source_track_id')::UUID;
  v_dest_track_id := (trip_data->>'dest_track_id')::UUID;
  v_is_planned := (trip_data->>'is_planned')::BOOLEAN;
  v_trip_datetime := (trip_data->>'datetime')::TIMESTAMPTZ;
  
  -- Get node IDs for the source and destination tracks
  SELECT node_id INTO v_source_node_id FROM tracks WHERE id = v_source_track_id;
  SELECT node_id INTO v_dest_node_id FROM tracks WHERE id = v_dest_track_id;
  
  -- Generate ID for the trajectory record 
  v_traj_id := gen_random_uuid();
  
  -- First insert the trip
  INSERT INTO trips (
    id, 
    type, 
    datetime, 
    source_track_id, 
    dest_track_id, 
    project_id, 
    is_planned,
    created_at,
    updated_at,
    has_conflicts,
    construction_site_id,
    transport_plan_file
  ) VALUES (
    v_trip_id,
    trip_data->>'type',
    v_trip_datetime,
    v_source_track_id,
    v_dest_track_id,
    (trip_data->>'project_id')::UUID,
    v_is_planned,
    (trip_data->>'created_at')::TIMESTAMPTZ,
    (trip_data->>'updated_at')::TIMESTAMPTZ,
    (trip_data->>'has_conflicts')::BOOLEAN,
    (trip_data->>'construction_site_id')::UUID,
    trip_data->>'transport_plan_file'
  );
  
  -- Delete any existing trajectory records for this wagon and trip
  -- This ensures we don't create duplicates
  DELETE FROM wagon_trajectories 
  WHERE wagon_id = wagon_id_param 
    AND trip_id = v_trip_id;
  
  -- Create a trajectory record for this movement
  INSERT INTO wagon_trajectories (
    id,
    wagon_id,
    track_id,
    node_id,
    timestamp,
    move_type,
    trip_id,
    previous_track_id,
    created_at,
    updated_at
  ) VALUES (
    v_traj_id,
    wagon_id_param,
    v_dest_track_id,
    v_dest_node_id,
    v_trip_datetime,
    'internal', -- Mark as internal movement
    v_trip_id,  -- Set the trip_id explicitly
    v_source_track_id,
    NOW(),
    NOW()
  );
  
  -- Log creation
  INSERT INTO audit_logs (
    action, 
    table_name, 
    record_id, 
    details
  ) VALUES (
    'DEBUG_LOG',
    'wagon_trajectories',
    v_traj_id,
    jsonb_build_object(
      'message', 'Created wagon trajectory with trip_id',
      'trajectory_id', v_traj_id,
      'trip_id', v_trip_id,
      'wagon_id', wagon_id_param,
      'track_id', v_dest_track_id,
      'timestamp', v_trip_datetime
    )
  );
  
  -- Link wagon to the trip - AFTER creating the trajectory
  -- This prevents triggers from creating additional trajectories
  INSERT INTO trip_wagons (
    trip_id,
    wagon_id
  ) VALUES (
    v_trip_id,
    wagon_id_param
  );
  
  -- Update wagon's current track to maintain link
  UPDATE wagons
  SET current_track_id = v_dest_track_id
  WHERE id = wagon_id_param;
  
  -- Ensure we don't have duplicates by cleaning up any unexpected records
  -- that might have been created by triggers
  WITH duplicate_trajectories AS (
    SELECT id
    FROM wagon_trajectories
    WHERE 
      wagon_id = wagon_id_param 
      AND trip_id = v_trip_id
      AND id != v_traj_id
  )
  DELETE FROM wagon_trajectories
  WHERE id IN (SELECT id FROM duplicate_trajectories);
  
  -- Return the trip_id
  RETURN v_trip_id;
END;
$$;

-- Also adjust the add_wagon_trajectory_on_trip trigger function to be smarter
-- about avoiding duplicate trajectory creation
CREATE OR REPLACE FUNCTION public.add_wagon_trajectory_on_trip()
RETURNS TRIGGER AS $$
DECLARE
  v_track_id UUID;
  v_node_id UUID;
  v_previous_track_id UUID;
  v_move_type VARCHAR;
  v_timestamp TIMESTAMPTZ;
  v_next_track_id UUID;
BEGIN
  -- Get the trip information - use qualified column names
  SELECT t.type, t.datetime, t.source_track_id, t.dest_track_id 
  INTO v_move_type, v_timestamp, v_previous_track_id, v_next_track_id
  FROM public.trips t
  WHERE t.id = NEW.trip_id;
  
  -- Determine the new track ID based on the trip type
  IF v_move_type = 'delivery' OR v_move_type = 'internal' THEN
    -- For deliveries and internal moves, destination is the new location
    v_track_id := v_next_track_id;
  ELSE
    -- For departures, the source is the actual location (before leaving)
    v_track_id := v_previous_track_id;
  END IF;
  
  -- Get the node_id for the track
  SELECT node_id INTO v_node_id
  FROM public.tracks
  WHERE id = v_track_id;
  
  -- Don't create a duplicate trajectory for this wagon+trip
  IF EXISTS (
    SELECT 1 
    FROM public.wagon_trajectories wt
    WHERE wt.wagon_id = NEW.wagon_id 
    AND wt.trip_id = NEW.trip_id
  ) THEN
    RETURN NEW;
  END IF;
  
  -- For internal trips created via drag-drop, skip trajectory creation
  -- since the drag-drop function already creates it first
  IF v_move_type = 'internal' AND
     EXISTS (
       SELECT 1 
       FROM wagon_trajectories wt
       WHERE wt.wagon_id = NEW.wagon_id 
         AND wt.move_type = 'internal'
         AND wt.previous_track_id = v_previous_track_id
         AND wt.track_id = v_track_id
         AND wt.timestamp = v_timestamp
     ) 
  THEN
    RETURN NEW;
  END IF;
  
  -- Insert the trajectory record
  INSERT INTO public.wagon_trajectories (
    id,
    wagon_id, 
    track_id, 
    node_id,
    timestamp, 
    move_type, 
    trip_id, 
    previous_track_id,
    next_track_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    NEW.wagon_id,
    v_track_id,
    v_node_id,
    v_timestamp,
    v_move_type,
    NEW.trip_id,
    -- For delivery, previous_track is NULL
    CASE WHEN v_move_type = 'delivery' THEN NULL ELSE v_previous_track_id END,
    -- For departure, next_track is NULL
    CASE WHEN v_move_type = 'departure' THEN NULL ELSE v_next_track_id END,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$
LANGUAGE plpgsql;

-- Cleanup existing duplicate trajectories
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT wt.id
    FROM wagon_trajectories wt
    INNER JOIN (
      SELECT wagon_id, trip_id, MIN(created_at) as first_created
      FROM wagon_trajectories
      WHERE trip_id IS NOT NULL
      GROUP BY wagon_id, trip_id
      HAVING COUNT(*) > 1
    ) dups ON wt.wagon_id = dups.wagon_id AND wt.trip_id = dups.trip_id
    WHERE wt.created_at > dups.first_created
  ),
  deleted AS (
    DELETE FROM wagon_trajectories
    WHERE id IN (SELECT id FROM duplicates)
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Log the cleanup results
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES (
    'SYSTEM_CLEANUP', 
    'wagon_trajectories', 
    gen_random_uuid(), 
    jsonb_build_object(
      'message', 'Cleaned up duplicate trajectories',
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    )
  );
END
$$;

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

-- Log the schema update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated function to safely prevent duplicate trajectories',
    'update_date', NOW()
  )
);

COMMIT; 