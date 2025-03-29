-- update_ui_functions_for_events.sql
-- Updates existing UI functions to use the event-sourcing architecture
-- while maintaining backward compatibility

BEGIN;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'Updating UI functions to use event-sourcing approach');

-- 1. Update the get_track_wagons_at_time function to use the event log
DROP FUNCTION IF EXISTS get_track_wagons_at_time(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_track_wagons_at_time(track_id_param UUID, time_point TIMESTAMPTZ)
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
    -- Log function call for debugging
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('DEBUG', 'functions', NULL, 
            'Called get_track_wagons_at_time with track_id=' || track_id_param || ', time=' || time_point);
    
    RETURN QUERY
    WITH wagon_positions AS (
        -- Get the latest position of each wagon before or at the specified time
        SELECT 
            wt.wagon_id,
            wt.track_id,
            MIN(wt.timestamp) AS arrival_time -- When the wagon first arrived
        FROM wagon_trajectories wt
        WHERE 
            wt.track_id = track_id_param AND
            wt.timestamp <= time_point AND
            -- Ensure we don't see wagons that were moved away before our time point
            NOT EXISTS (
                SELECT 1 
                FROM wagon_trajectories wt2
                WHERE 
                    wt2.wagon_id = wt.wagon_id AND
                    wt2.timestamp > wt.timestamp AND
                    wt2.timestamp <= time_point AND
                    wt2.track_id <> track_id_param
            )
        GROUP BY 
            wt.wagon_id, wt.track_id
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
        wagon_types wt ON w.type_id = wt.id;

EXCEPTION WHEN OTHERS THEN
    -- Log error for debugging
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('ERROR', 'functions', NULL, 
            'Error in get_track_wagons_at_time: ' || SQLERRM);
    
    -- Return an empty result set
    RETURN;
END;
$$;

-- 2. Update the get_track_occupancy_at_time function to use the event log
DROP FUNCTION IF EXISTS get_track_occupancy_at_time(UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_track_occupancy_at_time(track_id_param UUID, time_point TIMESTAMPTZ)
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
    
    -- Calculate occupied length and wagon count based on event log
    FOR wagons_info IN 
        SELECT length FROM get_track_wagons_at_time(track_id_param, time_point)
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

-- 3. Create a function to help administrators verify wagon positions
CREATE OR REPLACE FUNCTION verify_wagon_trajectories()
RETURNS TABLE (
    wagon_id UUID,
    wagon_number TEXT,
    event_count INTEGER,
    current_track_id UUID,
    event_based_track_id UUID,
    mismatch BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH latest_events AS (
        SELECT DISTINCT ON (wagon_id)
            wagon_id,
            track_id AS event_track_id
        FROM 
            wagon_trajectories
        ORDER BY 
            wagon_id, timestamp DESC
    )
    SELECT
        w.id AS wagon_id,
        w.number AS wagon_number,
        COUNT(wt.id) AS event_count,
        w.current_track_id,
        le.event_track_id,
        w.current_track_id IS DISTINCT FROM le.event_track_id AS mismatch
    FROM
        wagons w
    LEFT JOIN
        wagon_trajectories wt ON w.id = wt.wagon_id
    LEFT JOIN
        latest_events le ON w.id = le.wagon_id
    GROUP BY
        w.id, w.number, w.current_track_id, le.event_track_id
    ORDER BY
        mismatch DESC, w.number;
END;
$$;

-- 4. Create a function to fix any inconsistencies between current_track_id and event log
CREATE OR REPLACE FUNCTION fix_wagon_trajectory_inconsistencies()
RETURNS TABLE (
    wagon_id UUID,
    wagon_number TEXT,
    old_track_id UUID,
    new_track_id UUID,
    fixed BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    wagon_rec RECORD;
    latest_event_track_id UUID;
BEGIN
    -- Create a temporary table to store results
    CREATE TEMP TABLE fixed_wagons (
        wagon_id UUID,
        wagon_number TEXT,
        old_track_id UUID,
        new_track_id UUID,
        fixed BOOLEAN
    ) ON COMMIT DROP;
    
    -- Loop through wagons with inconsistencies
    FOR wagon_rec IN 
        SELECT * FROM verify_wagon_trajectories() WHERE mismatch = TRUE
    LOOP
        -- Get the latest event's track_id
        SELECT event_based_track_id INTO latest_event_track_id 
        FROM verify_wagon_trajectories() 
        WHERE wagon_id = wagon_rec.wagon_id;
        
        -- If we have a valid track from the event log
        IF latest_event_track_id IS NOT NULL THEN
            -- Update the wagon's current_track_id to match the event log
            UPDATE wagons
            SET current_track_id = latest_event_track_id
            WHERE id = wagon_rec.wagon_id;
            
            -- Record the fix
            INSERT INTO fixed_wagons
            VALUES (
                wagon_rec.wagon_id,
                wagon_rec.wagon_number,
                wagon_rec.current_track_id,
                latest_event_track_id,
                TRUE
            );
        ELSE
            -- No valid track found in event log, so we need to use the current track
            -- but add an event to the log for consistency
            INSERT INTO wagon_trajectories (
                wagon_id,
                track_id,
                timestamp,
                move_type
            )
            VALUES (
                wagon_rec.wagon_id,
                wagon_rec.current_track_id,
                NOW(),
                'system_correction'
            );
            
            -- Record the fix
            INSERT INTO fixed_wagons
            VALUES (
                wagon_rec.wagon_id,
                wagon_rec.wagon_number,
                NULL,
                wagon_rec.current_track_id,
                TRUE
            );
        END IF;
    END LOOP;
    
    -- Return the results
    RETURN QUERY
    SELECT * FROM fixed_wagons;
END;
$$;

-- 5. Update the database schema version
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'UI functions updated to use event-sourcing approach');

COMMIT; 