-- Fix for wagon display on tracks
-- This script updates the track occupancy functions to properly show wagons

BEGIN;

-- Create a simple version of get_wagons_by_track focused on current_track_id
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
  RETURN QUERY
  -- Use the simpler approach that focuses on current_track_id
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    -- Use an estimated arrival_time or current time if not available
    COALESCE(
      (SELECT MAX(t.datetime) 
       FROM trips t 
       JOIN trip_wagons tw ON t.id = tw.trip_id 
       WHERE tw.wagon_id = w.id AND t.dest_track_id = w.current_track_id),
      w.updated_at,
      NOW()
    ) AS arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM 
    wagons w
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id
  WHERE 
    w.current_track_id = track_id_param;
  
  -- Note: We're ignoring time_point for now and showing current positions
  -- This ensures wagons appear on their tracks in the UI
END;
$$;

-- Update the get_track_occupancy_at_time function to use current_track_id
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
  SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Track not found',
      'track_id', track_id_param
    );
  END IF;
  
  total_length := COALESCE(track_data.useful_length, 0);
  
  -- For current view, simply use current_track_id to find wagons
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
END;
$$;

-- Add an improved version of the get_wagons_by_current_track function
CREATE OR REPLACE FUNCTION public.get_wagons_by_current_track(
  track_id_param uuid
)
RETURNS TABLE(
  wagon_id uuid, 
  track_id uuid, 
  number text, 
  length integer, 
  content text, 
  project_id uuid, 
  construction_site_id uuid, 
  wagon_type text
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id as wagon_id,
    w.current_track_id as track_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    COALESCE(wt.name, w.custom_type) as wagon_type
  FROM 
    wagons w
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id
  WHERE 
    w.current_track_id = track_id_param;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Simplified wagon display functions to show current wagon positions',
    'update_date', NOW()
  )
);

COMMIT; 