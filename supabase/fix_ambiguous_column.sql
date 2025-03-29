-- Fix for ambiguous column reference in track data functions
-- This script fixes the SQL error causing "Failed to load track data"

BEGIN;

-- Fix the get_track_wagons_at_time function with properly qualified column references
CREATE OR REPLACE FUNCTION public.get_track_wagons_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
)
RETURNS TABLE(
  wagon_id uuid, 
  number text, 
  length integer, 
  content text, 
  project_id uuid, 
  construction_site_id uuid, 
  type_id uuid, 
  arrival_time timestamp with time zone, 
  wagon_type text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  -- Use a simpler direct query with proper column qualification to avoid ambiguity
  RETURN QUERY
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    COALESCE(
      (SELECT MIN(t.datetime)
       FROM trips t
       JOIN trip_wagons tw ON t.id = tw.trip_id
       WHERE t.dest_track_id = track_id_param
         AND tw.wagon_id = w.id
         AND t.datetime <= time_point
         AND t.type IN ('delivery', 'internal')
      ),
      NOW()
    ) AS arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM 
    wagons w
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id
  WHERE 
    w.current_track_id = track_id_param
    AND EXISTS (
      -- Check if this wagon has arrived on this track by this time
      SELECT 1
      FROM trips t
      JOIN trip_wagons tw ON t.id = tw.trip_id
      WHERE t.dest_track_id = track_id_param 
        AND tw.wagon_id = w.id
        AND t.datetime <= time_point
        AND t.type IN ('delivery', 'internal')
    )
    AND NOT EXISTS (
      -- Check that the wagon hasn't departed from this track by this time
      SELECT 1
      FROM trips t
      JOIN trip_wagons tw ON t.id = tw.trip_id
      WHERE t.source_track_id = track_id_param
        AND tw.wagon_id = w.id
        AND t.datetime <= time_point
        AND t.datetime > (
          -- Get the latest arrival time to this track
          SELECT MAX(t2.datetime)
          FROM trips t2
          JOIN trip_wagons tw2 ON t2.id = tw2.trip_id
          WHERE t2.dest_track_id = track_id_param
            AND tw2.wagon_id = w.id
            AND t2.datetime <= time_point
            AND t2.type IN ('delivery', 'internal')
        )
        AND t.type IN ('departure', 'internal')
    );
END;
$$;

-- Fix the get_track_occupancy_at_time function with better error handling
CREATE OR REPLACE FUNCTION public.get_track_occupancy_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  track_data RECORD;
  total_length INTEGER;
  occupied_length INTEGER := 0;
  available_length INTEGER;
  wagon_count INTEGER := 0;
  result JSON;
BEGIN
  -- Add comprehensive error handling
  BEGIN
    -- Get track details
    SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
    
    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Track not found',
        'track_id', track_id_param
      );
    END IF;
    
    total_length := COALESCE(track_data.useful_length, 0);
    
    -- Calculate occupancy using explicitly qualified columns
    WITH track_wagons AS (
      SELECT 
        w.length
      FROM 
        get_track_wagons_at_time(track_id_param, time_point) AS gtw
      JOIN
        wagons w ON gtw.wagon_id = w.id
    )
    SELECT 
      COUNT(*),
      COALESCE(SUM(length), 0)
    INTO 
      wagon_count,
      occupied_length
    FROM 
      track_wagons;
    
    -- Calculate available length
    IF total_length > 0 THEN
      available_length := GREATEST(0, total_length - occupied_length);
    ELSE
      -- If track has no length limit (useful_length = 0), it has infinite capacity
      available_length := 9999999;
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
    -- Return a safe default in case of errors
    RETURN json_build_object(
      'success', false,
      'error', 'Error calculating occupancy: ' || SQLERRM,
      'track_id', track_id_param,
      'datetime', time_point,
      'total_length', COALESCE(total_length, 0),
      'occupied_length', 0,
      'available_length', COALESCE(total_length, 0),
      'wagon_count', 0
    );
  END;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_HOTFIX', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed ambiguous column reference in track display functions',
    'update_date', NOW()
  )
);

COMMIT; 