-- SQL script to add a test trip to the Bern Cluster 2025 project
-- This can be run after adding a test wagon to test trip functionality

-- Define variables
DO $$
DECLARE
  project_id UUID := '49217582-5dcc-4c24-90fe-f6893b4e981e'; -- Bern Cluster 2025 project ID
  source_track_id UUID := '4e281b8e-eaa2-429b-b29e-c3d05552a327'; -- Bern Weyermannshaus track 1
  dest_track_id UUID := '405cbf47-b787-4532-a348-8727d0f94728'; -- Bern Bümpliz track 3
  trip_id UUID;
  wagon_id UUID;
BEGIN
  -- First, get the ID of our test wagon (assuming it's the only one with number 'TEST-001')
  SELECT id INTO wagon_id FROM wagons 
  WHERE number = 'TEST-001' AND project_id = project_id;
  
  IF wagon_id IS NULL THEN
    RAISE EXCEPTION 'Test wagon not found. Please run create_test_wagon.sql first.';
  END IF;
  
  -- Create a unique trip ID
  trip_id := gen_random_uuid();
  
  -- Insert a test trip (internal movement)
  INSERT INTO trips (
    id,
    type,
    datetime,
    source_track_id,
    dest_track_id,
    project_id,
    is_planned,
    created_at,
    updated_at,
    has_conflicts
  ) VALUES (
    trip_id,
    'internal',
    NOW() + INTERVAL '1 day', -- Scheduled for tomorrow
    source_track_id,
    dest_track_id,
    project_id,
    true, -- Planned trip
    NOW(),
    NOW(),
    false
  );
  
  -- Link the wagon to the trip
  INSERT INTO trip_wagons (
    trip_id,
    wagon_id
  ) VALUES (
    trip_id,
    wagon_id
  );
  
  -- Output the result
  RAISE NOTICE 'Created test trip with ID: %', trip_id;
  RAISE NOTICE 'The trip will move wagon % from Bern Weyermannshaus to Bern Bümpliz', wagon_id;
  RAISE NOTICE 'The trip is scheduled for tomorrow and is in "planned" status';
END $$; 