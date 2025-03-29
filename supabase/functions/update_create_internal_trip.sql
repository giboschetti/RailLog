-- Update create_internal_trip function to properly handle is_planned flag
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
      construction_site_id
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
      (trip_data->>'construction_site_id')::UUID
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