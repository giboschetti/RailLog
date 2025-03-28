-- Function to create an internal trip with wagon movement in a single transaction
CREATE OR REPLACE FUNCTION public.create_internal_trip(
  trip_data JSON,
  wagon_id_param UUID
)
RETURNS VOID AS $$
DECLARE
  trip_id UUID;
  dest_track_id UUID;
BEGIN
  -- Start a transaction
  BEGIN
    -- Extract trip id and destination track from the JSON data
    trip_id := (trip_data->>'id')::UUID;
    dest_track_id := (trip_data->>'dest_track_id')::UUID;
    
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
      has_conflicts
    ) VALUES (
      trip_id,
      trip_data->>'type',
      (trip_data->>'datetime')::TIMESTAMPTZ,
      (trip_data->>'source_track_id')::UUID,
      dest_track_id,
      (trip_data->>'project_id')::UUID,
      (trip_data->>'is_planned')::BOOLEAN,
      (trip_data->>'created_at')::TIMESTAMPTZ,
      (trip_data->>'updated_at')::TIMESTAMPTZ,
      (trip_data->>'has_conflicts')::BOOLEAN
    );
    
    -- Link wagon to the trip
    INSERT INTO trip_wagons (
      trip_id,
      wagon_id
    ) VALUES (
      trip_id,
      wagon_id_param
    );
    
    -- Update wagon's current track
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
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT create_internal_trip(
--   '{"id":"example-uuid", "type":"internal", "datetime":"2023-01-01T12:00:00Z", 
--     "source_track_id":"source-uuid", "dest_track_id":"dest-uuid", 
--     "project_id":"project-uuid", "is_planned":false, 
--     "created_at":"2023-01-01T12:00:00Z", "updated_at":"2023-01-01T12:00:00Z",
--     "has_conflicts":false}',
--   'wagon-uuid'
-- ); 