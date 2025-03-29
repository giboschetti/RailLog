-- Fix Track Display UI Issues
-- This script addresses issues with track occupancy calculation and wagon display in the UI

BEGIN;

-- 1. Fix the get_track_wagons_at_time function to provide proper position data
DROP FUNCTION IF EXISTS public.get_track_wagons_at_time(uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_track_wagons_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
)
RETURNS SETOF json
LANGUAGE plpgsql
AS $$
DECLARE
  track_record RECORD;
BEGIN
  -- Get track info for validation
  SELECT * INTO track_record FROM tracks WHERE id = track_id_param;
  
  IF NOT FOUND THEN
    -- Return an empty result if track doesn't exist
    RETURN;
  END IF;
  
  -- Return wagons on this track with position information for UI rendering
  RETURN QUERY
  WITH wagons_on_track AS (
    SELECT 
      w.id AS wagon_id,
      w.number,
      w.length,
      w.content,
      w.project_id,
      w.construction_site_id,
      w.type_id,
      w.current_track_id,
      wt.name AS wagon_type,
      ROW_NUMBER() OVER (ORDER BY w.id) AS position_index
    FROM 
      wagons w
    LEFT JOIN
      wagon_types wt ON w.type_id = wt.id
    WHERE
      w.current_track_id = track_id_param
  )
  SELECT 
    json_build_object(
      'wagon_id', w.wagon_id,
      'number', w.number,
      'length', w.length,
      'content', w.content,
      'project_id', w.project_id,
      'construction_site_id', w.construction_site_id,
      'type_id', w.type_id,
      'wagon_type', w.wagon_type,
      'position', (SUM(wt.length) OVER (ORDER BY w.position_index ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - w.length)
    )
  FROM 
    wagons_on_track w
  INNER JOIN
    wagons_on_track wt ON w.position_index >= wt.position_index
  GROUP BY
    w.wagon_id, w.number, w.length, w.content, w.project_id, 
    w.construction_site_id, w.type_id, w.wagon_type, w.position_index;
END;
$$;

-- 2. Fix the get_track_occupancy_at_time function to calculate accurate occupancy
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
  SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Track not found',
      'track_id', track_id_param
    );
  END IF;
  
  total_length := COALESCE(track_data.useful_length, 0);
  
  -- Calculate occupancy based on wagons with current_track_id
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

-- 3. Create a simpler function to get wagons at time point
DROP FUNCTION IF EXISTS public.get_wagons_at_time(timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_wagons_at_time(
  time_point timestamp with time zone
)
RETURNS TABLE (
  wagon_id UUID,
  track_id UUID,
  track_name TEXT,
  node_id UUID,
  node_name TEXT,
  arrival_time TIMESTAMPTZ,
  number TEXT,
  wagon_length INTEGER,
  content TEXT,
  project_id UUID,
  construction_site_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id AS wagon_id,
    w.current_track_id AS track_id,
    t.name AS track_name,
    t.node_id,
    n.name AS node_name,
    NULL::TIMESTAMPTZ AS arrival_time,
    w.number,
    w.length AS wagon_length,
    w.content,
    w.project_id,
    w.construction_site_id
  FROM
    wagons w
  JOIN
    tracks t ON w.current_track_id = t.id
  JOIN
    nodes n ON t.node_id = n.id
  WHERE
    w.current_track_id IS NOT NULL;
END;
$$;

-- 4. Update the getWagonLocationsForTimeline function to return proper data
DROP FUNCTION IF EXISTS public.get_wagon_locations_for_timeline(timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_wagon_locations_for_timeline(
  time_point timestamp with time zone
)
RETURNS SETOF json
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    json_build_object(
      'id', w.id,
      'wagon_id', w.id,
      'track_id', w.current_track_id,
      'track_name', t.name,
      'node_name', n.name,
      'number', w.number,
      'length', w.length,
      'content', w.content,
      'project_id', w.project_id,
      'construction_site_id', w.construction_site_id,
      'type_id', w.type_id,
      'wagon_type', wt.name
    )
  FROM 
    wagons w
  JOIN
    tracks t ON w.current_track_id = t.id
  JOIN
    nodes n ON t.node_id = n.id
  LEFT JOIN
    wagon_types wt ON w.type_id = wt.id
  WHERE
    w.current_track_id IS NOT NULL;
END;
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_HOTFIX', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed track display and wagon rendering in UI',
    'update_date', NOW()
  )
);

COMMIT; 