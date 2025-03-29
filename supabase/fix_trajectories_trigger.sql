-- Fix for all trip types - add a trigger to ensure wagon_trajectories has trip_id
-- This script implements an after-insert trigger on trip_wagons that will automatically create trajectories

BEGIN;

-- Create a trigger function that runs after trip_wagons insertion
CREATE OR REPLACE FUNCTION public.create_trajectory_after_trip_wagon()
RETURNS TRIGGER AS $$
DECLARE
  v_trip_record RECORD;
  v_wagon_record RECORD;
  v_source_node_id UUID;
  v_dest_node_id UUID;
  v_move_type TEXT;
  v_has_existing_trajectory BOOLEAN;
BEGIN
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
$$
LANGUAGE plpgsql;

-- Create the trigger if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'create_trajectory_after_trip_wagon_trigger'
  ) THEN
    CREATE TRIGGER create_trajectory_after_trip_wagon_trigger
    AFTER INSERT ON trip_wagons
    FOR EACH ROW
    EXECUTE FUNCTION create_trajectory_after_trip_wagon();
  END IF;
END
$$;

-- Fix existing trips that have no trajectories or where trip_id isn't set
DO $$
DECLARE
  missing_trajectory_count INTEGER;
BEGIN
  WITH missing_trajectories AS (
    SELECT 
      tw.trip_id,
      tw.wagon_id,
      t.type as trip_type,
      t.datetime,
      t.source_track_id,
      t.dest_track_id
    FROM 
      trip_wagons tw
      JOIN trips t ON tw.trip_id = t.id
    WHERE 
      NOT EXISTS (
        SELECT 1 
        FROM wagon_trajectories wt 
        WHERE wt.wagon_id = tw.wagon_id 
        AND wt.trip_id = tw.trip_id
      )
  ),
  inserted_trajectories AS (
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
    )
    SELECT 
      gen_random_uuid(),
      mt.wagon_id,
      CASE mt.trip_type 
        WHEN 'delivery' THEN mt.dest_track_id
        WHEN 'departure' THEN NULL
        ELSE mt.dest_track_id
      END,
      CASE mt.trip_type 
        WHEN 'delivery' THEN (SELECT node_id FROM tracks WHERE id = mt.dest_track_id)
        WHEN 'departure' THEN NULL
        ELSE (SELECT node_id FROM tracks WHERE id = mt.dest_track_id)
      END,
      mt.datetime,
      CASE 
        WHEN mt.trip_type = 'delivery' AND NOT EXISTS (
          SELECT 1 FROM wagon_trajectories WHERE wagon_id = mt.wagon_id
        ) THEN 'initial'
        ELSE mt.trip_type
      END,
      mt.trip_id,
      mt.source_track_id,
      NOW(),
      NOW()
    FROM 
      missing_trajectories mt
    RETURNING 1
  )
  SELECT COUNT(*) INTO missing_trajectory_count FROM inserted_trajectories;
  
  RAISE NOTICE 'Fixed % missing trajectory records', missing_trajectory_count;
END
$$;

-- Add audit log entry
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Added trigger to create wagon_trajectories with trip_id for all trip types',
    'update_date', NOW()
  )
);

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

COMMIT; 