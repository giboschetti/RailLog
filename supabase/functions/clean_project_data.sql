-- Function to clean project data (wagons, trips, restrictions)
CREATE OR REPLACE FUNCTION clean_project_data(target_project_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Step 1: Remove restrictions
  DELETE FROM restriction_tracks 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = target_project_id
  );
  
  DELETE FROM restriction_nodes 
  WHERE restriction_id IN (
    SELECT id FROM restrictions WHERE project_id = target_project_id
  );
  
  DELETE FROM restrictions WHERE project_id = target_project_id;
  
  -- Step 2: Remove trip_wagons for this project's trips
  DELETE FROM trip_wagons 
  WHERE trip_id IN (
    SELECT id FROM trips WHERE project_id = target_project_id
  );
  
  -- Step 3: Remove trips
  DELETE FROM trips WHERE project_id = target_project_id;
  
  -- Step 4: Remove wagons
  DELETE FROM wagons WHERE project_id = target_project_id;
  
  -- Step 5: Clean daily_restrictions if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'daily_restrictions'
  ) THEN
    DELETE FROM daily_restrictions WHERE project_id = target_project_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution privileges to authenticated users
GRANT EXECUTE ON FUNCTION clean_project_data(UUID) TO authenticated;

-- Comment to describe the function
COMMENT ON FUNCTION clean_project_data(UUID) IS 'Cleans all wagons, trips, and restrictions for a project while preserving the project structure'; 