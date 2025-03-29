# Bern Cluster 2025 Project - Testing Guide

This guide will help you reset the "Bern Cluster 2025" project to a clean state and then test the app's functionality with new data.

## Project Structure

The Bern Cluster 2025 project includes the following nodes and tracks:

**Nodes:**
- Bern Weyermannshaus (station)
- Bern Bümpliz (station)
- Bern West (construction site)
- Flamatt (construction site)

**Tracks:**
- Bern Weyermannshaus: Track 1 (300m)
- Bern Bümpliz: Track 3 (150m)
- Bern West: Track 5 (480m)
- Flamatt: Track 800 (600m)

## Step 1: Clean the Project Data

1. Open the Supabase Dashboard and go to the SQL Editor
2. Copy the contents of `clean_bern_cluster_project.sql` into the SQL Editor
3. Run the SQL script to remove all existing wagons, trips, and restrictions

This script will:
- Delete all restrictions for the project
- Delete all trips and their wagon associations
- Delete all wagons associated with the project
- Keep the project structure (nodes and tracks) intact

## Step 2: Add a Test Wagon

1. Open the Supabase Dashboard and go to the SQL Editor
2. Copy the contents of `create_test_wagon.sql` into the SQL Editor
3. Run the SQL script to add a test wagon

This will create a new test wagon with the following properties:
- Number: TEST-001
- Type: Res (20m length)
- Location: Bern Weyermannshaus Track 1
- Construction Site: Bern West

## Step 3: Add a Test Trip

1. Open the Supabase Dashboard and go to the SQL Editor
2. Copy the contents of `create_test_trip.sql` into the SQL Editor
3. Run the SQL script to add a test trip

This will create a new planned trip for tomorrow that will move the test wagon from Bern Weyermannshaus to Bern Bümpliz.

## Step 4: Test the Application

Now you can test the application's functionality with the clean project:

1. Go to your Rail Log application
2. Navigate to the Bern Cluster 2025 project
3. You should see the test wagon on Bern Weyermannshaus Track 1
4. You should see a planned trip for tomorrow

You can now continue testing by:
- Creating additional wagons through the UI
- Moving wagons between tracks using drag and drop
- Creating new trips at different hours in the same day
- Testing that wagons can't be moved within the same hour, but can move at different hours
- Adding restrictions and testing their impact on trip planning

## Troubleshooting

If you encounter issues:
- Check that the project ID in the SQL scripts matches your Bern Cluster 2025 project ID
- Verify that the track IDs and node IDs are correct
- Look for any error messages in the browser console
- Check that RLS (Row Level Security) is properly set up in Supabase

Remember that if you need to start over, you can run the `clean_bern_cluster_project.sql` script again to reset the project data. 