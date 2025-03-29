-- Check the internal trip scheduled for 15:00
SELECT 
  t.id AS trip_id,
  t.type,
  t.datetime,
  t.is_planned,
  t.is_executed,
  t.source_track_id,
  st.name AS source_track_name,
  sn.name AS source_node_name,
  t.dest_track_id,
  dt.name AS dest_track_name,
  dn.name AS dest_node_name,
  t.transport_plan_number
FROM 
  trips t
LEFT JOIN
  tracks st ON t.source_track_id = st.id
LEFT JOIN
  nodes sn ON st.node_id = sn.id
LEFT JOIN
  tracks dt ON t.dest_track_id = dt.id
LEFT JOIN
  nodes dn ON dt.node_id = dn.id
WHERE
  t.datetime = '2025-06-22 15:00:00+00:00'
  AND t.type = 'internal';

-- Check which wagons are associated with this trip
WITH internal_trip AS (
  SELECT id FROM trips 
  WHERE datetime = '2025-06-22 15:00:00+00:00' AND type = 'internal'
)
SELECT 
  tw.trip_id,
  tw.wagon_id,
  w.number AS wagon_number,
  w.type_id,
  wt.name AS wagon_type,
  w.length,
  w.content,
  w.current_track_id,
  t.name AS current_track_name
FROM 
  trip_wagons tw
JOIN
  wagons w ON tw.wagon_id = w.id
LEFT JOIN
  wagon_types wt ON w.type_id = wt.id
LEFT JOIN
  tracks t ON w.current_track_id = t.id
WHERE
  tw.trip_id IN (SELECT id FROM internal_trip);

-- Check if the wagon trajectory records were created for this trip
WITH internal_trip AS (
  SELECT id, datetime, source_track_id, dest_track_id 
  FROM trips 
  WHERE datetime = '2025-06-22 15:00:00+00:00' AND type = 'internal'
),
trip_wagon_ids AS (
  SELECT tw.wagon_id 
  FROM trip_wagons tw
  JOIN internal_trip it ON tw.trip_id = it.id
)
SELECT 
  wt.id AS trajectory_id,
  wt.wagon_id,
  w.number AS wagon_number,
  wt.timestamp,
  wt.move_type,
  wt.track_id,
  dt.name AS dest_track_name,
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
  wt.wagon_id IN (SELECT wagon_id FROM trip_wagon_ids)
  AND wt.timestamp >= '2025-06-22 00:00:00+00:00'
  AND wt.timestamp <= '2025-06-22 23:59:59+00:00'
ORDER BY
  wt.wagon_id, wt.timestamp; 