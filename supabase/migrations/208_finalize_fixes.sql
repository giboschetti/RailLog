-- Add better error handling to our functions
-- Let's make sure our trigger functions are robust and handle nulls gracefully

-- Improve handle_trip_deletion function with better error handling
CREATE OR REPLACE FUNCTION handle_trip_deletion()
RETURNS TRIGGER AS $$
DECLARE
  wagon_id_val UUID;
  trip_type_val TEXT;
  trajectory_record RECORD;
  previous_track_id UUID;
BEGIN
  -- Log trip deletion for diagnostic purposes
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES ('DELETE', 'trips', OLD.id, json_build_object(
    'trip_type', OLD.type,
    'datetime', OLD.datetime
  ));
  
  -- Store trip type for easier access
  trip_type_val := OLD.type;
  
  -- For each wagon from the deleted trip's trajectories
  FOR wagon_id_val IN 
    SELECT DISTINCT wagon_id FROM wagon_trajectories 
    WHERE trip_id = OLD.id
  LOOP
    BEGIN -- Begin inner exception block
      -- Find the most recent trajectory record before this trip
      -- This is where the wagon was before this trip
      SELECT * INTO trajectory_record
      FROM wagon_trajectories
      WHERE 
        wagon_id = wagon_id_val AND
        trip_id != OLD.id AND
        timestamp < OLD.datetime
      ORDER BY timestamp DESC
      LIMIT 1;
      
      -- For delivery or internal trips, revert the wagon's current_track_id to where it was before
      IF trip_type_val IN ('delivery', 'internal') THEN
        IF trajectory_record.id IS NOT NULL THEN
          -- Found a previous trajectory, use its track_id
          previous_track_id := trajectory_record.track_id;
          
          -- Update the wagon's current location to where it was before this trip
          UPDATE wagons
          SET current_track_id = previous_track_id
          WHERE id = wagon_id_val;
          
          -- Log the reversion to the previous track
          INSERT INTO audit_logs (action, table_name, record_id, details)
          VALUES ('UPDATE', 'wagons', wagon_id_val, json_build_object(
            'current_track_id', previous_track_id,
            'reason', 'Trip deletion reversion'
          ));
        ELSE
          -- If this was a delivery trip and no previous trajectory found
          -- then the wagon shouldn't exist in the system
          IF trip_type_val = 'delivery' THEN
            -- For a delivery trip with no prior history, update to NULL
            UPDATE wagons
            SET current_track_id = NULL
            WHERE id = wagon_id_val;
            
            -- Also create a trajectory record showing this removal
            INSERT INTO wagon_trajectories
              (wagon_id, track_id, move_type, timestamp)
            VALUES
              (wagon_id_val, NULL, 'removal', NOW());
            
            -- Log the wagon removal due to trip deletion
            INSERT INTO audit_logs (action, table_name, record_id, details)
            VALUES ('UPDATE', 'wagons', wagon_id_val, json_build_object(
              'current_track_id', NULL,
              'reason', 'Delivery trip deletion'
            ));
          END IF;
        END IF;
      END IF;
      
      -- Mark the trip's trajectory records as no longer associated with the deleted trip
      -- This keeps the trajectory history but disassociates it from the deleted trip
      UPDATE wagon_trajectories
      SET trip_id = NULL
      WHERE trip_id = OLD.id AND wagon_id = wagon_id_val;
      
      -- Log the trajectory disassociation
      INSERT INTO audit_logs (action, table_name, record_id, details)
      VALUES ('UPDATE', 'wagon_trajectories', wagon_id_val, json_build_object(
        'trip_id', NULL,
        'reason', 'Trip deletion disassociation'
      ));
      
    EXCEPTION WHEN OTHERS THEN
      -- Log any errors that occur during processing of a specific wagon
      INSERT INTO audit_logs (action, table_name, record_id, details)
      VALUES ('ERROR', 'wagon_trajectories', wagon_id_val, json_build_object(
        'error', SQLERRM,
        'trip_id', OLD.id
      ));
      -- Continue with the next wagon despite the error
    END;
  END LOOP;
  
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors at the function level
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES ('ERROR', 'trips', OLD.id, json_build_object(
    'error', SQLERRM,
    'context', 'handle_trip_deletion trigger function'
  ));
  
  -- Always return OLD to allow deletion to proceed even if cleanup fails
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is correctly attached
DROP TRIGGER IF EXISTS trip_deletion_trigger ON trips;
CREATE TRIGGER trip_deletion_trigger
BEFORE DELETE ON trips
FOR EACH ROW
EXECUTE FUNCTION handle_trip_deletion();

-- Finalize the track wagons function to ensure it works with RPC
CREATE OR REPLACE FUNCTION get_track_wagons_at_time(
  track_id_param UUID,
  time_param TIMESTAMPTZ
)
RETURNS TABLE (
  trajectory_id UUID,
  wagon_id UUID,
  event_time TIMESTAMPTZ,
  move_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_trajectories AS (
    SELECT 
      wt.id,
      wt.wagon_id,
      wt.track_id,
      wt.move_type,
      wt.timestamp,
      ROW_NUMBER() OVER (PARTITION BY wt.wagon_id ORDER BY wt.timestamp DESC) AS row_num
    FROM wagon_trajectories wt
    WHERE wt.timestamp <= time_param
  )
  SELECT 
    lt.id AS trajectory_id,
    lt.wagon_id,
    lt.timestamp AS event_time,
    lt.move_type
  FROM latest_trajectories lt
  WHERE 
    lt.row_num = 1
    AND lt.track_id = track_id_param
    AND lt.move_type IN ('delivery', 'internal', 'initial')
    AND NOT EXISTS (
      SELECT 1 FROM wagon_trajectories d
      WHERE 
        d.wagon_id = lt.wagon_id 
        AND d.timestamp > lt.timestamp 
        AND d.timestamp <= time_param
        AND d.move_type = 'departure'
    )
  ORDER BY lt.timestamp;
END;
$$ LANGUAGE plpgsql; 