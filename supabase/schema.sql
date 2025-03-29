-- Enable Row Level Security
ALTER DATABASE postgres SET timezone TO 'Europe/Berlin';

-- Create schema for Rail Log tables
CREATE SCHEMA IF NOT EXISTS public;

/**
 * TABLES
 * These are the tables required for the Rail Log application
 */

-- PROJECTS Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NODES Table (Logistikknoten - Stations/Sites)
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('station', 'site')),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRACKS Table (Gleise)
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  length INTEGER NOT NULL, -- Length in meters
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WAGON_TYPES Table (for master list of wagon types)
CREATE TABLE IF NOT EXISTS wagon_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  default_length INTEGER NOT NULL, -- Default length in meters
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WAGONS Table
CREATE TABLE IF NOT EXISTS wagons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT, -- Optional external ID
  type_id UUID REFERENCES wagon_types(id),
  custom_type TEXT, -- For custom wagon types
  length INTEGER NOT NULL, -- Length in meters
  content TEXT, -- Optional content description
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  track_id UUID REFERENCES tracks(id) ON DELETE SET NULL, -- Current track location
  current_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL, -- Explicit current track, updated by triggers/functions
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_type CHECK (
    (type_id IS NOT NULL AND custom_type IS NULL) OR 
    (type_id IS NULL AND custom_type IS NOT NULL)
  )
);

-- TRIP_TYPES Enum Table
CREATE TABLE IF NOT EXISTS trip_types (
  type TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- Insert trip types
INSERT INTO trip_types (type, description)
VALUES 
  ('delivery', 'Lieferung'),
  ('departure', 'Abfahrt'),
  ('internal', 'Interne Bewegung')
ON CONFLICT (type) DO NOTHING;

-- TRIPS Table (for wagon movements)
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL REFERENCES trip_types(type),
  datetime TIMESTAMPTZ NOT NULL,
  source_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  dest_track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
  transport_plan_number TEXT,
  is_planned BOOLEAN NOT NULL DEFAULT true, -- true = planned, false = effective
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRIP_WAGONS (Junction table for trips and wagons)
CREATE TABLE IF NOT EXISTS trip_wagons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  wagon_id UUID NOT NULL REFERENCES wagons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, wagon_id)
);

-- RESTRICTION_TYPES Enum Table
CREATE TABLE IF NOT EXISTS restriction_types (
  type TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- Insert restriction types
INSERT INTO restriction_types (type, description)
VALUES 
  ('no_entry', 'Kein Eingang möglich'),
  ('no_exit', 'Kein Ausgang möglich')
ON CONFLICT (type) DO NOTHING;

-- RECURRENCE_TYPES Enum Table
CREATE TABLE IF NOT EXISTS recurrence_types (
  type TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

-- Insert recurrence types
INSERT INTO recurrence_types (type, description)
VALUES 
  ('none', 'Keine Wiederholung'),
  ('daily', 'Täglich'),
  ('weekly', 'Wöchentlich'),
  ('monthly', 'Monatlich')
ON CONFLICT (type) DO NOTHING;

-- RESTRICTIONS Table
CREATE TABLE IF NOT EXISTS restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL REFERENCES restriction_types(type),
  from_datetime TIMESTAMPTZ NOT NULL,
  to_datetime TIMESTAMPTZ NOT NULL,
  recurrence TEXT NOT NULL REFERENCES recurrence_types(type) DEFAULT 'none',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_datetime CHECK (from_datetime < to_datetime)
);

-- DAILY_RESTRICTIONS Table (expanded daily records for restrictions)
CREATE TABLE IF NOT EXISTS daily_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_restriction_id UUID NOT NULL REFERENCES restrictions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  restriction_date DATE NOT NULL,
  time_from TIME NOT NULL,
  time_to TIME NOT NULL, 
  type TEXT NOT NULL REFERENCES restriction_types(type),
  betroffene_gleise UUID[] NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_daily_restrictions_original_id ON daily_restrictions(original_restriction_id);
CREATE INDEX idx_daily_restrictions_date ON daily_restrictions(restriction_date);
CREATE INDEX idx_daily_restrictions_project ON daily_restrictions(project_id);

-- RESTRICTION_NODES (Junction table for restrictions affecting nodes)
CREATE TABLE IF NOT EXISTS restriction_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restriction_id UUID NOT NULL REFERENCES restrictions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restriction_id, node_id)
);

-- RESTRICTION_TRACKS (Junction table for restrictions affecting specific tracks)
CREATE TABLE IF NOT EXISTS restriction_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restriction_id UUID NOT NULL REFERENCES restrictions(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restriction_id, track_id)
);

-- Add USERS Table for Authentication and Authorization
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/**
 * FUNCTIONS AND TRIGGERS
 */

-- Function to update timestamp columns
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at
CREATE TRIGGER update_projects_timestamp BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_nodes_timestamp BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_tracks_timestamp BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_wagon_types_timestamp BEFORE UPDATE ON wagon_types
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_wagons_timestamp BEFORE UPDATE ON wagons
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_trips_timestamp BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_restrictions_timestamp BEFORE UPDATE ON restrictions
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- Function to check track capacity before adding wagon
CREATE OR REPLACE FUNCTION check_track_capacity()
RETURNS TRIGGER AS $$
DECLARE
  track_length INTEGER;
  current_usage INTEGER;
BEGIN
  -- Only check if a track_id is provided
  IF NEW.track_id IS NOT NULL THEN
    -- Get track length
    SELECT useful_length INTO track_length FROM tracks WHERE id = NEW.track_id;
    
    -- Calculate current usage (excluding this wagon if it's an update)
    SELECT COALESCE(SUM(length), 0) INTO current_usage 
    FROM wagons 
    WHERE track_id = NEW.track_id 
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
    
    -- Check if adding this wagon would exceed capacity
    IF (current_usage + NEW.length) > track_length THEN
      RAISE EXCEPTION 'Adding this wagon would exceed track capacity';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for capacity check
CREATE TRIGGER check_wagon_capacity BEFORE INSERT OR UPDATE ON wagons
  FOR EACH ROW EXECUTE PROCEDURE check_track_capacity();

-- Function to validate trip against restrictions
CREATE OR REPLACE FUNCTION validate_trip()
RETURNS TRIGGER AS $$
DECLARE
  source_node_id UUID;
  dest_node_id UUID;
  restriction_count INTEGER;
BEGIN
  -- Get nodes for source and destination tracks
  IF NEW.source_track_id IS NOT NULL THEN
    SELECT node_id INTO source_node_id FROM tracks WHERE id = NEW.source_track_id;
  END IF;
  
  IF NEW.dest_track_id IS NOT NULL THEN
    SELECT node_id INTO dest_node_id FROM tracks WHERE id = NEW.dest_track_id;
  END IF;
  
  -- Check for restrictions if it's a departure
  IF NEW.type = 'departure' AND NEW.source_track_id IS NOT NULL THEN
    SELECT COUNT(*) INTO restriction_count
    FROM restrictions r
    LEFT JOIN restriction_nodes rn ON r.id = rn.restriction_id
    LEFT JOIN restriction_tracks rt ON r.id = rt.restriction_id
    WHERE 
      r.type = 'no_exit' AND
      NEW.datetime BETWEEN r.from_datetime AND r.to_datetime AND
      (
        rt.track_id = NEW.source_track_id OR
        rn.node_id = source_node_id
      );
      
    IF restriction_count > 0 THEN
      RAISE WARNING 'This trip conflicts with existing exit restrictions';
      -- We'll allow it but flag it as problematic
      -- Could add a 'has_conflicts' column to trips table
    END IF;
  END IF;
  
  -- Check for restrictions if it's a delivery
  IF NEW.type = 'delivery' AND NEW.dest_track_id IS NOT NULL THEN
    SELECT COUNT(*) INTO restriction_count
    FROM restrictions r
    LEFT JOIN restriction_nodes rn ON r.id = rn.restriction_id
    LEFT JOIN restriction_tracks rt ON r.id = rt.restriction_id
    WHERE 
      r.type = 'no_entry' AND
      NEW.datetime BETWEEN r.from_datetime AND r.to_datetime AND
      (
        rt.track_id = NEW.dest_track_id OR
        rn.node_id = dest_node_id
      );
      
    IF restriction_count > 0 THEN
      RAISE WARNING 'This trip conflicts with existing entry restrictions';
      -- We'll allow it but flag it as problematic
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for trip validation
CREATE TRIGGER validate_trip_restrictions BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW EXECUTE PROCEDURE validate_trip();

-- Function to update wagon location after trip
CREATE OR REPLACE FUNCTION update_wagon_location()
RETURNS TRIGGER AS $$
BEGIN
  -- For each wagon in this trip, update its location
  IF NEW.dest_track_id IS NOT NULL THEN
    UPDATE wagons
    SET track_id = NEW.dest_track_id
    WHERE id IN (
      SELECT wagon_id FROM trip_wagons WHERE trip_id = NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wagon location update
CREATE TRIGGER update_wagon_after_trip AFTER INSERT OR UPDATE ON trips
  FOR EACH ROW EXECUTE PROCEDURE update_wagon_location();

/**
 * ROW LEVEL SECURITY POLICIES
 */

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wagon_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE wagons ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_wagons ENABLE ROW LEVEL SECURITY;
ALTER TABLE restriction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restriction_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE restriction_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies for projects
CREATE POLICY "Everyone can read projects"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

-- Create similar policies for all other tables
-- For brevity, we'll add just the project ones and
-- you can adapt them for other tables as needed

-- Add more detailed policies as needed

-- Create policies for daily_restrictions
CREATE POLICY "Everyone can read daily restrictions"
  ON daily_restrictions FOR SELECT
  USING (true);

CREATE POLICY "Any authenticated user can insert daily restrictions" 
ON daily_restrictions FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can update daily restrictions" 
ON daily_restrictions FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can delete daily restrictions" 
ON daily_restrictions FOR DELETE 
USING (auth.uid() IS NOT NULL); 