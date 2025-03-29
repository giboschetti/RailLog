-- Improve the trip deletion handler to better handle wagon current_track_id
CREATE OR REPLACE FUNCTION handle_trip_deletion()
RETURNS TRIGGER AS $$
DECLARE
  v_wagon_record RECORD;
  v_prev_track_id UUID;
  v_source_track_id UUID := OLD.source_track_id;
  v_dest_track_id UUID := OLD.dest_track_id;
  v_trip_type TEXT := OLD.type;
  v_prev_trajectory RECORD;
BEGIN
  -- Log the deletion for diagnostic purposes
  INSERT INTO audit_logs (action, table_name, record_id, details)
  VALUES (
    'DELETE', 
    'trips',
    OLD.id,
    jsonb_build_object(
      'type', v_trip_type,
      'datetime', OLD.datetime,
      'source_track_id', v_source_track_id,
      'dest_track_id', v_dest_track_id
    )
  );
  
  -- For each wagon in this trip
  FOR v_wagon_record IN (
    SELECT wagon_id FROM trip_wagons WHERE trip_id = OLD.id
  ) LOOP
    -- Find the most recent trajectory record for this wagon before this trip
    SELECT * INTO v_prev_trajectory
    FROM wagon_trajectories wt
    WHERE 
      wt.wagon_id = v_wagon_record.wagon_id
      AND wt.trip_id IS DISTINCT FROM OLD.id  -- Not the current trip
      AND wt.timestamp < OLD.datetime         -- Before the current trip
    ORDER BY wt.timestamp DESC
    LIMIT 1;
    
    -- If we found a previous trajectory
    IF FOUND THEN
      v_prev_track_id := v_prev_trajectory.track_id;
      
      -- If this was a delivery or internal trip, we need to revert the wagon to its previous track
      IF v_trip_type IN ('delivery', 'internal') THEN
        -- Create a new trajectory record to revert the wagon placement
        INSERT INTO wagon_trajectories (
          wagon_id,
          track_id,
          node_id,
          timestamp,
          move_type,
          previous_track_id
        ) VALUES (
          v_wagon_record.wagon_id,
          v_prev_track_id,
          (SELECT node_id FROM tracks WHERE id = v_prev_track_id),
          NOW(),
          'manual', -- Mark as manual update due to trip deletion
          v_dest_track_id
        );
        
        -- Update the wagon's current_track_id to its previous location
        UPDATE wagons
        SET current_track_id = v_prev_track_id
        WHERE id = v_wagon_record.wagon_id;
      END IF;
    ELSE
      -- If no previous trajectory found and this was a delivery, 
      -- the wagon should be removed from the track
      IF v_trip_type = 'delivery' THEN
        -- Update the wagon's current_track_id to NULL
        UPDATE wagons
        SET current_track_id = NULL
        WHERE id = v_wagon_record.wagon_id;
        
        -- Create a trajectory record indicating removal
        INSERT INTO wagon_trajectories (
          wagon_id,
          track_id,
          node_id,
          timestamp,
          move_type,
          previous_track_id
        ) VALUES (
          v_wagon_record.wagon_id,
          v_dest_track_id, -- Use the dest track as the track being left
          (SELECT node_id FROM tracks WHERE id = v_dest_track_id),
          NOW(),
          'manual', -- Mark as manual removal
          v_dest_track_id
        );
      END IF;
    END IF;
  END LOOP;
  
  -- Mark the trip's trajectory records as deleted
  UPDATE wagon_trajectories
  SET trip_id = NULL  -- Disassociate from the deleted trip
  WHERE trip_id = OLD.id;
  
  -- Return OLD to allow the deletion to proceed
  RETURN OLD;
END;
$$ LANGUAGE plpgsql; 