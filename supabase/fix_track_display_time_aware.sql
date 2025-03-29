-- Fix for time-aware wagon display on tracks
-- This script updates the track functions to correctly handle time-based planning

BEGIN;

-- Update get_track_wagons_at_time to be time-aware but reliable
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
  -- Return wagons that are on this track at the specified time
  RETURN QUERY
  WITH wagon_arrival_times AS (
    -- Get the earliest arrival time for each wagon on this track
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
      AND t.datetime <= time_point  -- Only wagons that have arrived by time_point
    ORDER BY 
      tw.wagon_id, t.datetime ASC  -- Get earliest arrival for each wagon
  ),
  wagon_departure_times AS (
    -- Get the earliest departure time for each wagon from this track
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
      AND t.datetime <= time_point  -- Only departures that have happened by time_point
      AND tw.wagon_id IN (SELECT wagon_id FROM wagon_arrival_times)  -- Only wagons that arrived here
    ORDER BY 
      tw.wagon_id, t.datetime ASC  -- Get earliest departure for each wagon
  )
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    wat.arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM 
    wagons w
  JOIN 
    wagon_arrival_times wat ON w.id = wat.wagon_id
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id
  LEFT JOIN 
    wagon_departure_times wdt ON w.id = wdt.wagon_id
  WHERE
    (wdt.wagon_id IS NULL OR wat.arrival_time < wdt.departure_time)
    AND w.current_track_id = track_id_param;
    
  -- Note: This returns both wagons that are:
  -- 1. Currently on this track (current_track_id check)
  -- 2. Had arrived by time_point but not departed yet (time-based calculation)
END;
$$;

-- Update the get_track_occupancy_at_time function to be time-aware
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
      'total_length', COALESCE(total_length, 0),
      'occupied_length', 0,
      'available_length', COALESCE(total_length, 0),
      'wagon_count', 0
    );
  END;
END;
$$;

-- Add a helper function to debug wagon positions at a given time
CREATE OR REPLACE FUNCTION debug_wagon_positions_at_time(
  time_point timestamp with time zone
)
RETURNS TABLE(
  wagon_id uuid,
  wagon_number text,
  track_id uuid,
  track_name text,
  arrival_time timestamp with time zone,
  arrival_trip_type text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH arrival_trips AS (
    -- Get the latest arrival trip for each wagon before the given time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.id AS trip_id,
      t.datetime AS arrival_time,
      t.dest_track_id AS track_id,
      t.type AS trip_type
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type IN ('delivery', 'internal')
    ORDER BY 
      tw.wagon_id, t.datetime DESC  -- Latest arrival for each wagon
  )
  SELECT 
    w.id AS wagon_id,
    w.number AS wagon_number,
    at.track_id,
    tr.name AS track_name,
    at.arrival_time,
    at.trip_type
  FROM 
    wagons w
  JOIN 
    arrival_trips at ON w.id = at.wagon_id
  JOIN 
    tracks tr ON at.track_id = tr.id
  ORDER BY 
    tr.name, at.arrival_time;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed wagon display to correctly respect time-based planning',
    'update_date', NOW()
  )
);

COMMIT; 