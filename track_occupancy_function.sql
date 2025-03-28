-- Drop the function if it exists
DROP FUNCTION IF EXISTS get_track_occupancy;

-- Create a simplified function that only uses useful_length
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
    
    -- Calculate occupied length from wagons on this track
    BEGIN
        SELECT COUNT(id), COALESCE(SUM(length), 0) 
        INTO wagon_count, occupied_length
        FROM wagons
        WHERE track_id = track_id_param;
    EXCEPTION WHEN OTHERS THEN
        wagon_count := 0;
        occupied_length := 0;
    END;
    
    -- Calculate available length
    IF total_length > 0 THEN
        available_length := GREATEST(0, total_length - occupied_length);
    ELSE
        -- If track has no length limit (useful_length = 0), it has infinite capacity
        available_length := 9999999;
    END IF;
    
    -- Create a simple result
    result := json_build_object(
        'track_id', track_id_param,
        'datetime', timestamp_param,
        'total_length', total_length,
        'occupied_length', occupied_length,
        'available_length', available_length,
        'wagon_count', wagon_count
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql; 