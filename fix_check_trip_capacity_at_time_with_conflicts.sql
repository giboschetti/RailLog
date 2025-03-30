-- Fix for the "column t.name does not exist" error in check_trip_capacity_at_time_with_conflicts
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
          -- Replace t.name with COALESCE(t.transport_plan_number, 'Trip ' || t.id::text)
          COALESCE(t.transport_plan_number, 'Trip ' || t.id::text) AS trip_name,
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