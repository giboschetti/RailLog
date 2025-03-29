-- Fix for drag-and-drop not setting trip_id in wagon_trajectories
-- This script specifically addresses the missing trip_id issue for new drag-drop operations

BEGIN;

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);

-- Create updated function with proper trajectory handling
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
  
  -- Create a trajectory record for manual movements (drag and drop)
  -- with explicit trip_id linking and using the trip datetime
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
    'manual', -- Mark as manual movement for drag-drop
    trip_id,  -- IMPORTANT: Set the trip_id explicitly
    source_track_id,
    NOW(),
    NOW()
  );
  
  -- Update wagon's current track to maintain link
  UPDATE wagons
  SET current_track_id = dest_track_id
  WHERE id = wagon_id_param;
  
  -- Debug log insertion
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
  
  -- Return the trip_id
  RETURN trip_id;
END;
$$;

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

-- Log the function update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated create_internal_trip_v2 function to fix trip_id in wagon_trajectories',
    'update_date', NOW()
  )
);

COMMIT; 