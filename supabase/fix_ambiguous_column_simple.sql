-- Simplified fix for track display functions
-- This script addresses the "Failed to load track data" error with a simpler approach

BEGIN;

-- Update get_track_wagons_at_time function with a simplified approach
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
  -- Simple approach that focuses on reliability
  RETURN QUERY
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    (SELECT MIN(t.datetime) 
     FROM trips t 
     JOIN trip_wagons tw ON t.id = tw.trip_id 
     WHERE tw.wagon_id = w.id 
       AND t.dest_track_id = track_id_param
       AND t.type IN ('delivery', 'internal')
    ) AS arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM 
    wagons w
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id
  WHERE 
    w.current_track_id = track_id_param;
END;
$$;

-- Update the get_track_occupancy_at_time function to be ultra-reliable
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
    -- Get track details first
    SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
    
    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Track not found',
        'track_id', track_id_param
      );
    END IF;
    
    total_length := COALESCE(track_data.useful_length, 0);
    
    -- Calculate based on current wagon positions - very simple
    SELECT 
      COUNT(*),
      COALESCE(SUM(length), 0)
    INTO 
      wagon_count,
      occupied_length
    FROM 
      wagons
    WHERE 
      current_track_id = track_id_param;
    
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

-- Add a debug function to help troubleshoot wagon positions
CREATE OR REPLACE FUNCTION public.debug_current_track_wagons()
RETURNS TABLE(
  wagon_id uuid,
  number text,
  track_id uuid,
  track_name text,
  node_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id AS wagon_id,
    w.number,
    w.current_track_id AS track_id,
    t.name AS track_name,
    n.name AS node_name
  FROM
    wagons w
  JOIN
    tracks t ON w.current_track_id = t.id
  JOIN
    nodes n ON t.node_id = n.id
  WHERE
    w.current_track_id IS NOT NULL
  ORDER BY
    n.name, t.name, w.number;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Applied simplified approach to track display functions',
    'update_date', NOW()
  )
);

COMMIT; 