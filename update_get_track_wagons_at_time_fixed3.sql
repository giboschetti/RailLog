-- Update the get_track_wagons_at_time function to exclude 'initial' move_type
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
  WITH wagon_trajectories_ordered AS (
    -- Get all trajectories ordered by timestamp to establish chronological order
    -- IMPORTANT: Exclude 'initial' move_type to prevent early display
    SELECT
      wt.wagon_id,
      wt.timestamp,
      wt.move_type,
      wt.track_id,
      wt.previous_track_id,
      ROW_NUMBER() OVER (PARTITION BY wt.wagon_id ORDER BY wt.timestamp) AS event_order
    FROM
      wagon_trajectories wt
    WHERE
      (wt.track_id = track_id_param OR wt.previous_track_id = track_id_param)
      AND wt.move_type <> 'initial' -- Explicitly exclude 'initial' move_type
  ),
  wagon_location_events AS (
    -- For each wagon, determine if it's on the track at the specified time
    SELECT
      w.id AS wagon_id,
      w.number,
      w.length,
      w.content,
      w.project_id,
      w.construction_site_id,
      w.type_id,
      wt.name AS wagon_type,
      CASE
        -- Check if the wagon is on the track at the specified time
        WHEN EXISTS (
          SELECT 1
          FROM (
            -- Get the track where the wagon is at the specified time
            SELECT
              CASE
                -- If move_type is 'internal' or 'delivery', the wagon is moved TO track_id
                WHEN wto.move_type IN ('internal', 'delivery') THEN wto.track_id
                -- If move_type is 'internal' or 'departure', the wagon is moved FROM previous_track_id
                WHEN wto.move_type IN ('internal', 'departure') THEN NULL
                ELSE NULL
              END AS current_track_id,
              wto.timestamp AS event_time,
              wto.wagon_id
            FROM
              wagon_trajectories_ordered wto
            WHERE
              wto.wagon_id = w.id
            ORDER BY
              wto.timestamp ASC
          ) track_changes
          WHERE
            track_changes.event_time <= time_point
            AND track_changes.current_track_id IS NOT NULL
          ORDER BY
            track_changes.event_time DESC
          LIMIT 1
        ) AND track_id_param = (
          -- Get the most recent track_id for this wagon as of the specified time
          SELECT
            CASE
              WHEN wto.move_type IN ('internal', 'delivery') THEN wto.track_id
              WHEN wto.move_type IN ('internal', 'departure') THEN NULL
              ELSE NULL
            END AS current_track_id
          FROM
            wagon_trajectories_ordered wto
          WHERE
            wto.wagon_id = w.id
            AND wto.timestamp <= time_point
          ORDER BY
            wto.timestamp DESC
          LIMIT 1
        ) THEN TRUE
        ELSE FALSE
      END AS is_on_track,
      -- Get the arrival time for sorting wagons by when they arrived
      (
        SELECT MIN(wt.timestamp)
        FROM wagon_trajectories wt
        WHERE 
          wt.wagon_id = w.id
          AND wt.track_id = track_id_param
          AND wt.timestamp <= time_point
          AND wt.move_type IN ('delivery', 'internal') -- Exclude 'initial' here too
      ) AS arrival_time
    FROM
      wagons w
    LEFT JOIN
      wagon_types wt ON w.type_id = wt.id
    WHERE
      w.id IN (
        SELECT DISTINCT wto.wagon_id
        FROM wagon_trajectories_ordered wto
        WHERE wto.track_id = track_id_param
      )
  ),
  wagons_on_track AS (
    -- Filter to only wagons that are currently on the track
    SELECT *
    FROM wagon_location_events
    WHERE is_on_track = TRUE
    ORDER BY arrival_time ASC
  ),
  wagons_with_positions AS (
    -- Calculate cumulative positions based on actual wagon lengths
    SELECT
      wot.wagon_id,
      wot.number,
      wot.length,
      wot.content,
      wot.project_id,
      wot.construction_site_id,
      wot.type_id,
      wot.wagon_type,
      (SUM(wot.length) OVER (ORDER BY wot.arrival_time ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING))::integer AS position
    FROM
      wagons_on_track wot
  )
  SELECT 
    wwp.wagon_id,
    wwp.number,
    wwp.length,
    wwp.content,
    wwp.project_id,
    wwp.construction_site_id,
    wwp.type_id,
    wwp.position,
    wwp.wagon_type
  FROM 
    wagons_with_positions wwp
  ORDER BY
    wwp.position;
    
  RAISE NOTICE 'Track % wagons query completed for time %', track_id_param, time_point;
END;
$function$; 