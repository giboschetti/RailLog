-- Check if current_track_id column exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'wagons' AND column_name = 'current_track_id'
) INTO current_track_id_exists;

-- Add current_track_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'current_track_id'
  ) THEN
    -- Add the current_track_id column if it doesn't exist
    ALTER TABLE wagons ADD COLUMN current_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL;
    
    -- Migrate data from track_id (if it exists) to current_track_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'wagons' AND column_name = 'track_id'
    ) THEN
      UPDATE wagons SET current_track_id = track_id WHERE track_id IS NOT NULL;
    END IF;
  END IF;

  -- Check if temp_id column exists, and add it if it doesn't
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'temp_id'
  ) THEN
    -- Add the temp_id column if it doesn't exist
    ALTER TABLE wagons ADD COLUMN temp_id UUID DEFAULT gen_random_uuid();
    
    -- Populate temp_id for all existing wagons
    UPDATE wagons SET temp_id = gen_random_uuid() WHERE temp_id IS NULL;
  END IF;

  -- Check if number column exists, and add it if it doesn't
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'number'
  ) THEN
    -- Add the number column if it doesn't exist (assuming this is what external_id should be called)
    ALTER TABLE wagons ADD COLUMN number TEXT;
    
    -- If external_id exists, migrate data from external_id to number
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'wagons' AND column_name = 'external_id'
    ) THEN
      UPDATE wagons SET number = external_id WHERE external_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- 1. Update any NULL temp_id values with new UUIDs
UPDATE wagons 
SET temp_id = gen_random_uuid() 
WHERE temp_id IS NULL;

-- 2. Fix the function that has the COALESCE error with integer vs UUID
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

-- Fix the trip update function
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

-- If we're dealing with both track_id and current_track_id, let's keep them in sync
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'track_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'current_track_id'
  ) THEN
    -- Create a function to keep track_id and current_track_id in sync
    CREATE OR REPLACE FUNCTION sync_wagon_track_ids()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- For INSERT, OLD might not exist
        IF TG_OP = 'INSERT' THEN
          IF NEW.current_track_id IS NOT NULL AND NEW.track_id IS NULL THEN
            NEW.track_id = NEW.current_track_id;
          ELSIF NEW.track_id IS NOT NULL AND NEW.current_track_id IS NULL THEN
            NEW.current_track_id = NEW.track_id;
          END IF;
        -- For UPDATE, check what changed
        ELSE
          IF NEW.current_track_id IS DISTINCT FROM OLD.current_track_id THEN
            NEW.track_id = NEW.current_track_id;
          ELSIF NEW.track_id IS DISTINCT FROM OLD.track_id THEN
            NEW.current_track_id = NEW.track_id;
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Add trigger to keep them in sync
    DROP TRIGGER IF EXISTS sync_wagon_tracks ON wagons;
    CREATE TRIGGER sync_wagon_tracks
    BEFORE INSERT OR UPDATE ON wagons
    FOR EACH ROW
    EXECUTE FUNCTION sync_wagon_track_ids();
  END IF;
END $$; 