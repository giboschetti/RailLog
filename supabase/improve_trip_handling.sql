-- improve_trip_handling.sql
-- Updates trip-related functions to work better with the event-sourcing architecture

BEGIN;

-- Log the update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'Improving trip handling for event-sourcing');

-- 1. Update the create_internal_trip_v2 function to prevent duplicate trajectories
-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS create_internal_trip_v2(JSON);

CREATE OR REPLACE FUNCTION create_internal_trip_v2(data JSON)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    trip_id UUID;
    wagon_data JSON;
    wagon_id UUID;
    trip_data RECORD;
    current_track_id UUID;
BEGIN
    -- Extract trip data
    SELECT 
        data->>'name' AS name,
        (data->>'datetime')::TIMESTAMPTZ AS datetime,
        (data->>'orig_track_id')::UUID AS orig_track_id,
        (data->>'dest_track_id')::UUID AS dest_track_id,
        (data->>'user_id')::UUID AS user_id,
        data->>'type' AS type
    INTO trip_data;
    
    -- Insert the trip
    INSERT INTO trips (name, datetime, orig_track_id, dest_track_id, user_id, type)
    VALUES (
        trip_data.name,
        trip_data.datetime,
        trip_data.orig_track_id,
        trip_data.dest_track_id,
        trip_data.user_id,
        trip_data.type
    )
    RETURNING id INTO trip_id;
    
    -- Process each wagon
    FOR wagon_data IN SELECT * FROM json_array_elements(data->'wagons')
    LOOP
        wagon_id := (wagon_data->>'id')::UUID;
        
        -- Get the current track of the wagon
        SELECT current_track_id INTO current_track_id FROM wagons WHERE id = wagon_id;
        
        -- Only create trajectories if the destination track is different from the current track
        IF trip_data.dest_track_id <> current_track_id THEN
            -- Create wagon trajectory first
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
                current_track_id,
                trip_data.datetime,
                'internal',
                trip_id
            );
            
            -- Log the trajectory creation
            INSERT INTO audit_logs (action, table_name, record_id, details)
            VALUES (
                'INSERT', 
                'wagon_trajectories', 
                wagon_id::TEXT,
                'Created trajectory for internal trip ' || trip_id::TEXT
            );
        END IF;
        
        -- Link the wagon to the trip
        INSERT INTO trip_wagons (trip_id, wagon_id)
        VALUES (trip_id, wagon_id);
        
        -- Update the wagon's current track
        UPDATE wagons
        SET current_track_id = trip_data.dest_track_id
        WHERE id = wagon_id;
    END LOOP;
    
    -- Log the trip creation
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('INSERT', 'trips', trip_id::TEXT, 'Created internal trip');
    
    RETURN trip_id;
EXCEPTION WHEN OTHERS THEN
    -- Log the error
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('ERROR', 'trips', COALESCE(trip_id::TEXT, 'NULL'), 'Error creating internal trip: ' || SQLERRM);
    
    -- Re-raise the exception
    RAISE;
END;
$$;

-- 2. Create a function to handle delivery trips with similar logic
DROP FUNCTION IF EXISTS create_delivery_trip_v2(JSON);

CREATE OR REPLACE FUNCTION create_delivery_trip_v2(data JSON)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    trip_id UUID;
    wagon_data JSON;
    wagon_id UUID;
    trip_data RECORD;
    current_track_id UUID;
BEGIN
    -- Extract trip data
    SELECT 
        data->>'name' AS name,
        (data->>'datetime')::TIMESTAMPTZ AS datetime,
        (data->>'dest_track_id')::UUID AS dest_track_id,
        (data->>'user_id')::UUID AS user_id
    INTO trip_data;
    
    -- Insert the trip
    INSERT INTO trips (name, datetime, dest_track_id, user_id, type)
    VALUES (
        trip_data.name,
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
        
        -- Log the trajectory creation
        INSERT INTO audit_logs (action, table_name, record_id, details)
        VALUES (
            'INSERT', 
            'wagon_trajectories', 
            wagon_id::TEXT,
            'Created trajectory for delivery trip ' || trip_id::TEXT
        );
        
        -- Link the wagon to the trip
        INSERT INTO trip_wagons (trip_id, wagon_id)
        VALUES (trip_id, wagon_id);
        
        -- Update the wagon's current track
        UPDATE wagons
        SET current_track_id = trip_data.dest_track_id
        WHERE id = wagon_id;
    END LOOP;
    
    -- Log the trip creation
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('INSERT', 'trips', trip_id::TEXT, 'Created delivery trip');
    
    RETURN trip_id;
EXCEPTION WHEN OTHERS THEN
    -- Log the error
    INSERT INTO audit_logs (action, table_name, record_id, details)
    VALUES ('ERROR', 'trips', COALESCE(trip_id::TEXT, 'NULL'), 'Error creating delivery trip: ' || SQLERRM);
    
    -- Re-raise the exception
    RAISE;
END;
$$;

-- 3. Create a function to check for inconsistencies in trip data
CREATE OR REPLACE FUNCTION check_trip_consistency()
RETURNS TABLE (
    trip_id UUID,
    trip_type TEXT,
    trip_datetime TIMESTAMPTZ,
    wagons_count INTEGER,
    trajectories_count INTEGER,
    is_consistent BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH trip_counts AS (
        SELECT
            t.id AS trip_id,
            t.type AS trip_type,
            t.datetime,
            COUNT(tw.wagon_id) AS wagons_count,
            COUNT(wt.id) AS trajectories_count
        FROM
            trips t
        LEFT JOIN
            trip_wagons tw ON t.id = tw.trip_id
        LEFT JOIN
            wagon_trajectories wt ON t.id = wt.trip_id
        GROUP BY
            t.id, t.type, t.datetime
    )
    SELECT
        tc.trip_id,
        tc.trip_type,
        tc.datetime,
        tc.wagons_count,
        tc.trajectories_count,
        tc.wagons_count = tc.trajectories_count AS is_consistent
    FROM
        trip_counts tc
    ORDER BY
        tc.datetime DESC, tc.is_consistent;
END;
$$;

-- 4. Fix inconsistencies in trip data
CREATE OR REPLACE FUNCTION fix_trip_trajectory_inconsistencies()
RETURNS TABLE (
    trip_id UUID,
    trip_name TEXT,
    wagons_fixed INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    trip_rec RECORD;
    wagon_rec RECORD;
    fixed_count INTEGER;
    prev_track_id UUID;
BEGIN
    -- Create a temporary table to store results
    CREATE TEMP TABLE fixed_trips (
        trip_id UUID,
        trip_name TEXT,
        wagons_fixed INTEGER
    ) ON COMMIT DROP;
    
    -- Find trips with inconsistencies
    FOR trip_rec IN 
        SELECT 
            t.id AS trip_id,
            t.name AS trip_name,
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
            
            -- Log the fix
            INSERT INTO audit_logs (action, table_name, record_id, details)
            VALUES (
                'FIX', 
                'wagon_trajectories', 
                wagon_rec.wagon_id::TEXT,
                'Fixed missing trajectory for trip ' || trip_rec.trip_id::TEXT
            );
            
            fixed_count := fixed_count + 1;
        END LOOP;
        
        -- Record the fix
        INSERT INTO fixed_trips
        VALUES (
            trip_rec.trip_id,
            trip_rec.trip_name,
            fixed_count
        );
    END LOOP;
    
    -- Return the results
    RETURN QUERY
    SELECT * FROM fixed_trips;
END;
$$;

-- Update the database schema version
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES ('UPDATE', 'system', NULL, 'Trip handling improved for event-sourcing');

COMMIT; 