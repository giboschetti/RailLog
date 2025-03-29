-- Update the trigger function to ensure wagon trajectories get the correct timestamps
CREATE OR REPLACE FUNCTION create_wagon_trajectory_after_trip()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_planned = FALSE THEN
        INSERT INTO wagon_trajectories (
            id, wagon_id, track_id, node_id, timestamp, move_type, trip_id, 
            previous_track_id, next_track_id, created_at, updated_at
        )
        SELECT 
            gen_random_uuid(), 
            tw.wagon_id,
            CASE WHEN NEW.type = 'departure' THEN NEW.source_track_id ELSE NEW.dest_track_id END,
            CASE WHEN NEW.type = 'departure' THEN 
                (SELECT node_id FROM tracks WHERE id = NEW.source_track_id)
            ELSE
                (SELECT node_id FROM tracks WHERE id = NEW.dest_track_id)
            END,
            NEW.datetime, -- Use the trip's datetime for all trajectory records
            CASE 
                -- For delivery trips, create a combined delivery/initial record
                WHEN NEW.type = 'delivery' AND NOT EXISTS (
                    SELECT 1 FROM wagon_trajectories
                    WHERE wagon_id = tw.wagon_id
                ) THEN 'delivery'
                ELSE NEW.type
            END,
            NEW.id,
            CASE WHEN NEW.type = 'delivery' THEN NULL ELSE NEW.source_track_id END,
            CASE WHEN NEW.type = 'departure' THEN NULL ELSE NEW.dest_track_id END,
            NOW(),
            NOW()
        FROM 
            trip_wagons tw
        WHERE 
            tw.trip_id = NEW.id
        AND NOT EXISTS (
            SELECT 1 FROM wagon_trajectories wt
            WHERE wt.wagon_id = tw.wagon_id 
            AND wt.trip_id = NEW.id
        );
        
        -- Update any existing 'initial' records for delivery trips
        -- to use the delivery trip's timestamp
        IF NEW.type = 'delivery' THEN
            UPDATE wagon_trajectories wt
            SET 
                timestamp = NEW.datetime,
                updated_at = NOW()
            FROM trip_wagons tw
            WHERE 
                tw.trip_id = NEW.id AND
                tw.wagon_id = wt.wagon_id AND
                wt.move_type = 'initial';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add an audit log entry to record the change
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated trajectory trigger to align all timestamps with their corresponding trips',
    'update_date', NOW()
  )
); 