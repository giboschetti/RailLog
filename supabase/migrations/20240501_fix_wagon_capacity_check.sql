-- Update the check_track_capacity function to check both track_id and current_track_id
CREATE OR REPLACE FUNCTION check_track_capacity()
RETURNS TRIGGER AS $$
DECLARE
  track_length INTEGER;
  current_usage INTEGER;
  check_track_id UUID;
BEGIN
  -- Determine which track ID to use for capacity check
  IF NEW.track_id IS NOT NULL THEN
    check_track_id := NEW.track_id;
  ELSIF NEW.current_track_id IS NOT NULL THEN
    check_track_id := NEW.current_track_id;
  ELSE
    -- If neither track_id nor current_track_id is provided, no check needed
    RETURN NEW;
  END IF;
  
  -- Get track length (using useful_length from tracks table)
  SELECT useful_length INTO track_length FROM tracks WHERE id = check_track_id;
  
  -- Skip check if track has unlimited capacity (useful_length = 0)
  IF track_length = 0 THEN
    RETURN NEW;
  END IF;
  
  -- Calculate current usage (excluding this wagon if it's an update)
  -- Use current_track_id for the calculation
  SELECT COALESCE(SUM(length), 0) INTO current_usage 
  FROM wagons 
  WHERE current_track_id = check_track_id 
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  -- Add debug logging
  RAISE NOTICE 'Track capacity check for track %, length: %, current usage: %, new wagon length: %', 
    check_track_id, track_length, current_usage, NEW.length;
  
  -- Check if adding this wagon would exceed capacity
  IF (current_usage + NEW.length) > track_length THEN
    RAISE EXCEPTION 'Adding this wagon would exceed track capacity (available: %, required: %)', 
      (track_length - current_usage), NEW.length;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is correctly set up
DROP TRIGGER IF EXISTS check_wagon_capacity ON wagons;

CREATE TRIGGER check_wagon_capacity 
BEFORE INSERT OR UPDATE ON wagons
FOR EACH ROW 
EXECUTE FUNCTION check_track_capacity(); 