-- Update the get_track_wagons_at_time function to use sequential positioning based on actual wagon lengths
CREATE OR REPLACE FUNCTION public.get_track_wagons_at_time(
  track_id_param uuid, 
  time_point timestamp with time zone
) 
RETURNS TABLE(
  wagon_id uuid, 
  number text, 
  length integer, 
  content text, 
  project_id uuid, 
  construction_site_id uuid, 
  type_id uuid, 
  "position" integer, 
  wagon_type text
) 
LANGUAGE plpgsql
AS $function$
DECLARE
  track_exists boolean;
BEGIN
  -- First check if the track exists
  SELECT EXISTS(SELECT 1 FROM tracks WHERE id = track_id_param) INTO track_exists;
  
  IF NOT track_exists THEN
    RAISE NOTICE 'Track with ID % not found', track_id_param;
    RETURN;
  END IF;
  
  -- Return wagons on this track that have arrived by the specified time point
  RETURN QUERY
  WITH wagon_arrivals AS (
    -- Get the earliest arrival time for each wagon on this track
    -- IMPORTANT: Exclude 'initial' move types to prevent early display
    SELECT
      wt.wagon_id AS wa_wagon_id,
      MIN(wt.timestamp) AS arrival_time
    FROM
      wagon_trajectories wt
    WHERE
      wt.track_id = track_id_param
      AND wt.move_type IN ('delivery', 'internal') -- Removed 'initial'
    GROUP BY
      wt.wagon_id
  ),
  wagon_departures AS (
    -- Get the earliest departure time after arrival for each wagon from this track
    SELECT
      wt.wagon_id AS wd_wagon_id,
      MIN(wt.timestamp) AS departure_time
    FROM
      wagon_trajectories wt
    WHERE
      wt.previous_track_id = track_id_param
      AND wt.move_type IN ('departure', 'internal')
    GROUP BY
      wt.wagon_id
  ),
  relevant_wagons AS (
    -- Get wagons that are on the track at the specified time
    SELECT
      wa.wa_wagon_id AS rw_wagon_id
    FROM
      wagon_arrivals wa
    LEFT JOIN
      wagon_departures wd ON wa.wa_wagon_id = wd.wd_wagon_id
    WHERE
      wa.arrival_time <= time_point
      AND (wd.departure_time IS NULL OR wd.departure_time > time_point)
  ),
  wagons_with_details AS (
    -- Get all relevant wagon details
    SELECT 
      w.id,
      w.number,
      w.length,
      w.content,
      w.project_id,
      w.construction_site_id,
      w.type_id,
      wt.name AS wagon_type,
      -- Sort by arrival time to ensure consistent ordering
      ROW_NUMBER() OVER (ORDER BY wa.arrival_time) AS sort_order
    FROM 
      relevant_wagons rw
    JOIN
      wagons w ON rw.rw_wagon_id = w.id
    LEFT JOIN
      wagon_types wt ON w.type_id = wt.id
    LEFT JOIN
      wagon_arrivals wa ON rw.rw_wagon_id = wa.wa_wagon_id
  ),
  wagons_with_positions AS (
    -- Calculate cumulative positions based on actual wagon lengths
    SELECT
      id,
      number,
      length,
      content,
      project_id,
      construction_site_id,
      type_id,
      wagon_type,
      (SUM(length) OVER (ORDER BY sort_order ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING))::integer AS position
    FROM
      wagons_with_details
  )
  SELECT 
    id,
    number,
    length,
    content,
    project_id,
    construction_site_id,
    type_id,
    position,
    wagon_type
  FROM 
    wagons_with_positions
  ORDER BY
    position;
    
  RAISE NOTICE 'Track % wagons query completed for time %', track_id_param, time_point;
END;
$function$; 