-- Fix wagon trajectory timestamps for internal moves
-- This script updates the wagon_trajectories table to use the correct trip datetime for internal moves

-- Step 1: Fix the timestamps for manual trajectory entries created during drag and drop
UPDATE wagon_trajectories wt
SET 
  timestamp = t.datetime,
  updated_at = NOW()
FROM 
  trips t
  JOIN trip_wagons tw ON t.id = tw.trip_id
WHERE 
  t.type = 'internal' AND
  tw.wagon_id = wt.wagon_id AND
  wt.move_type = 'internal' AND
  -- Only update records where the timestamps don't match
  wt.timestamp != t.datetime;

-- Step 2: Find internal move trajectories created without proper trip link
-- and link them to their corresponding internal trip
UPDATE wagon_trajectories wt
SET 
  trip_id = t.id,
  timestamp = t.datetime,
  updated_at = NOW()
FROM 
  trips t
  JOIN trip_wagons tw ON t.id = tw.trip_id
WHERE 
  t.type = 'internal' AND
  tw.wagon_id = wt.wagon_id AND
  wt.move_type = 'internal' AND
  wt.trip_id IS NULL AND
  -- Match based on track IDs (source and destination match)
  wt.previous_track_id = t.source_track_id AND
  wt.track_id = t.dest_track_id;

-- Add an audit log entry for the changes
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'DATA_FIX', 
  'wagon_trajectories', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed internal trajectory timestamps to match their trip dates',
    'fix_date', NOW()
  )
);

-- Now update the trigger function to ensure this doesn't happen again
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
            NEW.datetime, -- Always use the trip's datetime for all trajectory records
            CASE 
                -- For delivery trips, create a combined delivery/initial record if no history
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
        
        -- Update any existing 'internal' records for the same wagon
        -- to use the trip's planned datetime
        IF NEW.type = 'internal' THEN
            UPDATE wagon_trajectories wt
            SET 
                timestamp = NEW.datetime,
                trip_id = NEW.id,
                updated_at = NOW()
            FROM trip_wagons tw
            WHERE 
                tw.trip_id = NEW.id AND
                tw.wagon_id = wt.wagon_id AND
                wt.move_type = 'internal' AND
                (wt.trip_id IS NULL OR wt.trip_id != NEW.id) AND
                wt.previous_track_id = NEW.source_track_id AND
                wt.track_id = NEW.dest_track_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add an audit log entry for the trigger update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated trajectory trigger to correctly handle internal trip timestamps',
    'update_date', NOW()
  )
); 