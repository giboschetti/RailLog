-- Migration to fix the issue with wagon duplication during drag and drop
-- The problem is that the prevent_duplicate_wagon_placement trigger is not working correctly
-- because it's only triggered when the wagon number changes, but we need to check whenever
-- the current_track_id changes as well.

-- Drop the existing triggers
DROP TRIGGER IF EXISTS check_duplicate_wagon_on_insert ON wagons;
DROP TRIGGER IF EXISTS check_duplicate_wagon_on_update ON wagons;

-- Improved function to prevent duplicate wagon placement
CREATE OR REPLACE FUNCTION prevent_duplicate_wagon_placement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if this wagon has a number (wagons without numbers are allowed to be duplicated)
  IF NEW.number IS NOT NULL THEN
    -- Check if the same wagon number already exists on a different track
    IF EXISTS (
      SELECT 1 FROM wagons 
      WHERE id != NEW.id 
      AND number = NEW.number
      AND current_track_id IS NOT NULL
      AND current_track_id != COALESCE(NEW.current_track_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ) THEN
      RAISE EXCEPTION 'Der Waggon (%) befindet sich bereits auf einem anderen Gleis', NEW.number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger for wagon insert - same as before
CREATE TRIGGER check_duplicate_wagon_on_insert
BEFORE INSERT ON wagons
FOR EACH ROW
WHEN (NEW.number IS NOT NULL)
EXECUTE FUNCTION prevent_duplicate_wagon_placement();

-- Create the fixed trigger for wagon update
-- Now triggers on ANY update, not just number changes
CREATE TRIGGER check_duplicate_wagon_on_update
BEFORE UPDATE ON wagons
FOR EACH ROW
WHEN (NEW.number IS NOT NULL)
EXECUTE FUNCTION prevent_duplicate_wagon_placement();

-- Create a new function to check duplicate wagons in trips
CREATE OR REPLACE FUNCTION prevent_duplicate_wagon_in_trip()
RETURNS TRIGGER AS $$
DECLARE
  wagon_number TEXT;
  source_track_id UUID;
  dest_track_id UUID;
BEGIN
  -- Get the wagon number
  SELECT number INTO wagon_number FROM wagons WHERE id = NEW.wagon_id;
  
  -- Only proceed if the wagon has a number
  IF wagon_number IS NOT NULL THEN
    -- Get the source and destination track IDs for this trip
    SELECT t.source_track_id, t.dest_track_id 
    INTO source_track_id, dest_track_id
    FROM trips t
    WHERE t.id = NEW.trip_id;
    
    -- Check if the same wagon number is already on the destination track
    IF EXISTS (
      SELECT 1 FROM wagons 
      WHERE id != NEW.wagon_id 
      AND number = wagon_number
      AND current_track_id = dest_track_id
    ) THEN
      RAISE EXCEPTION 'Der Waggon (%) befindet sich bereits auf dem Zielgleis', wagon_number;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger for trip_wagons insert
CREATE TRIGGER check_duplicate_wagon_on_trip_insert
BEFORE INSERT ON trip_wagons
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_wagon_in_trip(); 