-- Fix for wagon_trajectories not showing correct trip information
-- This script updates the create_internal_trip_v2 function to properly create trajectory records

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);

-- Recreate with proper trajectory tracking
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
  
  -- Insert the trip
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
  
  -- Create a trajectory record for the wagon movement
  -- IMPORTANT: Use the trip datetime, not current time
  INSERT INTO wagon_trajectories (
    id,
    wagon_id,
    track_id,
    node_id,
    timestamp,      -- Use the trip's datetime explicitly
    move_type,
    trip_id,        -- Explicitly set the trip_id
    previous_track_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    wagon_id_param,
    dest_track_id,
    dest_node_id,
    trip_datetime,  -- Use the trip's datetime
    'internal',     -- Use proper move type based on trip type
    trip_id,        -- Link to the trip
    source_track_id,
    NOW(),
    NOW()
  );
  
  -- Always update current_track_id to maintain link between wagons and tracks
  UPDATE wagons
  SET current_track_id = dest_track_id
  WHERE id = wagon_id_param;
  
  -- Return the trip_id
  RETURN trip_id;
END;
$$;

-- Add audit log entry for the function update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed wagon_trajectories generation with proper trip_id and timestamp',
    'update_date', NOW()
  )
);

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

COMMIT; 