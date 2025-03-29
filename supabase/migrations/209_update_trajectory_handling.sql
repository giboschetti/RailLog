-- Update the get_track_wagons_at_time function to only return wagons at or after their delivery time
CREATE OR REPLACE FUNCTION get_track_wagons_at_time(
  track_id_param UUID,
  time_param TIMESTAMPTZ
)
RETURNS TABLE (
  trajectory_id UUID,
  wagon_id UUID,
  event_time TIMESTAMPTZ,
  move_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_trajectories AS (
    SELECT 
      wt.id,
      wt.wagon_id,
      wt.track_id,
      wt.move_type,
      wt.timestamp,
      ROW_NUMBER() OVER (PARTITION BY wt.wagon_id ORDER BY wt.timestamp DESC) AS row_num
    FROM wagon_trajectories wt
    WHERE wt.timestamp <= time_param
  )
  SELECT 
    lt.id AS trajectory_id,
    lt.wagon_id,
    lt.timestamp AS event_time,
    lt.move_type
  FROM latest_trajectories lt
  WHERE 
    lt.row_num = 1
    AND lt.track_id = track_id_param
    AND lt.move_type IN ('delivery', 'internal', 'initial')
    AND NOT EXISTS (
      SELECT 1 FROM wagon_trajectories d
      WHERE 
        d.wagon_id = lt.wagon_id 
        AND d.timestamp > lt.timestamp 
        AND d.timestamp <= time_param
        AND d.move_type = 'departure'
    )
  ORDER BY lt.timestamp;
END;
$$ LANGUAGE plpgsql;

-- Update comment or explanation for move_type values in trajectoryUtils
COMMENT ON COLUMN wagon_trajectories.move_type IS 'Type of movement: delivery (for first placement or delivery), departure, internal, manual';

-- Add audit log entries to record that we've removed Erstplatzierung
INSERT INTO audit_logs (action, table_name, record_id, details)
VALUES (
  'SYSTEM_UPDATE', 
  'system', 
  gen_random_uuid(), 
  '{"message": "Removed separate Erstplatzierung trips. Wagons now only appear on their scheduled delivery date."}'
); 