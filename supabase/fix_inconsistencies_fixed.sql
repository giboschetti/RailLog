-- fix_inconsistencies_fixed.sql
-- Checks and fixes data inconsistencies in the event-sourcing implementation

BEGIN;

-- Log the start of the fix with proper JSON formatting
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, '{"message": "Starting data consistency checks and fixes"}');

-- 1. Check for inconsistencies between wagons.current_track_id and the event log
\echo 'Checking wagon position consistency...'
SELECT * FROM verify_wagon_trajectories() WHERE mismatch = TRUE;

-- 2. Fix any inconsistencies in wagon positions
\echo 'Fixing wagon position inconsistencies...'
SELECT * FROM fix_wagon_trajectory_inconsistencies();

-- 3. Check trip consistency (do all wagons in trips have trajectories?)
\echo 'Checking trip consistency...'
SELECT * FROM check_trip_consistency() WHERE is_consistent = FALSE;

-- 4. Fix any inconsistencies in trip trajectories
\echo 'Fixing trip trajectory inconsistencies...'
SELECT * FROM fix_trip_trajectory_inconsistencies();

-- 5. Check for wagons without any events
\echo 'Checking for wagons without events...'
SELECT * FROM wagons_without_events;

-- 6. Ensure all wagons have events
\echo 'Creating events for wagons that need them...'
SELECT * FROM ensure_all_wagons_have_events();

-- 7. Final verification
\echo 'Performing final verification...'
DO $$
DECLARE
    wagon_inconsistencies INTEGER;
    trip_inconsistencies INTEGER;
    wagons_without_events INTEGER;
BEGIN
    SELECT COUNT(*) INTO wagon_inconsistencies FROM verify_wagon_trajectories() WHERE mismatch = TRUE;
    SELECT COUNT(*) INTO trip_inconsistencies FROM check_trip_consistency() WHERE is_consistent = FALSE;
    SELECT COUNT(*) INTO wagons_without_events FROM wagons_without_events;
    
    IF wagon_inconsistencies = 0 AND trip_inconsistencies = 0 AND wagons_without_events = 0 THEN
        RAISE NOTICE 'All consistency checks passed. Database is in a consistent state.';
        
        -- Log success with proper JSON formatting
        INSERT INTO audit_logs (action, table_name, record_id, details)
        VALUES ('UPDATE', 'system', NULL, '{"message": "Data consistency checks passed. Database is in a consistent state."}');
    ELSE
        RAISE WARNING 'Some inconsistencies remain: % wagon position issues, % trip issues, % wagons without events',
                      wagon_inconsistencies, trip_inconsistencies, wagons_without_events;
        
        -- Log warning with proper JSON formatting
        INSERT INTO audit_logs (action, table_name, record_id, details)
        VALUES ('WARNING', 'system', NULL, 
                json_build_object(
                    'message', 'Some inconsistencies remain',
                    'wagon_position_issues', wagon_inconsistencies,
                    'trip_issues', trip_inconsistencies,
                    'wagons_without_events', wagons_without_events
                ));
    END IF;
END $$;

COMMIT; 