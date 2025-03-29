-- This query lists all functions in the database along with their definitions
SELECT 
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS function_arguments,
    t.typname AS return_type,
    CASE 
        WHEN p.proisagg THEN 'aggregate'
        WHEN p.proiswindow THEN 'window'
        WHEN p.proretset THEN 'set-returning'
        ELSE 'scalar'
    END AS function_type,
    CASE 
        WHEN p.provolatile = 'i' THEN 'immutable'
        WHEN p.provolatile = 's' THEN 'stable'
        WHEN p.provolatile = 'v' THEN 'volatile'
    END AS volatility,
    pg_get_functiondef(p.oid) AS function_definition
FROM 
    pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_type t ON p.prorettype = t.oid
WHERE 
    n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname IN ('public', 'auth', 'storage')
ORDER BY 
    n.nspname, p.proname; 