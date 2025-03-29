-- Implement event-based wagon display approach (Fixed version)
-- Uses trip events as the source of truth to prevent duplicate wagons display

BEGIN;

-- Update get_track_wagons_at_time function to use event-based approach
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
  -- Return wagons based on their event history
  RETURN QUERY
  WITH all_movements AS (
    -- Collect all wagon movements - both arrivals to and departures from tracks
    
    -- Arrivals (deliveries and internal movements TO this track)
    SELECT 
      tw.wagon_id,
      t.datetime AS event_time,
      t.dest_track_id AS track_id,
      'ARRIVAL' AS event_type,
      t.id AS trip_id
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.dest_track_id = track_id_param
      AND t.datetime <= time_point
      AND t.type IN ('delivery', 'internal')
    
    UNION ALL
    
    -- Departures (departures and internal movements FROM this track)
    SELECT 
      tw.wagon_id,
      t.datetime AS event_time,
      t.source_track_id AS track_id,
      'DEPARTURE' AS event_type,
      t.id AS trip_id
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.source_track_id = track_id_param
      AND t.datetime <= time_point
      AND t.type IN ('departure', 'internal')
  ),
  -- Get the latest movement for each wagon
  last_movements AS (
    SELECT DISTINCT ON (wagon_id)
      wagon_id,
      event_time,
      track_id,
      event_type,
      trip_id
    FROM all_movements
    ORDER BY wagon_id, event_time DESC
  ),
  -- Get the first arrival for each wagon that's still on the track
  first_arrivals AS (
    SELECT DISTINCT ON (am.wagon_id)
      am.wagon_id,
      am.event_time AS arrival_time,
      am.trip_id
    FROM all_movements am
    JOIN last_movements lm ON am.wagon_id = lm.wagon_id
    WHERE 
      am.event_type = 'ARRIVAL'
      AND am.track_id = track_id_param
      -- Only include if the last event wasn't a departure from this track
      AND (lm.event_type != 'DEPARTURE' OR lm.track_id != track_id_param)
    ORDER BY am.wagon_id, am.event_time ASC
  )
  -- Return wagons that are currently on this track
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
    first_arrivals fa ON w.id = fa.wagon_id
  LEFT JOIN 
    wagon_types wt ON w.type_id = wt.id;
END;
$$;

-- Update the get_track_occupancy_at_time function to use this event-based approach
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
    
    -- Calculate occupancy based on event-sourced wagons
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

-- Improve the create_trajectory_after_trip_wagon function to avoid duplicates
CREATE OR REPLACE FUNCTION public.create_trajectory_after_trip_wagon()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_trip_record RECORD;
  v_wagon_record RECORD;
  v_source_node_id UUID;
  v_dest_node_id UUID;
  v_move_type TEXT;
  v_has_existing_trajectory BOOLEAN;
BEGIN
  -- Skip if the skip_trajectory_creation flag is set
  IF NEW.skip_trajectory_creation = TRUE THEN
    RETURN NEW;
  END IF;

  -- Get trip details
  SELECT * INTO v_trip_record 
  FROM trips 
  WHERE id = NEW.trip_id;
  
  -- Get wagon details
  SELECT * INTO v_wagon_record 
  FROM wagons 
  WHERE id = NEW.wagon_id;
  
  -- Get node IDs if tracks are specified
  IF v_trip_record.source_track_id IS NOT NULL THEN
    SELECT node_id INTO v_source_node_id FROM tracks WHERE id = v_trip_record.source_track_id;
  END IF;
  
  IF v_trip_record.dest_track_id IS NOT NULL THEN
    SELECT node_id INTO v_dest_node_id FROM tracks WHERE id = v_trip_record.dest_track_id;
  END IF;
  
  -- Check if this wagon already has any trajectories
  SELECT EXISTS (
    SELECT 1 FROM wagon_trajectories 
    WHERE wagon_id = NEW.wagon_id
  ) INTO v_has_existing_trajectory;
  
  -- Determine move_type based on trip type and wagon history
  IF v_trip_record.type = 'delivery' AND NOT v_has_existing_trajectory THEN
    v_move_type := 'initial';
  ELSE
    v_move_type := v_trip_record.type;
  END IF;
  
  -- Check if this wagon+trip already has a trajectory record
  -- More robust check to prevent duplicates
  IF NOT EXISTS (
    SELECT 1 FROM wagon_trajectories 
    WHERE wagon_id = NEW.wagon_id 
    AND trip_id = NEW.trip_id
  ) THEN
    -- Create a new trajectory record
    INSERT INTO wagon_trajectories (
      id,
      wagon_id,
      track_id,
      node_id,
      timestamp,
      move_type,
      trip_id,
      previous_track_id,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.wagon_id,
      CASE v_trip_record.type 
        WHEN 'delivery' THEN v_trip_record.dest_track_id
        WHEN 'departure' THEN NULL
        ELSE v_trip_record.dest_track_id
      END,
      CASE v_trip_record.type 
        WHEN 'delivery' THEN v_dest_node_id
        WHEN 'departure' THEN NULL
        ELSE v_dest_node_id
      END,
      v_trip_record.datetime,
      v_move_type,
      NEW.trip_id,
      v_trip_record.source_track_id,
      NOW(),
      NOW()
    );
    
    -- Update the wagon's current_track_id to maintain consistency
    IF v_trip_record.type IN ('delivery', 'internal') THEN
      UPDATE wagons
      SET current_track_id = v_trip_record.dest_track_id
      WHERE id = NEW.wagon_id;
    ELSIF v_trip_record.type = 'departure' THEN
      UPDATE wagons
      SET current_track_id = NULL
      WHERE id = NEW.wagon_id;
    END IF;
    
    -- Log the trajectory creation
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES (
      'SYSTEM_ACTION', 
      'wagon_trajectories', 
      NEW.wagon_id, 
      jsonb_build_object(
        'message', 'Created wagon trajectory record via trigger',
        'trip_id', NEW.trip_id,
        'wagon_id', NEW.wagon_id,
        'trip_type', v_trip_record.type,
        'move_type', v_move_type
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Improve the add_wagon_trajectory_on_manual_move function
CREATE OR REPLACE FUNCTION public.add_wagon_trajectory_on_manual_move()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_node_id UUID;
  v_recent_trip_id UUID;
  v_recent_timestamp TIMESTAMPTZ;
BEGIN
  -- Only add a record if the track has actually changed
  IF NEW.current_track_id IS DISTINCT FROM OLD.current_track_id THEN
    -- Check if this wagon has a recent trip that already moved it to this track
    -- This will prevent duplicate records when a drag-drop (internal trip) is performed
    SELECT trip_id, timestamp INTO v_recent_trip_id, v_recent_timestamp
    FROM wagon_trajectories
    WHERE wagon_id = NEW.id
      AND track_id = NEW.current_track_id  -- Same destination track as the current update
      AND move_type IN ('internal', 'delivery')  -- Consider both internal and delivery movements
      AND timestamp > NOW() - INTERVAL '5 minutes'  -- Only consider very recent movements
    ORDER BY timestamp DESC
    LIMIT 1;
    
    -- If there's already a trajectory that moved this wagon to this track recently,
    -- don't create a duplicate manual record
    IF v_recent_trip_id IS NOT NULL THEN
      -- Log that we're skipping creation of a duplicate trajectory
      INSERT INTO audit_logs (
        action, 
        table_name, 
        record_id, 
        details
      ) VALUES (
        'DEBUG_LOG',
        'wagon_trajectories',
        NEW.id,
        jsonb_build_object(
          'message', 'Skipped creating duplicate manual trajectory',
          'wagon_id', NEW.id,
          'track_id', NEW.current_track_id,
          'recent_trip_id', v_recent_trip_id,
          'recent_timestamp', v_recent_timestamp
        )
      );
      
      RETURN NEW;
    END IF;
    
    -- Otherwise, proceed with creating a manual trajectory
    -- Get the node_id for the new track
    SELECT node_id INTO v_node_id
    FROM public.tracks
    WHERE id = NEW.current_track_id;
    
    -- Insert the trajectory record
    INSERT INTO public.wagon_trajectories (
      wagon_id, 
      track_id, 
      node_id,
      timestamp, 
      move_type, 
      previous_track_id
    ) VALUES (
      NEW.id,
      NEW.current_track_id,
      v_node_id,
      NOW(),
      'manual',
      OLD.current_track_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add a debug function to help with diagnosing wagon positions
CREATE OR REPLACE FUNCTION public.debug_wagon_position_history(
  wagon_id_param uuid
)
RETURNS TABLE(
  event_time timestamp with time zone,
  event_type text,
  track_id uuid,
  track_name text,
  node_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- Deliveries and internal movements TO tracks
  SELECT
    t.datetime AS event_time,
    t.type AS event_type,
    t.dest_track_id AS track_id,
    tr.name AS track_name,
    n.name AS node_name
  FROM
    trip_wagons tw
  JOIN
    trips t ON tw.trip_id = t.id
  JOIN
    tracks tr ON t.dest_track_id = tr.id
  JOIN
    nodes n ON tr.node_id = n.id
  WHERE
    tw.wagon_id = wagon_id_param
    AND t.type IN ('delivery', 'internal')
  
  UNION ALL
  
  -- Departures and internal movements FROM tracks
  SELECT
    t.datetime AS event_time,
    t.type AS event_type,
    t.source_track_id AS track_id,
    tr.name AS track_name,
    n.name AS node_name
  FROM
    trip_wagons tw
  JOIN
    trips t ON tw.trip_id = t.id
  JOIN
    tracks tr ON t.source_track_id = tr.id
  JOIN
    nodes n ON tr.node_id = n.id
  WHERE
    tw.wagon_id = wagon_id_param
    AND t.type IN ('departure', 'internal')
  
  UNION ALL
  
  -- Manual movements (from wagon_trajectories table)
  SELECT
    wt.timestamp AS event_time,
    wt.move_type AS event_type,
    wt.track_id,
    tr.name AS track_name,
    n.name AS node_name
  FROM
    wagon_trajectories wt
  JOIN
    tracks tr ON wt.track_id = tr.id
  JOIN
    nodes n ON tr.node_id = n.id
  WHERE
    wt.wagon_id = wagon_id_param
    AND wt.move_type = 'manual'
  
  ORDER BY
    event_time ASC;
END;
$$;

-- Drop the existing get_wagons_at_time function first to avoid return type error
DROP FUNCTION IF EXISTS public.get_wagons_at_time(timestamp with time zone);

-- Add a function to calculate where ALL wagons should be at a given time
CREATE OR REPLACE FUNCTION public.get_wagons_at_time(
  time_point timestamp with time zone
)
RETURNS TABLE(
  wagon_id uuid,
  number text,
  track_id uuid,
  track_name text,
  node_id uuid,
  node_name text,
  arrival_time timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH all_movements AS (
    -- All arrivals (deliveries and internal movements)
    SELECT 
      tw.wagon_id,
      t.datetime AS event_time,
      t.dest_track_id AS track_id,
      'ARRIVAL' AS event_type,
      t.id AS trip_id
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type IN ('delivery', 'internal')
    
    UNION ALL
    
    -- All departures (departures and internal movements)
    SELECT 
      tw.wagon_id,
      t.datetime AS event_time,
      t.source_track_id AS track_id,
      'DEPARTURE' AS event_type,
      t.id AS trip_id
    FROM 
      trip_wagons tw
    JOIN 
      trips t ON tw.trip_id = t.id
    WHERE 
      t.datetime <= time_point
      AND t.type IN ('departure', 'internal')
  ),
  -- Get the latest movement for each wagon
  last_movements AS (
    SELECT DISTINCT ON (wagon_id)
      wagon_id,
      event_time,
      track_id,
      event_type,
      trip_id
    FROM all_movements
    ORDER BY wagon_id, event_time DESC
  ),
  -- Get the first arrival time on current track
  arrival_times AS (
    SELECT
      lm.wagon_id,
      (
        SELECT MIN(am.event_time)
        FROM all_movements am
        WHERE 
          am.wagon_id = lm.wagon_id
          AND am.track_id = lm.track_id
          AND am.event_type = 'ARRIVAL'
          AND am.event_time <= time_point
      ) AS arrival_time
    FROM last_movements lm
    WHERE lm.event_type = 'ARRIVAL'
  )
  -- Return all wagons with their current track location
  SELECT 
    w.id AS wagon_id,
    w.number,
    lm.track_id,
    t.name AS track_name,
    t.node_id,
    n.name AS node_name,
    at.arrival_time
  FROM 
    wagons w
  JOIN 
    last_movements lm ON w.id = lm.wagon_id
  JOIN
    tracks t ON lm.track_id = t.id
  JOIN
    nodes n ON t.node_id = n.id
  LEFT JOIN
    arrival_times at ON w.id = at.wagon_id
  WHERE 
    lm.event_type = 'ARRIVAL' -- Only include wagons that are currently on a track (not departed)
  ORDER BY
    node_name, track_name, w.number;
END;
$$;

-- Clean up any existing duplicate trajectory records
-- to ensure we start with a clean state
DO $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_duplicate_count INTEGER := 0;
BEGIN
  -- First count how many duplicates we have
  SELECT COUNT(*) INTO v_duplicate_count
  FROM (
    SELECT wagon_id, trip_id, COUNT(*) 
    FROM wagon_trajectories
    WHERE trip_id IS NOT NULL
    GROUP BY wagon_id, trip_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- Delete duplicates, keeping only the earliest record for each wagon_id + trip_id combo
  DELETE FROM wagon_trajectories
  WHERE id IN (
    SELECT wt.id
    FROM wagon_trajectories wt
    JOIN (
      SELECT wagon_id, trip_id, MIN(created_at) as first_created
      FROM wagon_trajectories
      WHERE trip_id IS NOT NULL
      GROUP BY wagon_id, trip_id
    ) first_records
    ON wt.wagon_id = first_records.wagon_id
    AND wt.trip_id = first_records.trip_id
    WHERE wt.created_at > first_records.first_created
  );
  
  -- Get the number of deleted records
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES (
    'SYSTEM_MAINTENANCE', 
    'wagon_trajectories', 
    gen_random_uuid(), 
    jsonb_build_object(
      'message', 'Cleaned up duplicate trajectory records',
      'found_duplicates', v_duplicate_count,
      'deleted_records', v_deleted_count,
      'timestamp', NOW()
    )
  );
END
$$;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Implemented event-based wagon display system',
    'update_date', NOW()
  )
);

COMMIT; 