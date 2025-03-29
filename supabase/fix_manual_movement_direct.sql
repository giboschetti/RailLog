-- Direct fix for manual movement timestamp
-- This script directly updates the specific manual movement record

-- First, identify the problem record (the one showing 29.03.2025)
-- We need to update this record with the correct trip date (20.07.2025 18:00)

-- Find and update the manual movement record
UPDATE wagon_trajectories 
SET 
  timestamp = '2025-07-20 18:00:00+02'::timestamptz,
  updated_at = NOW()
WHERE 
  move_type = 'manual' 
  AND timestamp::date = '2025-03-29'::date;

-- Alternative more general approach (if we need to fix all manual movements):
-- This will match manual movements to their trips based on the track and wagon info
UPDATE wagon_trajectories wt 
SET 
  timestamp = t.datetime,
  trip_id = t.id,
  updated_at = NOW() 
FROM trips t
JOIN trip_wagons tw ON t.id = tw.trip_id AND tw.wagon_id = wt.wagon_id
WHERE 
  wt.move_type = 'manual'
  AND ((wt.previous_track_id = t.source_track_id AND wt.track_id = t.dest_track_id) 
       OR (wt.track_id = t.dest_track_id AND wt.previous_track_id IS NOT NULL));

-- Add audit log entry
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'DATA_FIX', 
  'wagon_trajectories', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Direct fix for manual movement timestamps',
    'fix_date', NOW()
  )
); 