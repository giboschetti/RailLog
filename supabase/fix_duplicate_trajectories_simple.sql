-- Simple fix for duplicate trajectories during drag-and-drop operations
-- This script modifies only the create_internal_trip_v2 function to prevent duplicate trajectories
-- without adding any new columns to existing tables

BEGIN;

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);

-- Create updated function with better duplicate prevention
CREATE OR REPLACE FUNCTION public.create_internal_trip_v2(
  trip_data json,
  wagon_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  trip_id UUID;
  source_track_id UUID;
  dest_track_id UUID;
  is_planned BOOLEAN;
  source_node_id UUID;
  dest_node_id UUID;
  trip_datetime TIMESTAMPTZ;
  traj_id UUID;
  has_existing_trajectories BOOLEAN;
BEGIN
  -- Extract data from the JSON
  trip_id := (trip_data->>'id')::UUID;
  source_track_id := (trip_data->>'source_track_id')::UUID;
  dest_track_id := (trip_data->>'dest_track_id')::UUID;
  is_planned := (trip_data->>'is_planned')::BOOLEAN;
  trip_datetime := (trip_data->>'datetime')::TIMESTAMPTZ;
  
  -- Get node IDs for the source and destination tracks
  SELECT node_id INTO source_node_id FROM tracks WHERE id = source_track_id;
  SELECT node_id INTO dest_node_id FROM tracks WHERE id = dest_track_id;
  
  -- Generate ID for the trajectory record 
  traj_id := gen_random_uuid();
  
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
    trip_id,
    trip_data->>'type',
    trip_datetime,
    source_track_id,
    dest_track_id,
    (trip_data->>'project_id')::UUID,
    is_planned,
    (trip_data->>'created_at')::TIMESTAMPTZ,
    (trip_data->>'updated_at')::TIMESTAMPTZ,
    (trip_data->>'has_conflicts')::BOOLEAN,
    (trip_data->>'construction_site_id')::UUID,
    trip_data->>'transport_plan_file'
  );
  
  -- Link wagon to the trip
  INSERT INTO trip_wagons (
    trip_id,
    wagon_id
  ) VALUES (
    trip_id,
    wagon_id_param
  );
  
  -- Check if this wagon already has a trajectory record for this movement
  -- Use table aliases to avoid ambiguous column references
  SELECT EXISTS (
    SELECT 1 
    FROM wagon_trajectories wt
    WHERE wt.wagon_id = wagon_id_param 
    AND wt.trip_id = trip_id
  ) INTO has_existing_trajectories;
  
  -- Create a trajectory record immediately and delete any duplicates that might be created by triggers
  -- First create our own trajectory record
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
    traj_id,
    wagon_id_param,
    dest_track_id,
    dest_node_id,
    trip_datetime,
    'internal', -- Mark as internal movement
    trip_id,    -- Set the trip_id explicitly
    source_track_id,
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
    traj_id,
    jsonb_build_object(
      'message', 'Created wagon trajectory with trip_id',
      'trajectory_id', traj_id,
      'trip_id', trip_id,
      'wagon_id', wagon_id_param,
      'track_id', dest_track_id,
      'timestamp', trip_datetime
    )
  );
  
  -- Delete any duplicates created by triggers, keeping only our record
  -- This runs after our insert but within the same transaction, preventing duplicates
  DELETE FROM wagon_trajectories wt 
  WHERE wt.wagon_id = wagon_id_param 
    AND wt.trip_id = trip_id
    AND wt.id != traj_id;
  
  -- Update wagon's current track to maintain link
  UPDATE wagons
  SET current_track_id = dest_track_id
  WHERE id = wagon_id_param;
  
  -- Return the trip_id
  RETURN trip_id;
END;
$$;

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
    'message', 'Updated create_internal_trip_v2 function to prevent duplicate trajectories (simple approach)',
    'update_date', NOW()
  )
);

COMMIT; 