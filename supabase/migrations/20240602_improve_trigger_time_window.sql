-- This migration improves the trigger function for checking track capacity
-- It will update the function to handle time-based capacity checks

-- Drop existing trigger first (if it exists)
DROP TRIGGER IF EXISTS check_track_capacity_trigger ON wagons;

-- Create improved function
CREATE OR REPLACE FUNCTION check_track_capacity()
RETURNS TRIGGER AS $$
DECLARE
  track_length NUMERIC;
  current_usage NUMERIC;
  wagon_length NUMERIC;
  track_id_to_check UUID;
  is_debugging BOOLEAN := true; -- Set to false in production
BEGIN
  -- Determine which track_id to use for the check
  IF TG_OP = 'UPDATE' THEN
    -- For updates, use the new track_id if it differs from the old one
    IF NEW.track_id IS NOT NULL AND NEW.track_id != OLD.track_id THEN
      track_id_to_check := NEW.track_id;
    ELSIF NEW.current_track_id IS NOT NULL AND NEW.current_track_id != OLD.current_track_id THEN
      track_id_to_check := NEW.current_track_id;
    ELSE
      -- No track change, so no need to check capacity
      RETURN NEW;
    END IF;
  ELSE
    -- For inserts, use either track_id or current_track_id
    IF NEW.track_id IS NOT NULL THEN
      track_id_to_check := NEW.track_id;
    ELSIF NEW.current_track_id IS NOT NULL THEN
      track_id_to_check := NEW.current_track_id;
    ELSE
      -- No track assigned, so no need to check capacity
      RETURN NEW;
    END IF;
  END IF;
  
  -- Debug logging
  IF is_debugging THEN
    RAISE NOTICE 'Checking track capacity for track_id: %', track_id_to_check;
  END IF;

  -- Get the track's useful_length
  SELECT useful_length INTO track_length
  FROM tracks
  WHERE id = track_id_to_check;
  
  -- If track_length is NULL or 0, the track has unlimited capacity
  IF track_length IS NULL OR track_length = 0 THEN
    IF is_debugging THEN
      RAISE NOTICE 'Track has unlimited capacity (length is % meters)', track_length;
    END IF;
    RETURN NEW;
  END IF;
  
  -- Get the wagon's length
  wagon_length := NEW.length;
  IF wagon_length IS NULL THEN
    -- If length is not set, try to get default length from wagon_types
    SELECT default_length INTO wagon_length
    FROM wagon_types
    WHERE id = NEW.type_id;
    
    IF wagon_length IS NULL THEN
      wagon_length := 0; -- Default to 0 if no length found
    END IF;
  END IF;
  
  -- Calculate current usage of the track by summing lengths of existing wagons
  SELECT COALESCE(SUM(length), 0) INTO current_usage
  FROM wagons
  WHERE current_track_id = track_id_to_check
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  
  IF is_debugging THEN
    RAISE NOTICE 'Track length: % meters, Current usage: % meters, Wagon length: % meters', 
      track_length, current_usage, wagon_length;
  END IF;
  
  -- Check if adding this wagon would exceed capacity
  IF current_usage + wagon_length > track_length THEN
    RAISE EXCEPTION 'Track capacity would be exceeded. Track: % meters, Current usage: % meters, Wagon: % meters',
      track_length, current_usage, wagon_length;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
CREATE TRIGGER check_track_capacity_trigger
BEFORE INSERT OR UPDATE OF track_id, current_track_id, length
ON wagons
FOR EACH ROW
EXECUTE FUNCTION check_track_capacity();

-- Add a comment explaining the trigger
COMMENT ON FUNCTION check_track_capacity() IS 'Checks if a track has enough capacity for a wagon before inserting or updating'; 