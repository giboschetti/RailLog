-- Fix Initial Record Display Issue
-- This script updates the get_track_wagons_at_time function to ignore 'initial' move types

BEGIN;

-- Update the get_track_wagons_at_time function to use correct move types
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
    -- IMPORTANT: Exclude 'initial' move types to prevent early display
    SELECT
      wt.wagon_id AS wa_wagon_id,
      MIN(wt.timestamp) AS arrival_time
    FROM
      wagon_trajectories wt
    WHERE
      wt.track_id = track_id_param
      AND wt.move_type IN ('delivery', 'internal') -- Removed 'initial'
    GROUP BY
      wt.wagon_id
  ),
  wagon_departures AS (
    -- Get the earliest departure time after arrival for each wagon from this track
    SELECT
      wt.wagon_id AS wd_wagon_id,
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
      wa.wa_wagon_id AS rw_wagon_id
    FROM
      wagon_arrivals wa
    LEFT JOIN
      wagon_departures wd ON wa.wa_wagon_id = wd.wd_wagon_id
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
    ROW_NUMBER() OVER (ORDER BY rw.rw_wagon_id)::integer * 10 AS position,
    wt.name AS wagon_type
  FROM 
    relevant_wagons rw
  JOIN
    wagons w ON rw.rw_wagon_id = w.id
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id;
    
  RAISE NOTICE 'Track % wagons query completed for time %', track_id_param, time_point;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_HOTFIX', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed wagon display to ignore initial records',
    'update_date', NOW()
  )
);

COMMIT; 