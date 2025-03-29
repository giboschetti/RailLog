-- ensure_complete_event_history.sql
-- Ensures all wagons have at least one event in the wagon_trajectories table
-- This script should be run after implementing the event-sourcing architecture

BEGIN;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'Ensuring complete event history for all wagons');

-- Function to check if wagons have events and create them if missing
CREATE OR REPLACE FUNCTION ensure_all_wagons_have_events()
RETURNS TABLE (
    wagon_id UUID,
    wagon_number TEXT,
    had_events BOOLEAN,
    events_created INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    wagon_rec RECORD;
    event_count INTEGER;
    events_created INTEGER := 0;
    has_events BOOLEAN;
BEGIN
    -- Create a temporary table to store results
    CREATE TEMP TABLE wagon_event_results (
        wagon_id UUID,
        wagon_number TEXT,
        had_events BOOLEAN,
        events_created INTEGER
    ) ON COMMIT DROP;
    
    -- Loop through all wagons
    FOR wagon_rec IN 
        SELECT id, number, current_track_id FROM wagons
        WHERE current_track_id IS NOT NULL
    LOOP
        -- Check if the wagon has any trajectory events
        SELECT COUNT(*) INTO event_count 
        FROM wagon_trajectories 
        WHERE wagon_id = wagon_rec.id;
        
        has_events := (event_count > 0);
        events_created := 0;
        
        -- If no events exist and the wagon has a current track, create an event
        IF NOT has_events AND wagon_rec.current_track_id IS NOT NULL THEN
            INSERT INTO wagon_trajectories (
                wagon_id,
                track_id,
                timestamp,
                move_type
            )
            VALUES (
                wagon_rec.id,
                wagon_rec.current_track_id,
                NOW(),
                'system_initialization'
            );
            
            events_created := 1;
            
            -- Log the creation
            INSERT INTO audit_logs (action, table_name, record_id, details)
            VALUES ('INSERT', 'wagon_trajectories', wagon_rec.id::TEXT, 
                    'Created initialization event for wagon ' || wagon_rec.number);
        END IF;
        
        -- Record the result
        INSERT INTO wagon_event_results
        VALUES (
            wagon_rec.id,
            wagon_rec.number,
            has_events,
            events_created
        );
    END LOOP;
    
    -- Return the results
    RETURN QUERY
    SELECT * FROM wagon_event_results;
END;
$$;

-- Run the function to ensure all wagons have events
SELECT * FROM ensure_all_wagons_have_events();

-- Create a view to check for wagons without events
CREATE OR REPLACE VIEW wagons_without_events AS
SELECT 
    w.id AS wagon_id,
    w.number AS wagon_number,
    w.current_track_id,
    t.name AS track_name,
    EXISTS (
        SELECT 1 FROM wagon_trajectories wt 
        WHERE wt.wagon_id = w.id
    ) AS has_events
FROM 
    wagons w
LEFT JOIN 
    tracks t ON w.current_track_id = t.id
WHERE 
    NOT EXISTS (
        SELECT 1 FROM wagon_trajectories wt 
        WHERE wt.wagon_id = w.id
    );

-- Update the database schema version
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'Complete event history ensured for all wagons');

COMMIT; 