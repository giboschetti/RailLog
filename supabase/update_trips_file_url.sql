-- Add file_url column to the trips table
ALTER TABLE trips 
ADD COLUMN file_url TEXT NULL;

-- Add a comment to the column
COMMENT ON COLUMN trips.file_url IS 'URL to the transport plan file for this trip';

-- Update the schema cache to fix the error
BEGIN;
  SELECT pg_advisory_lock(42);
  SELECT pg_notify('supabase_realtime', 'reload_schema');
  SELECT pg_advisory_unlock(42);
COMMIT; 