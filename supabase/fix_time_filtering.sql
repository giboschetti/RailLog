-- Fix for time-based wagon display on tracks
-- This script ensures wagons do not appear before their delivery date

BEGIN;

-- Update the get_track_wagons_at_time function with stricter time filtering
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
DECLARE
  current_time TIMESTAMPTZ := NOW();
BEGIN
  -- Use a simple, direct query with proper time filtering
  RETURN QUERY
  WITH first_arrival AS (
    -- Find the first arrival of each wagon on this track
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS arrival_time,
      t.dest_track_id
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.dest_track_id = track_id_param
      AND t.type IN ('delivery', 'internal')
    ORDER BY 
      tw.wagon_id, t.datetime ASC
  ),
  latest_departure AS (
    -- Find the latest departure of each wagon from this track before the time_point
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS departure_time
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.source_track_id = track_id_param
      AND t.type IN ('departure', 'internal')
      AND t.datetime <= time_point
    ORDER BY 
      tw.wagon_id, t.datetime DESC
  )
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    fa.arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM 
    wagons w
  JOIN 
    first_arrival fa ON w.id = fa.wagon_id
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id
  LEFT JOIN 
    latest_departure ld ON w.id = ld.wagon_id
  WHERE 
    -- Only include wagons where:
    -- 1. Arrival time is before or at the requested time_point
    fa.arrival_time <= time_point
    -- 2. Either there's no departure record, or the latest departure happened after their arrival
    AND (ld.wagon_id IS NULL OR ld.departure_time > fa.arrival_time);
END;
$$;

-- Update the get_track_occupancy_at_time function to use this new time-filtered approach
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
    
    -- Calculate occupancy based on time-aware wagons
    SELECT 
      COUNT(wagon_id),
      COALESCE(SUM(length), 0)
    INTO 
      wagon_count,
      occupied_length
    FROM get_track_wagons_at_time(track_id_param, time_point);
    
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
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Improved time-based filtering to ensure wagons don''t appear before delivery date',
    'update_date', NOW()
  )
);

COMMIT; 