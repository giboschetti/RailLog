-- Add current_track_id column to the wagons table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wagons' AND column_name = 'current_track_id'
  ) THEN
    ALTER TABLE wagons 
    ADD COLUMN current_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL;
    
    -- Create index for better query performance
    CREATE INDEX IF NOT EXISTS idx_wagons_current_track_id ON wagons(current_track_id);
    
    -- Add a comment to the column
    COMMENT ON COLUMN wagons.current_track_id IS 'The current track where the wagon is located';
    
    -- Update wagons to set current_track_id based on the last executed trip destination
    UPDATE wagons w
    SET current_track_id = (
      SELECT t.dest_track_id 
      FROM trips t
      JOIN trip_wagons tw ON t.id = tw.trip_id
      WHERE tw.wagon_id = w.id
      AND t.is_planned = false
      AND t.dest_track_id IS NOT NULL
      ORDER BY t.datetime DESC
      LIMIT 1
    )
    WHERE current_track_id IS NULL;
  END IF;
END
$$; 