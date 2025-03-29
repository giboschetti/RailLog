-- SQL script to clean all data for Bern Cluster 2025 project
-- Run this in the Supabase SQL Editor

-- Define the project ID
DO $$
DECLARE
  project_id UUID := '49217582-5dcc-4c24-90fe-f6893b4e981e'; -- Bern Cluster 2025 project ID
BEGIN
  -- Step 1: Remove restrictions
  DELETE FROM restriction_tracks 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = project_id
  );
  
  DELETE FROM restriction_nodes 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = project_id
  );
  
  DELETE FROM restrictions WHERE project_id = project_id;
  
  -- Step 2: Remove trip_wagons for this project's trips
  DELETE FROM trip_wagons 
  WHERE trip_id IN (
    SELECT id FROM trips WHERE project_id = project_id
  );
  
  -- Step 3: Remove trips
  DELETE FROM trips WHERE project_id = project_id;
  
  -- Step 4: Remove wagons
  DELETE FROM wagons WHERE project_id = project_id;
  
  -- Step 5: Clean daily_restrictions if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'daily_restrictions'
  ) THEN
    DELETE FROM daily_restrictions WHERE project_id = project_id;
  END IF;
  
  RAISE NOTICE 'Cleanup complete! All wagons, trips, and restrictions for Bern Cluster 2025 have been removed.';
  RAISE NOTICE 'The project structure (nodes and tracks) remains intact.';
END $$; 