-- Fix Track Display UI Issues - Debug Version
-- This script creates simplified functions with better error handling

BEGIN;

-- 1. First create a simplified get_track_wagons_at_time function
DROP FUNCTION IF EXISTS public.get_track_wagons_at_time(uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_track_wagons_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
)
RETURNS TABLE (
  wagon_id uuid,
  number text,
  length integer,
  content text,
  project_id uuid,
  construction_site_id uuid,
  type_id uuid,
  position integer,
  wagon_type text
)
LANGUAGE plpgsql
AS $$
DECLARE
  track_exists boolean;
BEGIN
  -- First check if the track exists
  SELECT EXISTS(SELECT 1 FROM tracks WHERE id = track_id_param) INTO track_exists;
  
  IF NOT track_exists THEN
    RAISE NOTICE 'Track with ID % not found', track_id_param;
    RETURN;
  END IF;
  
  -- Simply return wagons on this track with basic position
  RETURN QUERY
  SELECT 
    w.id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    ROW_NUMBER() OVER (ORDER BY w.id)::integer * 10 AS position, -- Simple position calculation
    wt.name AS wagon_type
  FROM 
    wagons w
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id
  WHERE
    w.current_track_id = track_id_param;
    
  RAISE NOTICE 'Track % wagons query completed', track_id_param;
END;
$$;

-- 2. Create a simplified occupancy function
DROP FUNCTION IF EXISTS public.get_track_occupancy_at_time(uuid, timestamp with time zone);

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
    
    -- Calculate basic occupancy from current_track_id
    BEGIN
      total_length := COALESCE(track_data.useful_length, 0);
      
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
      
      RAISE NOTICE 'Track % has % wagons with total length %m', track_id_param, wagon_count, occupied_length;
      
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
$$;

-- 3. Create a simple function to get all wagons with their current tracks
DROP FUNCTION IF EXISTS public.get_all_wagons_at_time(timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_all_wagons_at_time(
  time_point timestamp with time zone
)
RETURNS TABLE (
  wagon_id uuid,
  track_id uuid,
  track_name text,
  node_id uuid,
  node_name text,
  number text,
  wagon_length integer,
  content text,
  project_id uuid,
  construction_site_id uuid,
  type_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'Getting all wagon locations at %', time_point;
  
  RETURN QUERY
  SELECT
    w.id AS wagon_id,
    w.current_track_id AS track_id,
    t.name AS track_name,
    t.node_id,
    n.name AS node_name,
    w.number,
    w.length AS wagon_length,
    w.content,
    w.project_id,
    w.construction_site_id,
    wt.name AS type_name
  FROM
    wagons w
  LEFT JOIN
    tracks t ON w.current_track_id = t.id
  LEFT JOIN
    nodes n ON t.node_id = n.id
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id
  WHERE
    w.current_track_id IS NOT NULL;
    
  RAISE NOTICE 'Completed getting all wagon locations';
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_HOTFIX', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Simplified track display functions with better error handling',
    'update_date', NOW()
  )
);

COMMIT; 