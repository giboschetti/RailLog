-- Fix for file_url vs transport_plan_file mismatch
-- This script updates all functions to use the correct column name

BEGIN;

-- Drop existing functions to avoid errors
DROP FUNCTION IF EXISTS public.create_internal_trip_v2(json, uuid);
DROP FUNCTION IF EXISTS public.create_internal_trip(json, uuid);

-- Recreate create_internal_trip_v2 function with correct column name
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
  
  -- Update wagon's current track to maintain link
  UPDATE wagons
  SET current_track_id = dest_track_id
  WHERE id = wagon_id_param;
  
  -- Return the trip_id
  RETURN trip_id;
END;
$$;

-- Recreate create_internal_trip function with correct column name
CREATE OR REPLACE FUNCTION public.create_internal_trip(
  trip_data json,
  wagon_id_param uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with definer's privileges to bypass RLS
AS $$
DECLARE
  trip_id UUID;
  dest_track_id UUID;
  is_planned BOOLEAN;
BEGIN
  -- Start a transaction
  BEGIN
    -- Extract trip id and destination track from the JSON data
    trip_id := (trip_data->>'id')::UUID;
    dest_track_id := (trip_data->>'dest_track_id')::UUID;
    is_planned := (trip_data->>'is_planned')::BOOLEAN;
    
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
      (trip_data->>'source_track_id')::UUID,
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
    
    -- Always update current_track_id to maintain link between wagons and tracks
    -- This ensures the UI displays wagons correctly
    UPDATE wagons
    SET current_track_id = dest_track_id
    WHERE id = wagon_id_param;
    
    -- Commit the transaction
    COMMIT;
  EXCEPTION WHEN OTHERS THEN
    -- Rollback on any error
    ROLLBACK;
    RAISE;
  END;
END;
$$;

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

COMMIT; 