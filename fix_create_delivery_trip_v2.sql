-- Fix the create_delivery_trip_v2 function to not reference 'name' field
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