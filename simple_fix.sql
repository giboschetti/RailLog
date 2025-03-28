-- Create the fixed function to avoid the COALESCE type mismatch
CREATE OR REPLACE FUNCTION prevent_duplicate_wagon_placement()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if this wagon has a number (wagons without numbers are allowed to be duplicated)
  IF NEW.number IS NOT NULL THEN
    -- Here we use proper UUID type instead of integer -1
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