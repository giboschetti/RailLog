-- Create a function to efficiently retrieve wagons on a track at a specific time
CREATE OR REPLACE FUNCTION get_track_wagons_at_time(
  track_id_param UUID,
  time_param TIMESTAMPTZ
)
RETURNS TABLE (
  trajectory_id UUID,
  wagon_id UUID,
  event_time TIMESTAMPTZ
) AS $$
BEGIN
  -- Use a CTE to find the most recent trajectory entry for each wagon
  RETURN QUERY
  WITH latest_trajectories AS (
    SELECT DISTINCT ON (wt.wagon_id)
      wt.id,
      wt.wagon_id,
      wt.track_id,
      wt.timestamp,
      wt.move_type
    FROM 
      wagon_trajectories wt
    WHERE 
      wt.timestamp <= time_param
    ORDER BY 
      wt.wagon_id, wt.timestamp DESC
  )
  SELECT 
    lt.id,
    lt.wagon_id,
    lt.timestamp AS event_time
  FROM 
    latest_trajectories lt
  WHERE 
    lt.track_id = track_id_param AND
    -- Wagon is on track if latest move was delivery, internal, or initial
    lt.move_type IN ('delivery', 'internal', 'initial') AND
    -- Ensuring a wagon that departed later is not counted as being on the track
    NOT EXISTS (
      SELECT 1 
      FROM wagon_trajectories wt
      WHERE 
        wt.wagon_id = lt.wagon_id AND
        wt.timestamp > lt.timestamp AND
        wt.timestamp <= time_param AND
        wt.move_type = 'departure' AND
        wt.track_id = track_id_param
    )
  ORDER BY
    lt.timestamp;
END;
$$ LANGUAGE plpgsql; 