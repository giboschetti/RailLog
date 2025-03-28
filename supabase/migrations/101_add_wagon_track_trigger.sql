-- Create or replace the function to update wagon locations after a trip is created or updated
CREATE OR REPLACE FUNCTION update_wagon_location_after_trip()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if this is an executed trip (not planned) and has a destination track
  IF NOT NEW.is_planned AND NEW.dest_track_id IS NOT NULL THEN
    -- Update the current_track_id for all wagons in this trip
    UPDATE wagons
    SET current_track_id = NEW.dest_track_id
    WHERE id IN (
      SELECT wagon_id FROM trip_wagons WHERE trip_id = NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS update_wagon_location_on_trip ON trips;

-- Create the trigger for trip insert or update
CREATE TRIGGER update_wagon_location_on_trip
AFTER INSERT OR UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION update_wagon_location_after_trip();

-- Create a function to prevent duplicate wagon placement
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

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS check_duplicate_wagon_on_insert ON wagons;
DROP TRIGGER IF EXISTS check_duplicate_wagon_on_update ON wagons;

-- Create the trigger for wagon insert
CREATE TRIGGER check_duplicate_wagon_on_insert
BEFORE INSERT ON wagons
FOR EACH ROW
WHEN (NEW.number IS NOT NULL)
EXECUTE FUNCTION prevent_duplicate_wagon_placement();

-- Create the trigger for wagon update
CREATE TRIGGER check_duplicate_wagon_on_update
BEFORE UPDATE ON wagons
FOR EACH ROW
WHEN (NEW.number IS NOT NULL AND (OLD.number IS NULL OR OLD.number != NEW.number))
EXECUTE FUNCTION prevent_duplicate_wagon_placement(); 