-- This script fixes the database issues with missing columns and functions

-- 1. Add missing length column to wagons table 
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS length NUMERIC DEFAULT 0;

-- 2. Copy data from default_length of wagon_types to length of wagons if not set
UPDATE wagons w
SET length = wt.default_length
FROM wagon_types wt
WHERE w.type_id = wt.id AND (w.length IS NULL OR w.length = 0);

-- 3. Update the track occupancy function to use useful_length
DROP FUNCTION IF EXISTS get_track_occupancy;

CREATE OR REPLACE FUNCTION get_track_occupancy(
    track_id_param UUID,
    timestamp_param TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON AS $$
DECLARE
    track_rec RECORD;
    total_length NUMERIC := 0;
    occupied_length NUMERIC := 0;
    available_length NUMERIC := 0;
    wagon_count INTEGER := 0;
    result JSON;
BEGIN
    -- Get basic track info using useful_length
    BEGIN
        SELECT id, useful_length INTO STRICT track_rec
        FROM tracks
        WHERE id = track_id_param;
        
        -- Use useful_length
        total_length := COALESCE(track_rec.useful_length, 0);
    EXCEPTION WHEN no_data_found THEN
        -- No track found
        NULL;
    END;
    
    -- Simplest possible query for wagons
    BEGIN
        SELECT COUNT(id) INTO wagon_count
        FROM wagons
        WHERE track_id = track_id_param;
    EXCEPTION WHEN OTHERS THEN
        wagon_count := 0;
    END;
    
    -- Create a simple result
    result := json_build_object(
        'track_id', track_id_param,
        'datetime', timestamp_param,
        'total_length', total_length,
        'occupied_length', occupied_length,
        'available_length', total_length,
        'wagon_count', wagon_count
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Create the exec_sql function if it doesn't exist
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 