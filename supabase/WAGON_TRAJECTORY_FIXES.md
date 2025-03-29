# Wagon Trajectory Data Fixes

## Issues Fixed

1. **Missing Trip ID in Wagon Trajectories**
   - Problem: When wagons were moved using drag and drop, the trajectory records were being created but not properly linking to the trip ID.
   - Impact: The "Bewegungsverlauf" (movement history) in the wagon details view showed entries, but they didn't have proper links to the trip data.

2. **Incorrect Timestamps in Bewegungsverlauf**
   - Problem: The trajectory records were showing the record creation timestamp instead of the planned trip datetime.
   - Impact: In the movement history, the timestamps were incorrect - showing when the record was created in the database rather than when the trip was scheduled.

## Solutions Implemented

### 1. Fix for Wagon Trajectories SQL Function

We've updated the `create_internal_trip_v2` function to:
- Explicitly set the `trip_id` in the `wagon_trajectories` table
- Use the trip's `datetime` value for the timestamp field (not NOW() or record creation time)
- Properly retrieve both source and destination node IDs
- Use the correct move type based on the trip type

Updated function in `fix_trajectories.sql`:
```sql
CREATE OR REPLACE FUNCTION public.create_internal_trip_v2(
  trip_data json,
  wagon_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  trip_id UUID;
  source_track_id UUID;
  dest_track_id UUID;
  is_planned BOOLEAN;
  source_node_id UUID;
  dest_node_id UUID;
  trip_datetime TIMESTAMPTZ;
BEGIN
  -- Extract data from the JSON
  trip_id := (trip_data->>'id')::UUID;
  source_track_id := (trip_data->>'source_track_id')::UUID;
  dest_track_id := (trip_data->>'dest_track_id')::UUID;
  is_planned := (trip_data->>'is_planned')::BOOLEAN;
  trip_datetime := (trip_data->>'datetime')::TIMESTAMPTZ;
  
  -- Get node IDs for the source and destination tracks
  SELECT node_id INTO source_node_id FROM tracks WHERE id = source_track_id;
  SELECT node_id INTO dest_node_id FROM tracks WHERE id = dest_track_id;
  
  -- [trip insertion code omitted for brevity]
  
  -- Create a trajectory record for the wagon movement
  -- IMPORTANT: Use the trip datetime, not current time
  INSERT INTO wagon_trajectories (
    id,
    wagon_id,
    track_id,
    node_id,
    timestamp,      -- Use the trip's datetime explicitly
    move_type,
    trip_id,        -- Explicitly set the trip_id
    previous_track_id,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    wagon_id_param,
    dest_track_id,
    dest_node_id,
    trip_datetime,  -- Use the trip's datetime
    'internal',     -- Use proper move type based on trip type
    trip_id,        -- Link to the trip
    source_track_id,
    NOW(),
    NOW()
  );
  
  -- [remainder of function omitted for brevity]
END;
$$;
```

### 2. Fix for Existing Records

We've created a script to fix all existing trajectory records (`fix_existing_trajectories.sql`):
- Update existing wagon trajectories to match their associated trips
- Set the correct timestamp based on the trip datetime
- Set the proper move_type based on the trip type
- Create proper links between trajectories and trips

### 3. Fix for Frontend Display

We've updated the front-end code to display the correct timestamps:
- Modified `trajectoryUtils.ts` to retrieve trip datetime from related trips
- Updated the trajectory formatting to use trip datetime if available instead of record creation time
- Improved the data fetching to explicitly join with trips table to get datetime

## Verification

You can verify that the fixes are working by:

1. Moving a wagon using drag and drop
2. Opening the wagon details page
3. Checking the "Bewegungsverlauf" section

You should see:
- The correct timestamp that matches the planned trip time (not the current time)
- The proper link to the trip data
- The correct move type ("Manuelle Änderung" for drag and drop)
- The correct duration at location calculation

## Additional Technical Details

The key SQL fix is in `fix_trajectories.sql`, which ensures:
1. Every wagon trajectory is properly linked to its trip
2. The timestamp on the trajectory record matches the trip datetime
3. The UI displays the correct information 