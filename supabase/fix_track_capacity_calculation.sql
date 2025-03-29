-- Fix track capacity calculation for future dates
-- This script updates the functions that calculate track occupancy to correctly consider future trips

BEGIN;

-- Update the get_track_wagons_at_time function to handle future dates correctly
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
  WITH relevant_trips AS (
    -- Get trips that place wagons on the requested track before or at the specified time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.dest_track_id,
      t.datetime AS arrival_time,
      t.type,
      t.is_planned
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.dest_track_id = track_id_param
      AND t.datetime <= time_point
      AND t.type IN ('delivery', 'internal')
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  departures AS (
    -- Find wagons that have departure trips scheduled before the specified time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS departure_time,
      t.type,
      t.is_planned
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type = 'departure'
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  planned_trips AS (
    -- Include wagons from planned trips (future trips) that arrive on this track
    -- but only if we're planning for a future date
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.dest_track_id,
      t.datetime AS arrival_time,
      t.type,
      t.is_planned
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.dest_track_id = track_id_param
      AND t.datetime <= time_point
      AND t.is_planned = true
      AND t.type IN ('delivery', 'internal')
      AND time_point > CURRENT_TIMESTAMP  -- Only include planned trips when looking at future dates
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  planned_departures AS (
    -- Find wagons that have planned departure trips before the specified time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS departure_time,
      t.type,
      t.is_planned
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type = 'departure'
      AND t.is_planned = true
      AND time_point > CURRENT_TIMESTAMP  -- Only for future planning
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  all_trips AS (
    -- Combine actual and planned trips when appropriate
    SELECT * FROM relevant_trips
    UNION
    SELECT * FROM planned_trips 
    WHERE wagon_id NOT IN (SELECT wagon_id FROM relevant_trips)
  )
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    at.arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM wagons w
  JOIN all_trips at ON w.id = at.wagon_id
  LEFT JOIN wagon_types wt ON w.type_id = wt.id
  LEFT JOIN departures d ON w.id = d.wagon_id
  LEFT JOIN planned_departures pd ON w.id = pd.wagon_id
  WHERE 
    at.dest_track_id = track_id_param
    AND (
      -- Wagon has not departed yet
      (d.wagon_id IS NULL AND pd.wagon_id IS NULL)
      -- Or its departure is after its arrival
      OR (d.wagon_id IS NOT NULL AND d.departure_time < at.arrival_time)
      OR (pd.wagon_id IS NOT NULL AND pd.departure_time < at.arrival_time)
    );
END;
$$;

-- Update the get_track_occupancy_at_time function to use the improved get_track_wagons_at_time function
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
  occupied_length INTEGER;
  available_length INTEGER;
  wagon_count INTEGER;
  log_debug BOOLEAN := FALSE;  -- Set to TRUE to enable debug messages
  result JSON;
BEGIN
  -- Get track details
  SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Track not found'
    );
  END IF;
  
  total_length := track_data.useful_length;
  
  -- Calculate occupied length from wagons on this track at the specified time
  SELECT 
    COUNT(wagon_id),
    COALESCE(SUM(length), 0)
  INTO 
    wagon_count,
    occupied_length
  FROM get_track_wagons_at_time(track_id_param, time_point);
  
  -- Add debug logging
  IF log_debug THEN
    RAISE NOTICE 'Track % occupancy at % - Total Length: %, Occupied: %, Wagons: %',
      track_data.name, time_point, total_length, occupied_length, wagon_count;
  END IF;
  
  -- Calculate available length
  IF total_length > 0 THEN
    available_length := GREATEST(0, total_length - occupied_length);
  ELSE
    -- If track has no length limit (useful_length = 0), it has infinite capacity
    available_length := 9999999;
  END IF;
  
  -- Create result object
  result := json_build_object(
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

-- Add a function to test track capacity at a specific time
CREATE OR REPLACE FUNCTION test_track_capacity_at_time(
  track_id_param UUID,
  wagon_length_param INTEGER,
  time_point TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  occupancy JSON;
  available_length INTEGER;
BEGIN
  -- Get track occupancy at the specified time
  SELECT get_track_occupancy_at_time(track_id_param, time_point) INTO occupancy;
  
  -- Extract available length
  available_length := (occupancy->>'available_length')::INTEGER;
  
  -- Log for debugging
  RAISE NOTICE 'Testing capacity for track % at %: Available: %m, Required: %m',
    (occupancy->>'track_name'), time_point, available_length, wagon_length_param;
  
  -- Return true if there's enough capacity
  RETURN available_length >= wagon_length_param;
END;
$$;

-- Update the capacity check function to use the time-based capacity calculation
CREATE OR REPLACE FUNCTION check_track_capacity_at_time()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  track_id_to_check UUID;
  trip_datetime TIMESTAMPTZ;
  trip_type TEXT;
  track_length INTEGER;
  current_usage INTEGER;
  available_length INTEGER;
  is_planned BOOLEAN;
  track_occupancy JSON;
BEGIN
  -- This function is intended to be triggered by trip_wagons inserts
  -- We need to get the associated trip information first
  
  IF TG_TABLE_NAME = 'trip_wagons' THEN
    -- Get trip details for this trip_wagon
    SELECT 
      t.dest_track_id,
      t.datetime,
      t.type,
      t.is_planned
    INTO 
      track_id_to_check,
      trip_datetime,
      trip_type,
      is_planned
    FROM 
      trips t
    WHERE 
      t.id = NEW.trip_id;
    
    -- For delivery or internal moves, check capacity at destination
    IF trip_type IN ('delivery', 'internal') AND track_id_to_check IS NOT NULL THEN
      -- Get wagon length
      SELECT length INTO current_usage FROM wagons WHERE id = NEW.wagon_id;
      
      -- Get track occupancy at the trip time
      SELECT get_track_occupancy_at_time(track_id_to_check, trip_datetime) INTO track_occupancy;
      
      -- Extract values from the JSON result
      track_length := (track_occupancy->>'total_length')::INTEGER;
      available_length := (track_occupancy->>'available_length')::INTEGER;
      
      -- Add debug logging
      RAISE NOTICE 'Trip capacity check [%]: track=%, time=%, available=%, required=%, planned=%', 
        trip_type, track_id_to_check, trip_datetime, available_length, current_usage, is_planned;
      
      -- Check if adding this wagon would exceed capacity
      IF available_length < current_usage THEN
        RAISE EXCEPTION 'Insufficient capacity on track % at %. Available: %m, Required: %m',
          (track_occupancy->>'track_name'), trip_datetime, available_length, current_usage;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create a trigger for the updated capacity check
DROP TRIGGER IF EXISTS check_trip_capacity_trigger ON trip_wagons;
CREATE TRIGGER check_trip_capacity_trigger
BEFORE INSERT ON trip_wagons
FOR EACH ROW
EXECUTE FUNCTION check_track_capacity_at_time();

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated track capacity calculation to correctly handle future dates',
    'update_date', NOW()
  )
);

COMMIT; 