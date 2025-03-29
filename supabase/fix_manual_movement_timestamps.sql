-- Fix manual movement timestamps
-- This script updates timestamps for manual movement records to match their corresponding trip dates

-- Step 1: Update manual movement timestamps based on trip dates
UPDATE wagon_trajectories wt
SET 
  timestamp = t.datetime,
  updated_at = NOW()
FROM 
  trips t
  JOIN trip_wagons tw ON t.id = tw.trip_id
WHERE 
  tw.wagon_id = wt.wagon_id AND
  wt.move_type = 'manual' AND
  -- Match by track and wagon IDs
  (
    (t.source_track_id = wt.previous_track_id AND t.dest_track_id = wt.track_id) OR
    (t.dest_track_id = wt.track_id)
  ) AND
  -- Only consider trips that are close in time (within 24 hours) to the manual record
  ABS(EXTRACT(EPOCH FROM (t.datetime - wt.timestamp))) < 24*60*60;

-- Step 2: Link manual movements to their trips
UPDATE wagon_trajectories wt
SET 
  trip_id = t.id
FROM 
  trips t
  JOIN trip_wagons tw ON t.id = tw.trip_id
WHERE 
  tw.wagon_id = wt.wagon_id AND
  wt.move_type = 'manual' AND
  wt.trip_id IS NULL AND
  -- Match by track and wagon IDs
  (
    (t.source_track_id = wt.previous_track_id AND t.dest_track_id = wt.track_id) OR
    (t.dest_track_id = wt.track_id)
  ) AND
  -- Timestamps should match after the first update
  t.datetime = wt.timestamp;

-- Add an audit log entry for the changes
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'DATA_FIX', 
  'wagon_trajectories', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed manual movement timestamps to match their trip dates',
    'fix_date', NOW()
  )
);

-- Update the trigger function to handle manual movements properly
CREATE OR REPLACE FUNCTION create_wagon_trajectory_after_trip()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_planned = FALSE THEN
        -- Insert new trajectory records
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
            NEW.datetime, -- Always use the trip's datetime
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
        
        -- Update existing records based on trip type
        
        -- 1. For delivery trips - update initial records
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
        
        -- 2. For internal trips - update internal records
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
        
        -- 3. For any trip type - update related manual movements
        UPDATE wagon_trajectories wt
        SET 
            timestamp = NEW.datetime,
            trip_id = NEW.id,
            updated_at = NOW()
        FROM trip_wagons tw
        WHERE 
            tw.trip_id = NEW.id AND
            tw.wagon_id = wt.wagon_id AND
            wt.move_type = 'manual' AND
            (wt.trip_id IS NULL OR wt.trip_id != NEW.id) AND
            (
                (wt.previous_track_id = NEW.source_track_id AND wt.track_id = NEW.dest_track_id) OR
                (wt.track_id = NEW.dest_track_id AND NEW.type = 'delivery')
            ) AND
            -- Only update manual records that are close in time to the trip (within 24 hours)
            ABS(EXTRACT(EPOCH FROM (NEW.datetime - wt.timestamp))) < 24*60*60;
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
    'message', 'Updated trajectory trigger to correctly handle manual movement timestamps',
    'update_date', NOW()
  )
); 