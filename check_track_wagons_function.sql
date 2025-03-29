-- First, check the function definition
SELECT pg_get_functiondef('get_track_wagons_at_time'::regproc);

-- Example query to see the output structure with test data
-- Replace with a valid track_id and date from your database
SELECT * FROM get_track_wagons_at_time('your_track_id_here', '2025-06-20T05:00:00+00:00');

-- Check the function return type
SELECT 
    p.proname AS function_name,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    pg_catalog.pg_get_function_arguments(p.oid) AS argument_types
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE 
    n.nspname = 'public' AND 
    p.proname = 'get_track_wagons_at_time'; 