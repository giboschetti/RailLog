-- Examine the core logic of wagon selection to verify that it's working correctly
-- Let's directly execute the query inside get_track_wagons_at_time for track 3 at 17:00
WITH track_3 AS (
  SELECT id FROM tracks WHERE name = '3' AND node_id IN (SELECT id FROM nodes WHERE name LIKE '%Bümpliz%')
),
wagon_arrivals AS (
  -- Get the earliest arrival time for each wagon on this track
  SELECT
    wt.wagon_id AS wa_wagon_id,
    MIN(wt.timestamp) AS arrival_time
  FROM
    wagon_trajectories wt
  WHERE
    wt.track_id IN (SELECT id FROM track_3)
    AND wt.move_type IN ('delivery', 'internal')
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
    wt.previous_track_id IN (SELECT id FROM track_3)
    AND wt.move_type IN ('departure', 'internal')
  GROUP BY
    wt.wagon_id
),
relevant_wagons AS (
  -- Get wagons that are on the track at the specified time
  SELECT
    wa.wa_wagon_id AS rw_wagon_id,
    wa.arrival_time,
    wd.departure_time
  FROM
    wagon_arrivals wa
  LEFT JOIN
    wagon_departures wd ON wa.wa_wagon_id = wd.wd_wagon_id
  WHERE
    wa.arrival_time <= '2025-06-22 17:00:00+00:00'
    AND (wd.departure_time IS NULL OR wd.departure_time > '2025-06-22 17:00:00+00:00')
)
SELECT 
  rw.rw_wagon_id,
  w.number,
  w.length,
  w.content,
  wt.name AS wagon_type,
  rw.arrival_time,
  rw.departure_time,
  w.current_track_id,
  t.name AS current_track_name
FROM 
  relevant_wagons rw
JOIN
  wagons w ON rw.rw_wagon_id = w.id
LEFT JOIN
  wagon_types wt ON w.type_id = wt.id
LEFT JOIN
  tracks t ON w.current_track_id = t.id
ORDER BY
  rw.arrival_time;

-- Additionally, check all wagon trajectories for the day with complete context
WITH track_3 AS (
  SELECT id FROM tracks WHERE name = '3' AND node_id IN (SELECT id FROM nodes WHERE name LIKE '%Bümpliz%')
)
SELECT 
  wt.id,
  wt.wagon_id,
  w.number AS wagon_number,
  wt.timestamp,
  wt.move_type,
  wt.track_id,
  dt.name AS destination_track_name,
  wt.previous_track_id,
  st.name AS source_track_name
FROM 
  wagon_trajectories wt
JOIN
  wagons w ON wt.wagon_id = w.id
LEFT JOIN
  tracks dt ON wt.track_id = dt.id
LEFT JOIN
  tracks st ON wt.previous_track_id = st.id
WHERE
  (wt.track_id IN (SELECT id FROM track_3) OR wt.previous_track_id IN (SELECT id FROM track_3))
  AND wt.timestamp >= '2025-06-22 00:00:00+00:00'
  AND wt.timestamp <= '2025-06-22 23:59:59+00:00'
ORDER BY
  wt.wagon_id, wt.timestamp; 