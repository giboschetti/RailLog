-- Fix manual movement triggers to prevent duplicate trajectories
-- This script updates the add_wagon_trajectory_on_manual_move trigger function to prevent creating duplicate records

BEGIN;

-- Drop the trigger first to avoid dependency errors
DROP TRIGGER IF EXISTS add_trajectory_on_manual_move ON wagons;

-- Drop existing function now that the trigger is removed
DROP FUNCTION IF EXISTS public.add_wagon_trajectory_on_manual_move();

-- Create updated function with smarter duplicate prevention logic
CREATE OR REPLACE FUNCTION public.add_wagon_trajectory_on_manual_move()
RETURNS TRIGGER AS $$
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
      AND move_type IN ('internal')        -- Only consider internal movement types
      AND timestamp > NOW() - INTERVAL '1 hour'  -- Only recent movements (past hour)
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
$$
LANGUAGE plpgsql;

-- Make sure the trigger is attached to the wagons table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'add_wagon_trajectory_on_manual_move_trigger'
  ) THEN
    CREATE TRIGGER add_wagon_trajectory_on_manual_move_trigger
    AFTER UPDATE OF current_track_id ON wagons
    FOR EACH ROW
    EXECUTE FUNCTION add_wagon_trajectory_on_manual_move();
  END IF;
END
$$;

-- Also create a function to clean up any existing duplicate manual records
CREATE OR REPLACE FUNCTION cleanup_duplicate_manual_trajectories()
RETURNS TEXT AS $$
DECLARE
  deleted_count INTEGER := 0;
  result TEXT;
BEGIN
  -- Delete duplicate manual movements that occurred within a short time of a trip-based movement
  -- to the same track for the same wagon
  WITH trip_movements AS (
    -- Get all trip-based movements to use as reference
    SELECT wagon_id, track_id, timestamp, trip_id
    FROM wagon_trajectories
    WHERE move_type = 'internal' AND trip_id IS NOT NULL
  ),
  duplicate_manual_movements AS (
    -- Find manual movements that duplicate trip movements
    SELECT m.id
    FROM wagon_trajectories m
    JOIN trip_movements t ON 
      m.wagon_id = t.wagon_id AND
      m.track_id = t.track_id AND
      -- Manual record is close in time to the trip record
      ABS(EXTRACT(EPOCH FROM (t.timestamp - m.timestamp))) < 3600 -- Within 1 hour
    WHERE 
      m.move_type = 'manual' AND
      (m.trip_id IS NULL OR m.trip_id != t.trip_id)
  )
  DELETE FROM wagon_trajectories wt
  USING duplicate_manual_movements d
  WHERE wt.id = d.id
  RETURNING 1
  INTO deleted_count;
  
  -- Return a summary of what was cleaned up
  result := 'Deleted ' || COALESCE(deleted_count, 0) || ' duplicate manual trajectory records';
  
  -- Log the cleanup results
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES (
    'SYSTEM_CLEANUP', 
    'wagon_trajectories', 
    gen_random_uuid(), 
    jsonb_build_object(
      'message', 'Cleaned up duplicate manual trajectories',
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    )
  );
  
  RETURN result;
END;
$$
LANGUAGE plpgsql SECURITY DEFINER;

-- Run the cleanup function to fix existing duplicates
SELECT cleanup_duplicate_manual_trajectories();

-- Update the schema cache
SELECT pg_advisory_lock(42);
SELECT pg_notify('supabase_realtime', 'reload_schema');
SELECT pg_advisory_unlock(42);

-- Log the schema update
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  jsonb_build_object(
    'message', 'Updated manual trajectory trigger to prevent duplicates',
    'update_date', NOW()
  )
);

COMMIT; 