-- Add construction_site_id column to the trips table
ALTER TABLE trips 
ADD COLUMN construction_site_id UUID REFERENCES nodes(id) NULL;

-- Add an index to improve query performance
CREATE INDEX IF NOT EXISTS idx_trips_construction_site_id ON trips(construction_site_id);

-- Add a comment to the column
COMMENT ON COLUMN trips.construction_site_id IS 'Reference to the construction site (node) this trip is designated for';

-- Update the schema cache (fix for the error: Failed to create trip: Could not find the 'construction_site_id' column of 'trips' in the schema cache)
BEGIN;
  SELECT pg_advisory_lock(42);
  SELECT pg_notify('supabase_realtime', 'reload_schema');
  SELECT pg_advisory_unlock(42);
COMMIT; 