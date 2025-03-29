-- implement_event_sourcing_fixed.sql
-- Implements the foundation for event-sourcing architecture
-- This script enhances the existing database to better support event-sourcing principles

BEGIN;

-- Log the update (with proper JSON formatting)
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, '{"message": "Implementing event-sourcing architecture foundation"}');

-- 1. First ensure wagon_trajectories table is treated as an immutable event log
-- Adding indexes to improve query performance on the event log
CREATE INDEX IF NOT EXISTS idx_wagon_trajectories_wagon_id_timestamp 
ON wagon_trajectories(wagon_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_wagon_trajectories_track_id_timestamp 
ON wagon_trajectories(track_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_wagon_trajectories_timestamp 
ON wagon_trajectories(timestamp);

-- 2. Create a function to query wagon position at any point in time based on event log
CREATE OR REPLACE FUNCTION get_wagon_position_at_time(wagon_id_param UUID, time_point TIMESTAMPTZ)
RETURNS TABLE (
    wagon_id UUID,
    track_id UUID,
    arrived_at TIMESTAMPTZ,
    moved_by TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH latest_move AS (
        SELECT 
            wt.wagon_id,
            wt.track_id,
            wt.timestamp AS arrived_at,
            wt.move_type AS moved_by
        FROM 
            wagon_trajectories wt
        WHERE 
            wt.wagon_id = wagon_id_param
            AND wt.timestamp <= time_point
        ORDER BY 
            wt.timestamp DESC
        LIMIT 1
    )
    SELECT * FROM latest_move;
END;
$$;

-- 3. Create a new function to get all wagons on a track at a specific time
-- This uses the event log rather than current_track_id field
CREATE OR REPLACE FUNCTION get_track_wagons_by_events(track_id_param UUID, time_point TIMESTAMPTZ)
RETURNS TABLE (
    wagon_id UUID,
    number TEXT,
    length INTEGER,
    content TEXT,
    project_id UUID,
    construction_site_id UUID,
    type_id UUID,
    arrival_time TIMESTAMPTZ,
    wagon_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH wagon_positions AS (
        -- Get the latest position of each wagon before or at the specified time
        SELECT 
            wt.wagon_id,
            wt.track_id,
            wt.timestamp AS arrival_time
        FROM (
            SELECT 
                wagon_id,
                MAX(timestamp) AS max_timestamp
            FROM 
                wagon_trajectories
            WHERE 
                timestamp <= time_point
            GROUP BY 
                wagon_id
        ) latest_events
        JOIN wagon_trajectories wt ON 
            wt.wagon_id = latest_events.wagon_id AND 
            wt.timestamp = latest_events.max_timestamp
    )
    SELECT 
        w.id AS wagon_id,
        w.number,
        w.length,
        w.content,
        w.project_id,
        w.construction_site_id,
        w.type_id,
        wp.arrival_time,
        COALESCE(wt.name, w.custom_type) AS wagon_type
    FROM 
        wagons w
    JOIN 
        wagon_positions wp ON w.id = wp.wagon_id
    LEFT JOIN 
        wagon_types wt ON w.type_id = wt.id
    WHERE 
        wp.track_id = track_id_param;
END;
$$;

-- 4. Create a function to calculate track occupancy based on event log
CREATE OR REPLACE FUNCTION get_track_occupancy_by_events(track_id_param UUID, time_point TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    track_info RECORD;
    wagons_info RECORD;
    total_length INTEGER;
    occupied_length INTEGER := 0;
    wagon_count INTEGER := 0;
    available_length INTEGER;
    result JSON;
BEGIN
    -- Get track information
    SELECT id, length INTO track_info 
    FROM tracks 
    WHERE id = track_id_param;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'error', 'Track not found',
            'track_id', track_id_param,
            'total_length', 0,
            'occupied_length', 0,
            'available_length', 0,
            'wagon_count', 0
        );
    END IF;
    
    total_length := track_info.length;
    
    -- Calculate occupied length and wagon count
    FOR wagons_info IN 
        SELECT length FROM get_track_wagons_by_events(track_id_param, time_point)
    LOOP
        occupied_length := occupied_length + wagons_info.length;
        wagon_count := wagon_count + 1;
    END LOOP;
    
    available_length := total_length - occupied_length;
    
    -- Prepare result
    result := json_build_object(
        'track_id', track_id_param,
        'total_length', total_length,
        'occupied_length', occupied_length,
        'available_length', available_length,
        'wagon_count', wagon_count
    );
    
    RETURN result;
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'error', 'Error calculating occupancy: ' || SQLERRM,
        'track_id', track_id_param,
        'total_length', COALESCE(total_length, 0),
        'occupied_length', 0,
        'available_length', COALESCE(total_length, 0),
        'wagon_count', 0
    );
END;
$$;

-- 5. Create a view for quickly accessing the current state of all wagons
CREATE OR REPLACE VIEW current_wagon_positions AS
WITH latest_positions AS (
    SELECT DISTINCT ON (wagon_id)
        wagon_id,
        track_id,
        timestamp AS position_updated_at
    FROM
        wagon_trajectories
    ORDER BY
        wagon_id, timestamp DESC
)
SELECT
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    lp.track_id,
    lp.position_updated_at,
    t.name AS track_name,
    COALESCE(wt.name, w.custom_type) AS wagon_type
FROM
    wagons w
JOIN
    latest_positions lp ON w.id = lp.wagon_id
LEFT JOIN
    tracks t ON lp.track_id = t.id
LEFT JOIN
    wagon_types wt ON w.type_id = wt.id;

-- 6. Create a debugger function to help diagnose wagon display issues
CREATE OR REPLACE FUNCTION debug_wagon_events(wagon_id_param UUID)
RETURNS TABLE (
    event_id UUID,
    wagon_id UUID,
    track_id UUID,
    previous_track_id UUID,
    timestamp TIMESTAMPTZ,
    move_type TEXT,
    trip_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id AS event_id,
        wt.wagon_id,
        wt.track_id,
        wt.previous_track_id,
        wt.timestamp,
        wt.move_type,
        wt.trip_id
    FROM
        wagon_trajectories wt
    WHERE
        wt.wagon_id = wagon_id_param
    ORDER BY
        wt.timestamp ASC;
END;
$$;

-- 7. Create a trigger to ensure that when we update a wagon's current_track_id,
-- we also ensure a corresponding event exists in the event log
CREATE OR REPLACE FUNCTION ensure_wagon_trajectory_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only process if the current_track_id actually changed
    IF OLD.current_track_id IS DISTINCT FROM NEW.current_track_id THEN
        -- Check if an event already exists for this transition within the last minute
        IF NOT EXISTS (
            SELECT 1 FROM wagon_trajectories
            WHERE wagon_id = NEW.id
            AND track_id = NEW.current_track_id
            AND previous_track_id = OLD.current_track_id
            AND timestamp > NOW() - INTERVAL '1 minute'
        ) THEN
            -- If no recent event exists, create one
            INSERT INTO wagon_trajectories (
                wagon_id, track_id, previous_track_id, timestamp, move_type
            )
            VALUES (
                NEW.id, 
                NEW.current_track_id, 
                OLD.current_track_id,
                NOW(),
                'system_update'  -- Indicates this was created by the system
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS ensure_wagon_trajectory_on_update ON wagons;

-- Create the trigger
CREATE TRIGGER ensure_wagon_trajectory_on_update
BEFORE UPDATE ON wagons
FOR EACH ROW
WHEN (OLD.current_track_id IS DISTINCT FROM NEW.current_track_id)
EXECUTE FUNCTION ensure_wagon_trajectory_exists();

-- 8. Update the database schema version
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, '{"message": "Event-sourcing foundation implemented"}');

COMMIT; 