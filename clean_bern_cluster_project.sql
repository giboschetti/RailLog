-- SQL script to clean the Bern Cluster 2025 project data
-- This script removes all wagons, trips, and restrictions
-- while preserving the project structure (nodes and tracks)

-- Define the project ID
DO $$
DECLARE
  project_id UUID := '49217582-5dcc-4c24-90fe-f6893b4e981e'; -- Bern Cluster 2025 project ID
BEGIN
  -- Step 1: Remove restrictions
  -- First, remove restriction_tracks and restriction_nodes for this project's restrictions
  DELETE FROM restriction_tracks 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = project_id
  );
  
  DELETE FROM restriction_nodes 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = project_id
  );
  
  -- Now delete the restrictions themselves
  DELETE FROM restrictions WHERE project_id = project_id;
  
  -- Step 2: Clean trip data
  -- First, get all trip IDs for this project
  PERFORM set_config('app.current_project_id', project_id::text, false);
  
  -- Delete trip_wagons first (junction table)
  DELETE FROM trip_wagons 
  WHERE trip_id IN (
    SELECT id FROM trips WHERE project_id = project_id
  );
  
  -- Now delete the trips
  DELETE FROM trips WHERE project_id = project_id;
  
  -- Step 3: Clean wagon data
  -- Remove wagon references from trip_wagons (should already be done above, but just in case)
  DELETE FROM trip_wagons 
  WHERE wagon_id IN (
    SELECT id FROM wagons WHERE project_id = project_id
  );
  
  -- Now delete the wagons
  DELETE FROM wagons WHERE project_id = project_id;
  
  -- Step 4: Clean daily_restrictions if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'daily_restrictions'
  ) THEN
    DELETE FROM daily_restrictions WHERE project_id = project_id;
  END IF;
  
  -- Note: We're keeping the project, nodes, and tracks intact
  
  -- Step 5: Output results
  RAISE NOTICE 'Cleanup complete for Bern Cluster 2025 project';
  RAISE NOTICE 'Project structure (nodes and tracks) has been preserved';
END $$; 