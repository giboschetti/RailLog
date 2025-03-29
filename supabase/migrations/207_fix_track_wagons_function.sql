-- Drop and recreate the function with a simpler implementation
DROP FUNCTION IF EXISTS get_track_wagons_at_time(uuid, timestamp with time zone);

-- Create a simpler version that should work better with RPC
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
  -- Directly return the query result without CTE for better compatibility
  RETURN QUERY
  SELECT 
    t.id AS trajectory_id,
    t.wagon_id,
    t.timestamp AS event_time,
    t.move_type
  FROM (
    SELECT 
      wt.id,
      wt.wagon_id,
      wt.track_id,
      wt.move_type,
      wt.timestamp,
      ROW_NUMBER() OVER (
        PARTITION BY wt.wagon_id 
        ORDER BY wt.timestamp DESC
      ) AS row_num
    FROM 
      wagon_trajectories wt
    WHERE 
      wt.timestamp <= time_param
  ) t
  WHERE 
    t.row_num = 1 -- Most recent trajectory for each wagon
    AND t.track_id = track_id_param -- Wagon is on this track
    AND t.move_type IN ('delivery', 'internal', 'initial') -- Latest move was an arrival
    AND NOT EXISTS (
      -- Check that the wagon hasn't departed since the last arrival
      SELECT 1 
      FROM wagon_trajectories d
      WHERE 
        d.wagon_id = t.wagon_id AND
        d.timestamp > t.timestamp AND
        d.timestamp <= time_param AND
        d.move_type = 'departure'
    )
  ORDER BY 
    t.timestamp; -- Order by arrival time for visualization
END;
$$ LANGUAGE plpgsql; 