-- Fix Wagon Display Time Issue
-- This script updates the get_track_wagons_at_time function to respect delivery dates

BEGIN;

-- 1. Update the get_track_wagons_at_time function to check trajectory timestamps
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
  
  -- Return wagons on this track that have arrived by the specified time point
  RETURN QUERY
  WITH wagon_arrivals AS (
    -- Get the earliest arrival time for each wagon on this track
    SELECT
      wt.wagon_id,
      MIN(wt.timestamp) AS arrival_time
    FROM
      wagon_trajectories wt
    WHERE
      wt.track_id = track_id_param
      AND wt.move_type IN ('delivery', 'internal', 'initial')
    GROUP BY
      wt.wagon_id
  ),
  wagon_departures AS (
    -- Get the earliest departure time after arrival for each wagon from this track
    SELECT
      wt.wagon_id,
      MIN(wt.timestamp) AS departure_time
    FROM
      wagon_trajectories wt
    WHERE
      wt.previous_track_id = track_id_param
      AND wt.move_type IN ('departure', 'internal')
    GROUP BY
      wt.wagon_id
  ),
  relevant_wagons AS (
    -- Get wagons that are on the track at the specified time
    SELECT
      wa.wagon_id
    FROM
      wagon_arrivals wa
    LEFT JOIN
      wagon_departures wd ON wa.wagon_id = wd.wagon_id
    WHERE
      wa.arrival_time <= time_point
      AND (wd.departure_time IS NULL OR wd.departure_time > time_point)
  )
  SELECT 
    w.id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    ROW_NUMBER() OVER (ORDER BY rw.wagon_id)::integer * 10 AS position, -- Simple position calculation
    wt.name AS wagon_type
  FROM 
    relevant_wagons rw
  JOIN
    wagons w ON rw.wagon_id = w.id
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id
  WHERE
    w.id IN (SELECT wagon_id FROM relevant_wagons);
    
  RAISE NOTICE 'Track % wagons query completed for time %', track_id_param, time_point;
END;
$$;

-- 2. Update the get_track_occupancy_at_time function to also respect time
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
    
    -- Calculate occupancy based on wagons with respecting time constraints
    BEGIN
      total_length := COALESCE(track_data.useful_length, 0);
      
      -- Count wagons and total length
      WITH wagon_lengths AS (
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
        wagon_lengths;
      
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
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_HOTFIX', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed wagon display time to respect delivery dates',
    'update_date', NOW()
  )
);

COMMIT; 