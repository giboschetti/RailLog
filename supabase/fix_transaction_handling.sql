-- Fix transaction handling in create_internal_trip_v2
-- PostgreSQL does not allow committing/rolling back inside a function
-- unless it's marked with pragma autonomous_transaction

BEGIN;

-- Drop the existing function 
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);

-- Recreate with proper transaction handling
CREATE OR REPLACE FUNCTION public.create_internal_trip_v2(
  trip_data json,
  wagon_id_param uuid
)
RETURNS uuid  -- Return the trip_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  trip_id UUID;
  source_track_id UUID;
  dest_track_id UUID;
  is_planned BOOLEAN;
  track_node_id UUID;  -- Renamed variable to avoid ambiguity
BEGIN
  -- Extract data from the JSON
  trip_id := (trip_data->>'id')::UUID;
  source_track_id := (trip_data->>'source_track_id')::UUID;
  dest_track_id := (trip_data->>'dest_track_id')::UUID;
  is_planned := (trip_data->>'is_planned')::BOOLEAN;
  
  -- Get node ID for the destination track - use table alias to avoid ambiguity
  SELECT t.node_id INTO track_node_id FROM tracks t WHERE t.id = dest_track_id;
  
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
    (trip_data->>'datetime')::TIMESTAMPTZ,
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
    timestamp,  -- Use the trip's datetime, not the current time
    move_type,
    trip_id,    -- Explicitly set the trip_id
    previous_track_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    wagon_id_param,
    dest_track_id,
    track_node_id,  -- Use the renamed variable to avoid ambiguity
    (trip_data->>'datetime')::TIMESTAMPTZ,  -- Use the trip's datetime
    'manual',                               -- Mark as manual move (drag & drop)
    trip_id,                                -- Link to the trip
    source_track_id,
    NOW(),
    NOW()
  );
  
  -- Always update current_track_id to maintain link between wagons and tracks
  -- This ensures the UI displays wagons correctly
  UPDATE wagons
  SET current_track_id = dest_track_id
  WHERE id = wagon_id_param;
  
  -- Return the trip_id so the frontend knows it was successful
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
    'message', 'Fixed node_id ambiguity in create_internal_trip_v2 function',
    'update_date', NOW()
  )
);

COMMIT; 