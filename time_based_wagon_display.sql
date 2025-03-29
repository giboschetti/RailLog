-- Function to get all wagons at a specific point in time
CREATE OR REPLACE FUNCTION get_wagons_at_time(
  time_point TIMESTAMPTZ
)
RETURNS TABLE (
  wagon_id UUID,
  track_id UUID,
  track_name TEXT,
  node_id UUID,
  node_name TEXT,
  number TEXT,
  wagon_length INTEGER,
  content TEXT,
  project_id UUID,
  construction_site_id UUID,
  arrival_time TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH relevant_trips AS (
    -- Get the latest trip for each wagon that happened before or at the selected time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.dest_track_id,
      t.datetime AS arrival_time,
      t.type
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.dest_track_id IS NOT NULL  -- Only include trips with a destination
      AND t.type IN ('delivery', 'internal')  -- Only include trips that place wagons on tracks
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  departures AS (
    -- Find wagons that were later removed by departure trips
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS departure_time,
      t.type
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type = 'departure'  -- Only include departure trips
    ORDER BY tw.wagon_id, t.datetime DESC
  )
  SELECT 
    w.id AS wagon_id,
    rt.dest_track_id AS track_id,
    tr.name AS track_name,
    tr.node_id,
    n.name AS node_name,
    w.number,
    w.length AS wagon_length,
    w.content,
    w.project_id,
    w.construction_site_id,
    rt.arrival_time
  FROM wagons w
  JOIN relevant_trips rt ON w.id = rt.wagon_id
  JOIN tracks tr ON rt.dest_track_id = tr.id
  JOIN nodes n ON tr.node_id = n.id
  LEFT JOIN departures d ON w.id = d.wagon_id
  WHERE 
    -- Only include wagons that haven't been departed after their last arrival
    d.wagon_id IS NULL OR d.departure_time < rt.arrival_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get wagons on a specific track at a specific point in time
CREATE OR REPLACE FUNCTION get_track_wagons_at_time(
  track_id_param UUID,
  time_point TIMESTAMPTZ
)
RETURNS TABLE (
  wagon_id UUID,
  number TEXT,
  length INTEGER,
  content TEXT,
  project_id UUID,
  construction_site_id UUID,
  type_id UUID,
  arrival_time TIMESTAMPTZ,
  wagon_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH relevant_trips AS (
    -- Get the latest trip for each wagon that happened before or at the selected time
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.dest_track_id,
      t.datetime AS arrival_time,
      t.type
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.dest_track_id IS NOT NULL
      AND t.type IN ('delivery', 'internal')
    ORDER BY tw.wagon_id, t.datetime DESC
  ),
  departures AS (
    -- Find wagons that were later removed by departure trips
    SELECT DISTINCT ON (tw.wagon_id)
      tw.wagon_id,
      t.datetime AS departure_time,
      t.type
    FROM trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type = 'departure'
    ORDER BY tw.wagon_id, t.datetime DESC
  )
  SELECT 
    w.id AS wagon_id,
    w.number,
    w.length,
    w.content,
    w.project_id,
    w.construction_site_id,
    w.type_id,
    rt.arrival_time,
    COALESCE(wt.name, w.custom_type) AS wagon_type
  FROM wagons w
  JOIN relevant_trips rt ON w.id = rt.wagon_id
  LEFT JOIN departures d ON w.id = d.wagon_id
  LEFT JOIN wagon_types wt ON w.type_id = wt.id
  WHERE 
    rt.dest_track_id = track_id_param
    AND (d.wagon_id IS NULL OR d.departure_time < rt.arrival_time);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate track occupancy at a specific point in time
CREATE OR REPLACE FUNCTION get_track_occupancy_at_time(
  track_id_param UUID,
  time_point TIMESTAMPTZ
)
RETURNS JSON AS $$
DECLARE
  track_data RECORD;
  total_length INTEGER;
  occupied_length INTEGER;
  available_length INTEGER;
  wagon_count INTEGER;
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
$$ LANGUAGE plpgsql; 