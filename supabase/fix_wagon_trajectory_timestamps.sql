-- Fix wagon trajectory timestamps issue
-- This script updates the wagon_trajectories table to use the correct delivery trip timestamp

-- Create a function to fix trajectories for a single wagon
CREATE OR REPLACE FUNCTION fix_wagon_trajectories(wagon_id_param UUID)
RETURNS VOID AS $$
DECLARE
  delivery_trip RECORD;
  initial_record RECORD;
BEGIN
  -- Find the delivery trip for this wagon
  SELECT 
    tw.wagon_id, 
    t.id AS trip_id, 
    t.datetime AS trip_datetime,
    t.dest_track_id
  INTO delivery_trip
  FROM 
    trip_wagons tw
    JOIN trips t ON tw.trip_id = t.id
  WHERE 
    tw.wagon_id = wagon_id_param
    AND t.type = 'delivery'
  ORDER BY
    t.datetime ASC
  LIMIT 1;

  -- If we found a delivery trip
  IF FOUND THEN
    -- Find the initial trajectory record
    SELECT *
    INTO initial_record
    FROM wagon_trajectories
    WHERE 
      wagon_id = wagon_id_param
      AND move_type = 'initial'
    LIMIT 1;

    -- If we found an initial record
    IF FOUND THEN
      -- Update the initial record to match the delivery trip timestamp
      UPDATE wagon_trajectories
      SET 
        timestamp = delivery_trip.trip_datetime,
        trip_id = delivery_trip.trip_id,
        updated_at = NOW()
      WHERE id = initial_record.id;
      
      RAISE NOTICE 'Updated trajectory record % for wagon % to use timestamp from trip %', 
        initial_record.id, wagon_id_param, delivery_trip.trip_id;
    ELSE
      RAISE NOTICE 'No initial trajectory record found for wagon %', wagon_id_param;
    END IF;
  ELSE
    RAISE NOTICE 'No delivery trip found for wagon %', wagon_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the fix for all wagons with trajectories
DO $$
DECLARE
  wagon_record RECORD;
  fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting to fix wagon trajectory timestamps...';
  
  FOR wagon_record IN 
    SELECT DISTINCT wagon_id 
    FROM wagon_trajectories 
    WHERE move_type = 'initial'
  LOOP
    BEGIN
      PERFORM fix_wagon_trajectories(wagon_record.wagon_id);
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error fixing trajectories for wagon %: %', wagon_record.wagon_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Fixed trajectories for % wagons', fixed_count;
END $$;

-- Drop the temporary function
DROP FUNCTION IF EXISTS fix_wagon_trajectories(UUID);

-- Add an audit log entry
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'DATA_FIX', 
  'wagon_trajectories', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Fixed initial trajectory timestamps to match delivery trip dates',
    'fix_date', NOW()
  )
); 