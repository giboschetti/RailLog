-- Update the get_track_occupancy_at_time function to fix ambiguous column references
CREATE OR REPLACE FUNCTION public.get_track_occupancy_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
  track_data RECORD;
  total_length INTEGER;
  occupied_length INTEGER := 0;
  available_length INTEGER;
  wagon_count INTEGER := 0;
  result JSON;
BEGIN
  -- Get track details
  BEGIN
    SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
    
    IF NOT FOUND THEN
      RAISE NOTICE 'Track not found: %', track_id_param;
      RETURN json_build_object(
        'success', false,
        'error', 'Track not found',
        'track_id', track_id_param
      );
    END IF;
    
    -- Calculate occupancy based on wagons at the given time
    BEGIN
      total_length := COALESCE(track_data.useful_length, 0);
      
      -- Use a simpler approach to get wagon lengths
      WITH track_wagons AS (
        SELECT 
          gtw.wagon_id AS tw_wagon_id,
          w.length
        FROM
          get_track_wagons_at_time(track_id_param, time_point) AS gtw
        JOIN
          wagons w ON gtw.wagon_id = w.id
      )
      SELECT 
        COUNT(*),
        COALESCE(SUM(tw.length), 0)
      INTO 
        wagon_count,
        occupied_length
      FROM 
        track_wagons tw;
      
      RAISE NOTICE 'Track % has % wagons with total length %m at time %', 
                   track_id_param, wagon_count, occupied_length, time_point;
      
      -- Calculate available length
      IF total_length > 0 THEN
        available_length := GREATEST(0, total_length - occupied_length);
      ELSE
        available_length := 9999999; -- Infinite capacity
      END IF;
      
      -- Create result object
      result := json_build_object(
        'success', true,
        'track_id', track_id_param,
        'track_name', track_data.name,
        'node_id', track_data.node_id,
        'total_length', total_length,
        'occupied_length', occupied_length,
        'available_length', available_length,
        'usage_percentage', CASE WHEN total_length > 0 THEN (occupied_length::float / total_length * 100) ELSE 0 END,
        'wagon_count', wagon_count,
        'datetime', time_point
      );
      
      RETURN result;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error calculating occupancy: %', SQLERRM;
      RETURN json_build_object(
        'success', false,
        'error', 'Error calculating occupancy: ' || SQLERRM,
        'track_id', track_id_param,
        'track_name', track_data.name,
        'total_length', total_length,
        'occupied_length', 0,
        'available_length', total_length,
        'wagon_count', 0
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Unexpected error: %', SQLERRM;
    RETURN json_build_object(
      'success', false,
      'error', 'Unexpected error: ' || SQLERRM,
      'track_id', track_id_param
    );
  END;
END;
$function$; 