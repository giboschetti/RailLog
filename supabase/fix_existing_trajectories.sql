-- Fix existing wagon_trajectories that are missing trip_id or have incorrect timestamps
-- This script updates existing records to ensure proper connection to trips

BEGIN;

-- First, create a function to handle the update
CREATE OR REPLACE FUNCTION public.fix_trajectory_records()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
  no_trip_count INTEGER := 0;
  fixed_trajectories TEXT;
BEGIN
  -- Update wagon_trajectories with missing trip_id values
  -- We'll use trip_wagons to find the connection between wagons and trips
  -- First, count how many records will be updated
  WITH trips_with_wagons AS (
    SELECT 
      t.id as trip_id,
      t.datetime as trip_datetime,
      t.type as trip_type,
      t.dest_track_id,
      t.source_track_id,
      tw.wagon_id
    FROM 
      trips t
      JOIN trip_wagons tw ON t.id = tw.trip_id
  ),
  trajectories_to_update AS (
    SELECT 
      wt.id as trajectory_id,
      wt.wagon_id,
      wt.track_id,
      tww.trip_id,
      tww.trip_datetime,
      tww.trip_type,
      wt.timestamp as current_timestamp
    FROM 
      wagon_trajectories wt
      JOIN trips_with_wagons tww ON wt.wagon_id = tww.wagon_id
    WHERE 
      -- Only update trajectories that are missing trip_id
      (wt.trip_id IS NULL OR
      -- Or have timestamps that don't match their trip datetime
      (wt.trip_id IS NOT NULL AND wt.timestamp <> tww.trip_datetime))
      -- And the track matches the destination track of the trip
      AND wt.track_id = tww.dest_track_id
  )
  SELECT COUNT(*) INTO updated_count FROM trajectories_to_update;
  
  -- Now perform the update without trying to return values
  WITH trips_with_wagons AS (
    SELECT 
      t.id as trip_id,
      t.datetime as trip_datetime,
      t.type as trip_type,
      t.dest_track_id,
      t.source_track_id,
      tw.wagon_id
    FROM 
      trips t
      JOIN trip_wagons tw ON t.id = tw.trip_id
  ),
  trajectories_to_update AS (
    SELECT 
      wt.id as trajectory_id,
      wt.wagon_id,
      wt.track_id,
      tww.trip_id,
      tww.trip_datetime,
      tww.trip_type,
      wt.timestamp as current_timestamp
    FROM 
      wagon_trajectories wt
      JOIN trips_with_wagons tww ON wt.wagon_id = tww.wagon_id
    WHERE 
      -- Only update trajectories that are missing trip_id
      (wt.trip_id IS NULL OR
      -- Or have timestamps that don't match their trip datetime
      (wt.trip_id IS NOT NULL AND wt.timestamp <> tww.trip_datetime))
      -- And the track matches the destination track of the trip
      AND wt.track_id = tww.dest_track_id
  )
  UPDATE wagon_trajectories wt
  SET 
    trip_id = tu.trip_id,
    timestamp = tu.trip_datetime,
    move_type = CASE
      WHEN tu.trip_type = 'internal' THEN 'internal'
      WHEN tu.trip_type = 'delivery' THEN 'delivery'
      WHEN tu.trip_type = 'departure' THEN 'departure'
      ELSE move_type
    END,
    updated_at = NOW()
  FROM trajectories_to_update tu
  WHERE wt.id = tu.trajectory_id;
  
  -- Count the number of trajectories that still have no trip_id
  SELECT COUNT(*) INTO no_trip_count
  FROM wagon_trajectories
  WHERE trip_id IS NULL;
  
  fixed_trajectories := 'Updated ' || updated_count || ' trajectory records. ' || 
                       no_trip_count || ' records still lack trip connections.';
  
  RETURN fixed_trajectories;
END;
$$;

-- Execute the function to fix existing records
SELECT fix_trajectory_records();

-- Add audit log entry for this update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'wagon_trajectories', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed existing wagon trajectory records to connect with trips',
    'update_date', NOW()
  )
);

-- Now drop the temporary function
DROP FUNCTION IF EXISTS public.fix_trajectory_records();

COMMIT; 