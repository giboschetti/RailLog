-- Create enum types for restriction types and repetition patterns
CREATE TYPE restriction_type AS ENUM ('no_entry', 'no_exit');
CREATE TYPE repetition_pattern AS ENUM ('once', 'daily', 'weekly', 'monthly');

-- Create restrictions table
CREATE TABLE public.restrictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    repetition_pattern repetition_pattern NOT NULL DEFAULT 'once',
    restriction_types restriction_type[] NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT valid_date_range CHECK (end_datetime > start_datetime)
);

-- Create index on project_id for faster lookups
CREATE INDEX idx_restrictions_project_id ON public.restrictions(project_id);

-- Create a table for the many-to-many relationship between restrictions and tracks
CREATE TABLE public.restriction_tracks (
    restriction_id UUID NOT NULL REFERENCES public.restrictions(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    PRIMARY KEY (restriction_id, track_id)
);

-- Create indexes for faster lookups
CREATE INDEX idx_restriction_tracks_restriction_id ON public.restriction_tracks(restriction_id);
CREATE INDEX idx_restriction_tracks_track_id ON public.restriction_tracks(track_id);

-- Add RLS policies
ALTER TABLE public.restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restriction_tracks ENABLE ROW LEVEL SECURITY;

-- Policy for restrictions - users can read all but only modify their own projects
CREATE POLICY "Users can view all restrictions" 
ON public.restrictions FOR SELECT USING (true);

CREATE POLICY "Users can insert restrictions for their projects" 
ON public.restrictions FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM projects 
    WHERE id = project_id 
    AND (auth.uid() = owner_id OR auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = restrictions.project_id
    ))
));

CREATE POLICY "Users can update restrictions for their projects" 
ON public.restrictions FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM projects 
    WHERE id = project_id 
    AND (auth.uid() = owner_id OR auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = restrictions.project_id
    ))
));

CREATE POLICY "Users can delete restrictions for their projects" 
ON public.restrictions FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM projects 
    WHERE id = project_id 
    AND (auth.uid() = owner_id OR auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = restrictions.project_id
    ))
));

-- Policy for restriction_tracks
CREATE POLICY "Users can view all restriction tracks" 
ON public.restriction_tracks FOR SELECT USING (true);

CREATE POLICY "Users can insert restriction tracks for their restrictions" 
ON public.restriction_tracks FOR INSERT 
WITH CHECK (EXISTS (
    SELECT 1 FROM restrictions r 
    JOIN projects p ON r.project_id = p.id
    WHERE r.id = restriction_id 
    AND (auth.uid() = p.owner_id OR auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = p.id
    ))
));

CREATE POLICY "Users can delete restriction tracks for their restrictions" 
ON public.restriction_tracks FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM restrictions r 
    JOIN projects p ON r.project_id = p.id
    WHERE r.id = restriction_id 
    AND (auth.uid() = p.owner_id OR auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = p.id
    ))
));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for restrictions
CREATE TRIGGER update_restrictions_updated_at
BEFORE UPDATE ON public.restrictions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column(); 