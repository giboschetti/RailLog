-- Comprehensive fix for "column t.name does not exist" errors
-- This script addresses all functions that incorrectly reference the non-existent trips.name field

-- 1. Fix check_trip_capacity_at_time_with_conflicts function
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
          -- Replace t.name with a COALESCE with transport_plan_number or trip ID
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

-- 2. Fix the fix_trip_trajectory_inconsistencies function
-- Keep the original return type (trip_name vs trip_identifier) to avoid errors
CREATE OR REPLACE FUNCTION public.fix_trip_trajectory_inconsistencies()
RETURNS TABLE(trip_id UUID, trip_name TEXT, wagons_fixed INTEGER)
LANGUAGE plpgsql
AS $function$
DECLARE
    trip_rec RECORD;
    wagon_rec RECORD;
    fixed_count INTEGER;
    prev_track_id UUID;
BEGIN
    -- Create a temporary table to store results
    CREATE TEMP TABLE fixed_trips (
        trip_id UUID,
        trip_name TEXT, -- Keep original column name
        wagons_fixed INTEGER
    ) ON COMMIT DROP;
    
    -- Find trips with inconsistencies
    FOR trip_rec IN 
        SELECT 
            t.id AS trip_id,
            -- Replace t.name with a COALESCE with transport_plan_number or trip ID
            COALESCE(t.transport_plan_number, 'Trip ' || t.id::text) AS trip_name, -- Match return type
            t.datetime,
            t.dest_track_id,
            t.type
        FROM 
            trips t
        WHERE EXISTS (
            SELECT 1 FROM check_trip_consistency() tc 
            WHERE tc.trip_id = t.id AND tc.is_consistent = FALSE
        )
    LOOP
        fixed_count := 0;
        
        -- Find wagons in this trip that don't have trajectories
        FOR wagon_rec IN
            SELECT 
                tw.wagon_id
            FROM 
                trip_wagons tw
            WHERE 
                tw.trip_id = trip_rec.trip_id
                AND NOT EXISTS (
                    SELECT 1 FROM wagon_trajectories wt 
                    WHERE wt.trip_id = trip_rec.trip_id AND wt.wagon_id = tw.wagon_id
                )
        LOOP
            -- Try to find the previous track from other trajectories
            SELECT track_id INTO prev_track_id
            FROM wagon_trajectories
            WHERE 
                wagon_id = wagon_rec.wagon_id
                AND timestamp < trip_rec.datetime
            ORDER BY timestamp DESC
            LIMIT 1;
            
            -- Create the missing trajectory
            INSERT INTO wagon_trajectories (
                wagon_id,
                track_id,
                previous_track_id,
                timestamp,
                move_type,
                trip_id
            )
            VALUES (
                wagon_rec.wagon_id,
                trip_rec.dest_track_id,
                prev_track_id,
                trip_rec.datetime,
                trip_rec.type,
                trip_rec.trip_id
            );
            
            -- Log the fix with proper JSON formatting
            INSERT INTO audit_logs (action, table_name, record_id, details)
            VALUES (
                'FIX', 
                'wagon_trajectories', 
                wagon_rec.wagon_id::TEXT,
                json_build_object('message', 'Fixed missing trajectory for trip', 'trip_id', trip_rec.trip_id)
            );
            
            fixed_count := fixed_count + 1;
        END LOOP;
        
        -- Record the fix
        INSERT INTO fixed_trips
        VALUES (
            trip_rec.trip_id,
            trip_rec.trip_name, -- Keep original column name
            fixed_count
        );
    END LOOP;
    
    -- Return the results
    RETURN QUERY
    SELECT * FROM fixed_trips;
END;
$function$;

-- 3. Update create_delivery_trip_v2 to use transport_plan_number instead of name
CREATE OR REPLACE FUNCTION public.create_delivery_trip_v2(data json)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
    trip_id UUID;
    wagon_data JSON;
    wagon_id UUID;
    trip_data RECORD;
    current_track_id UUID;
BEGIN
    -- Extract trip data
    SELECT 
        data->>'transport_plan_number' AS transport_plan_number, -- Changed from 'name'
        (data->>'datetime')::TIMESTAMPTZ AS datetime,
        (data->>'dest_track_id')::UUID AS dest_track_id,
        (data->>'user_id')::UUID AS user_id
    INTO trip_data;
    
    -- Insert the trip
    INSERT INTO trips (transport_plan_number, datetime, dest_track_id, user_id, type) -- Changed from 'name'
    VALUES (
        trip_data.transport_plan_number, -- Changed from 'name'
        trip_data.datetime,
        trip_data.dest_track_id,
        trip_data.user_id,
        'delivery'
    )
    RETURNING id INTO trip_id;
    
    -- Process each wagon
    FOR wagon_data IN SELECT * FROM json_array_elements(data->'wagons')
    LOOP
        wagon_id := (wagon_data->>'id')::UUID;
        
        -- Get the current track of the wagon (might be NULL for new deliveries)
        SELECT current_track_id INTO current_track_id FROM wagons WHERE id = wagon_id;
        
        -- Create wagon trajectory - for delivery trips, we always create a trajectory
        -- Use the timestamp from trip - this is important for the event-sourcing model
        INSERT INTO wagon_trajectories (
            wagon_id,
            track_id,
            previous_track_id,
            timestamp,
            move_type,
            trip_id
        )
        VALUES (
            wagon_id,
            trip_data.dest_track_id,
            current_track_id,  -- Might be NULL for new deliveries
            trip_data.datetime,
            'delivery',
            trip_id
        );
        
        -- Log the trajectory creation with proper JSON formatting
        INSERT INTO audit_logs (action, table_name, record_id, details)
        VALUES (
            'INSERT', 
            'wagon_trajectories', 
            wagon_id::TEXT,
            json_build_object('message', 'Created trajectory for delivery trip', 'trip_id', trip_id)
        );
        
        -- Link the wagon to the trip
        INSERT INTO trip_wagons (trip_id, wagon_id)
        VALUES (trip_id, wagon_id);
        
        -- Update the wagon's current track
        UPDATE wagons
        SET current_track_id = trip_data.dest_track_id
        WHERE id = wagon_id;
    END LOOP;
    
    -- Log the trip creation with proper JSON formatting
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('INSERT', 'trips', trip_id::TEXT, '{"message": "Created delivery trip"}');
    
    RETURN trip_id;
EXCEPTION WHEN OTHERS THEN
    -- Log the error with proper JSON formatting
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('ERROR', 'trips', COALESCE(trip_id::TEXT, 'NULL'), 
            json_build_object('message', 'Error creating delivery trip', 'error', SQLERRM));
    
    -- Re-raise the exception
    RAISE;
END;
$function$; 