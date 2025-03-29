-- SQL script to add a test wagon to the Bern Cluster 2025 project
-- This can be run after the cleanup to test the functionality

-- Define variables
DO $$
DECLARE
  project_id UUID := '49217582-5dcc-4c24-90fe-f6893b4e981e'; -- Bern Cluster 2025 project ID
  track_id UUID := '4e281b8e-eaa2-429b-b29e-c3d05552a327'; -- Bern Weyermannshaus track 1
  wagon_type_id UUID := '6a082861-5734-4b1f-bce2-12015d929738'; -- Res wagon type
  construction_site_id UUID := '5719c33b-a5f9-49f2-89bc-2e7488837ed6'; -- Bern West construction site
  new_wagon_id UUID;
BEGIN
  -- Insert a test wagon
  INSERT INTO wagons (
    id,
    number,
    type_id,
    length,
    content,
    project_id,
    current_track_id,
    construction_site_id
  ) VALUES (
    gen_random_uuid(),
    'TEST-001',
    wagon_type_id,
    20, -- Length in meters (matches the Res type)
    'Test wagon for delivery',
    project_id,
    track_id, -- Initial location
    construction_site_id
  ) RETURNING id INTO new_wagon_id;
  
  -- Output the result
  RAISE NOTICE 'Created test wagon with ID: %', new_wagon_id;
  RAISE NOTICE 'The wagon is located at Bern Weyermannshaus track 1';
END $$; 