-- First check which wagons should be on track 3 (Bümpliz) at 17:00 on 22.06.2025
-- This query directly examines the wagon trajectories
WITH track_3 AS (
  SELECT id FROM tracks WHERE name = '3' AND node_id IN (SELECT id FROM nodes WHERE name LIKE '%Bümpliz%')
)
SELECT 
  wt.id as trajectory_id,
  wt.wagon_id,
  wt.timestamp as event_time,
  wt.move_type,
  wt.track_id,
  t.name as track_name,
  wt.previous_track_id,
  pt.name as previous_track_name,
  w.number as wagon_number,
  w.type_id,
  wt.name as wagon_type,
  w.length,
  w.current_track_id,
  ct.name as current_track_name
FROM 
  wagon_trajectories wt
JOIN
  wagons w ON wt.wagon_id = w.id
JOIN
  tracks t ON wt.track_id = t.id
LEFT JOIN
  tracks pt ON wt.previous_track_id = pt.id
LEFT JOIN
  tracks ct ON w.current_track_id = ct.id
WHERE 
  wt.track_id IN (SELECT id FROM track_3)
  AND wt.timestamp <= '2025-06-22 17:00:00+00:00'
  AND wt.move_type IN ('delivery', 'internal')
ORDER BY
  wt.wagon_id, wt.timestamp;

-- Check if there are any departure events for these wagons before 17:00
WITH track_3 AS (
  SELECT id FROM tracks WHERE name = '3' AND node_id IN (SELECT id FROM nodes WHERE name LIKE '%Bümpliz%')
)
SELECT 
  wt.id as trajectory_id,
  wt.wagon_id,
  wt.timestamp as event_time,
  wt.move_type,
  wt.track_id as destination_track_id,
  dt.name as destination_track_name,
  wt.previous_track_id as source_track_id,
  st.name as source_track_name,
  w.number as wagon_number,
  w.type_id,
  wt.name as wagon_type
FROM 
  wagon_trajectories wt
JOIN
  wagons w ON wt.wagon_id = w.id
JOIN
  tracks dt ON wt.track_id = dt.id
JOIN
  tracks st ON wt.previous_track_id = st.id
WHERE 
  wt.previous_track_id IN (SELECT id FROM track_3)
  AND wt.timestamp <= '2025-06-22 17:00:00+00:00'
  AND wt.move_type IN ('departure', 'internal')
ORDER BY
  wt.wagon_id, wt.timestamp;

-- Check what the get_track_wagons_at_time function actually returns
WITH track_3 AS (
  SELECT id FROM tracks WHERE name = '3' AND node_id IN (SELECT id FROM nodes WHERE name LIKE '%Bümpliz%')
)
SELECT * FROM get_track_wagons_at_time(
  (SELECT id FROM track_3 LIMIT 1),
  '2025-06-22 17:00:00+00:00'
); 