-- event_sourcing_master_fixed.sql
-- Master script for implementing the event-sourcing architecture
-- Runs all the necessary scripts in the correct order

\echo 'Starting event-sourcing implementation...'

-- 1. First, implement the foundation
\echo 'Step 1: Implementing event-sourcing foundation...'
\i implement_event_sourcing_fixed.sql

-- 2. Then update the UI functions
\echo 'Step 2: Updating UI functions for event-sourcing...'
\i update_ui_functions_for_events_fixed.sql

-- 3. Ensure all wagons have trajectory events
\echo 'Step 3: Ensuring all wagons have trajectory events...'
\i ensure_complete_event_history_fixed.sql

-- 4. Fix trip handling to work with event-sourcing
\echo 'Step 4: Improving trip handling for event-sourcing...'
\i improve_trip_handling_fixed.sql

-- 5. Fix any data inconsistencies
\echo 'Step 5: Checking and fixing data inconsistencies...'
\i fix_inconsistencies_fixed.sql

\echo 'Event-sourcing implementation completed successfully!' 