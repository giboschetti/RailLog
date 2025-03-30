-- Fix the fix_trip_trajectory_inconsistencies function to not reference 'name' field
CREATE OR REPLACE FUNCTION public.fix_trip_trajectory_inconsistencies()
RETURNS TABLE(trip_id UUID, trip_identifier TEXT, wagons_fixed INTEGER)
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
        trip_identifier TEXT,
        wagons_fixed INTEGER
    ) ON COMMIT DROP;
    
    -- Find trips with inconsistencies
    FOR trip_rec IN 
        SELECT 
            t.id AS trip_id,
            COALESCE(t.transport_plan_number, 'Trip ' || t.id::text) AS trip_identifier, -- Changed from t.name
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
            trip_rec.trip_identifier, -- Changed from trip_name
            fixed_count
        );
    END LOOP;
    
    -- Return the results
    RETURN QUERY
    SELECT * FROM fixed_trips;
END;
$function$; 