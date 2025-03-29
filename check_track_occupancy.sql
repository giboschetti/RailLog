-- Check track occupancy calculation for a specific track
-- Replace with your track ID and date
SELECT * FROM get_track_occupancy_at_time('your_track_id_here', '2025-06-20T05:00:00+00:00');

-- Check function definition
SELECT pg_get_functiondef('get_track_occupancy_at_time'::regproc);

-- To see the wagons on a specific track and their lengths
SELECT 
    w.id,
    w.number,
    w.length,
    w.current_track_id,
    t.name AS track_name,
    t.useful_length AS track_length
FROM 
    wagons w
JOIN 
    tracks t ON w.current_track_id = t.id
WHERE 
    w.current_track_id = 'your_track_id_here';

-- To verify wagon trajectories
SELECT 
    wt.*,
    w.length,
    t.name AS track_name,
    t.useful_length AS track_length
FROM 
    wagon_trajectories wt
JOIN 
    wagons w ON wt.wagon_id = w.id
JOIN 
    tracks t ON wt.track_id = t.id
WHERE 
    wt.track_id = 'your_track_id_here'
    AND wt.arrival_time <= '2025-06-20T05:00:00+00:00'
    AND (wt.departure_time IS NULL OR wt.departure_time > '2025-06-20T05:00:00+00:00')
ORDER BY 
    wt.arrival_time; 