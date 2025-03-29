-- Create function to automatically set is_planned based on trip datetime
CREATE OR REPLACE FUNCTION auto_update_trip_planned_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Set is_planned based on datetime compared to now
  -- If trip datetime is in the future, it's planned
  -- If trip datetime is in the past or present, it's executed
  NEW.is_planned := NEW.datetime > NOW();
  
  -- Log for debugging
  RAISE NOTICE 'Trip % status auto-set to is_planned=%', NEW.id, NEW.is_planned;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run the function before insert or update
DROP TRIGGER IF EXISTS set_trip_planned_status ON trips;

CREATE TRIGGER set_trip_planned_status
BEFORE INSERT OR UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION auto_update_trip_planned_status();

-- Create a function to update all trips daily
CREATE OR REPLACE FUNCTION update_all_trip_planned_statuses()
RETURNS void AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update all trips where the datetime has passed but is_planned is still true
  UPDATE trips
  SET 
    is_planned = false,
    updated_at = NOW()
  WHERE 
    datetime <= NOW() 
    AND is_planned = true;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % trips from planned to executed based on datetime', updated_count;
END;
$$ LANGUAGE plpgsql;

-- Create or replace scheduled job to run daily (you would need to use pgAgent or another scheduler)
-- This is just a sample of what the job would look like
-- You would need to set this up using your scheduling system
/*
SELECT cron.schedule(
  'daily-trip-status-update',  -- job name
  '0 0 * * *',                -- cron schedule (midnight every day)
  $$SELECT update_all_trip_planned_statuses()$$
);
*/

-- One-time update to fix existing data
DO $$
DECLARE
  updated_trips INTEGER;
BEGIN
  -- Update all trip statuses based on datetime
  UPDATE trips
  SET 
    is_planned = (datetime > NOW()),
    updated_at = NOW();
  
  GET DIAGNOSTICS updated_trips = ROW_COUNT;
  RAISE NOTICE 'Updated % existing trips to match their datetime-based status', updated_trips;
END $$;

-- Add function to automatically update current_track_id when trips are inserted or updated
CREATE OR REPLACE FUNCTION ensure_wagon_track_updated_after_trip()
RETURNS TRIGGER AS $$
BEGIN
  -- Update for all trips with a destination track, regardless of planned status
  IF NEW.dest_track_id IS NOT NULL THEN
    -- Log the trip we're processing
    RAISE NOTICE 'Ensuring wagon locations for trip % (planned status: %)', NEW.id, NEW.is_planned;
    
    -- Check for any wagons that need their current_track_id updated
    UPDATE wagons
    SET 
      current_track_id = NEW.dest_track_id,
      updated_at = NOW()
    WHERE 
      id IN (SELECT wagon_id FROM trip_wagons WHERE trip_id = NEW.id)
      AND (current_track_id IS NULL OR current_track_id != NEW.dest_track_id);
    
    -- Log how many wagons were updated
    RAISE NOTICE 'Trip %: Ensured wagon locations on track %', NEW.id, NEW.dest_track_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure this trigger runs AFTER is_planned is set by auto_update_trip_planned_status
DROP TRIGGER IF EXISTS ensure_wagon_track_updated_after_trip ON trips;

CREATE TRIGGER ensure_wagon_track_updated_after_trip
AFTER INSERT OR UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION ensure_wagon_track_updated_after_trip();

-- One-time update to fix existing data for ALL trips
DO $$
DECLARE
  updated_wagons INTEGER := 0;
BEGIN
  -- Update all wagons for all trips (both planned and executed)
  UPDATE wagons
  SET 
    current_track_id = trips.dest_track_id,
    updated_at = NOW()
  FROM 
    trip_wagons 
  JOIN 
    trips ON trip_wagons.trip_id = trips.id
  WHERE 
    wagons.id = trip_wagons.wagon_id
    AND trips.dest_track_id IS NOT NULL
    AND (wagons.current_track_id IS NULL OR wagons.current_track_id != trips.dest_track_id);
  
  GET DIAGNOSTICS updated_wagons = ROW_COUNT;
  RAISE NOTICE 'Updated current_track_id for % wagons across all trips', updated_wagons;
END $$; 