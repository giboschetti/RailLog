-- fix_verify_wagon_trajectories.sql
-- Fixes the verify_wagon_trajectories function to resolve ambiguous column references

BEGIN;

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS verify_wagon_trajectories();

-- Recreate the function with proper column qualifications
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
        SELECT DISTINCT ON (wt.wagon_id)
            wt.wagon_id,
            wt.track_id AS event_track_id
        FROM 
            wagon_trajectories wt
        ORDER BY 
            wt.wagon_id, wt.timestamp DESC
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

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'functions', NULL, '{"message": "Fixed verify_wagon_trajectories function to resolve ambiguous column references"}');

COMMIT; 