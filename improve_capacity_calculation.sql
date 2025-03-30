-- Function to check track capacity at a specific time and identify future conflicts
CREATE OR REPLACE FUNCTION public.check_trip_capacity_at_time_with_conflicts(
  track_id_param UUID,
  time_point TIMESTAMPTZ,
  additional_length_param INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  track_data RECORD;
  occupancy_result JSON;
  occupied_length INTEGER;
  total_length INTEGER;
  available_length INTEGER;
  has_capacity BOOLEAN;
  
  -- For future conflict checking
  future_conflicts JSON[];
  conflict_record RECORD;
BEGIN
  -- Get the track details
  SELECT * INTO track_data FROM tracks WHERE id = track_id_param;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Track not found',
      'track_id', track_id_param
    );
  END IF;
  
  -- Get occupancy at the specific time point
  SELECT get_track_occupancy_at_time(track_id_param, time_point) INTO occupancy_result;
  
  -- Extract values from the occupancy result
  occupied_length := (occupancy_result->>'occupied_length')::INTEGER;
  total_length := (occupancy_result->>'total_length')::INTEGER;
  available_length := (occupancy_result->>'available_length')::INTEGER;
  
  -- Check if track has unlimited capacity (useful_length = 0)
  IF total_length = 0 THEN
    has_capacity := TRUE;
  ELSE
    has_capacity := (available_length >= additional_length_param);
  END IF;
  
  -- Look for potential conflicts in the future
  -- This query finds future time points where this trip would cause capacity issues
  future_conflicts := ARRAY[]::JSON[];
  
  -- Only check future conflicts if the track has limited capacity 
  -- and there's capacity at the specified time
  IF total_length > 0 AND has_capacity THEN
    FOR conflict_record IN (
      WITH future_times AS (
        -- Get all future trips to this track within next 30 days
        SELECT 
          t.id AS trip_id,
          t.name AS trip_name,
          t.datetime AS trip_time,
          t.type AS trip_type
        FROM 
          trips t
        WHERE 
          t.dest_track_id = track_id_param
          AND t.datetime > time_point
          AND t.datetime < time_point + INTERVAL '30 days'
          AND t.is_planned = TRUE
        ORDER BY 
          t.datetime ASC
      ),
      future_occupancies AS (
        -- For each future trip time, check occupancy
        SELECT 
          ft.trip_id,
          ft.trip_name,
          ft.trip_time,
          ft.trip_type,
          get_track_occupancy_at_time(track_id_param, ft.trip_time) AS occupancy
        FROM 
          future_times ft
      )
      -- Find future trips that would exceed capacity if we add our new wagon
      SELECT 
        fo.trip_id,
        fo.trip_name,
        fo.trip_time,
        fo.trip_type,
        (fo.occupancy->>'available_length')::INTEGER AS available_length,
        additional_length_param AS required_length,
        CASE 
          WHEN (fo.occupancy->>'available_length')::INTEGER < additional_length_param 
          THEN TRUE 
          ELSE FALSE 
        END AS would_conflict
      FROM 
        future_occupancies fo
      WHERE 
        (fo.occupancy->>'available_length')::INTEGER < additional_length_param
      LIMIT 5 -- Limit to first 5 conflicts
    ) LOOP
      -- Add this conflict to our result array
      future_conflicts := future_conflicts || json_build_object(
        'trip_id', conflict_record.trip_id,
        'trip_name', conflict_record.trip_name,
        'trip_time', conflict_record.trip_time,
        'trip_type', conflict_record.trip_type,
        'available_length', conflict_record.available_length,
        'required_length', conflict_record.required_length
      );
    END LOOP;
  END IF;
  
  -- Build the final response
  RETURN json_build_object(
    'success', TRUE,
    'track_id', track_id_param,
    'track_name', track_data.name,
    'time_point', time_point,
    'total_length', total_length,
    'occupied_length', occupied_length,
    'available_length', available_length,
    'required_length', additional_length_param,
    'has_capacity', has_capacity,
    'future_conflicts', future_conflicts,
    'has_future_conflicts', array_length(future_conflicts, 1) > 0
  );
END;
$$;

-- Create a trigger function to check capacity only at the trip time
-- This replaces the current capacity check that includes future trips
CREATE OR REPLACE FUNCTION public.check_trip_capacity_at_time()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  track_id_to_check UUID;
  trip_datetime TIMESTAMPTZ;
  trip_type TEXT;
  wagon_length INTEGER;
  is_planned BOOLEAN;
  capacity_check JSON;
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
      SELECT length INTO wagon_length FROM wagons WHERE id = NEW.wagon_id;
      
      -- Get track capacity at the trip time only
      SELECT check_trip_capacity_at_time_with_conflicts(
        track_id_to_check, 
        trip_datetime, 
        wagon_length
      ) INTO capacity_check;
      
      -- Add debug logging
      RAISE NOTICE 'Trip capacity check [%]: track=%, time=%, available=%, required=%, has_capacity=%', 
        trip_type, track_id_to_check, trip_datetime, 
        (capacity_check->>'available_length')::INTEGER, 
        wagon_length,
        (capacity_check->>'has_capacity')::BOOLEAN;
      
      -- Check if adding this wagon would exceed capacity AT THE TIME OF ARRIVAL
      IF NOT (capacity_check->>'has_capacity')::BOOLEAN THEN
        RAISE EXCEPTION 'Insufficient capacity on track % at %. Available: %m, Required: %m',
          (capacity_check->>'track_name'), trip_datetime, 
          (capacity_check->>'available_length')::INTEGER, 
          wagon_length;
      END IF;
      
      -- If there are future conflicts, log them but don't prevent the trip
      IF (capacity_check->>'has_future_conflicts')::BOOLEAN THEN
        RAISE NOTICE 'Warning: This trip will create capacity conflicts with future trips: %',
          (capacity_check->>'future_conflicts')::TEXT;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Replace the existing trigger with our new time-specific capacity check
DROP TRIGGER IF EXISTS check_trip_capacity ON trip_wagons;
CREATE TRIGGER check_trip_capacity
BEFORE INSERT ON trip_wagons
FOR EACH ROW
EXECUTE FUNCTION check_trip_capacity_at_time();

-- Create a new API function for the frontend to check future conflicts
CREATE OR REPLACE FUNCTION public.check_delivery_future_conflicts(
  track_id_param UUID,
  time_point TIMESTAMPTZ,
  wagon_length INTEGER
)
RETURNS TABLE (
  trip_id UUID,
  trip_name TEXT,
  trip_time TIMESTAMPTZ,
  trip_type TEXT,
  available_length INTEGER,
  required_length INTEGER,
  conflict_date TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  capacity_check JSON;
  conflict JSON;
BEGIN
  -- Get capacity info including future conflicts
  SELECT check_trip_capacity_at_time_with_conflicts(
    track_id_param, 
    time_point, 
    wagon_length
  ) INTO capacity_check;
  
  -- If there are future conflicts, return them as rows
  IF (capacity_check->>'has_future_conflicts')::BOOLEAN THEN
    FOR conflict IN SELECT * FROM json_array_elements((capacity_check->>'future_conflicts')::JSON)
    LOOP
      trip_id := (conflict->>'trip_id')::UUID;
      trip_name := (conflict->>'trip_name')::TEXT;
      trip_time := (conflict->>'trip_time')::TIMESTAMPTZ;
      trip_type := (conflict->>'trip_type')::TEXT;
      available_length := (conflict->>'available_length')::INTEGER;
      required_length := (conflict->>'required_length')::INTEGER;
      conflict_date := to_char(trip_time, 'DD.MM.YYYY HH24:MI');
      
      RETURN NEXT;
    END LOOP;
  END IF;
  
  RETURN;
END;
$$; 