-- Enable RLS on projects table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting projects (everyone with a valid role can view)
CREATE POLICY "All users can view projects" 
ON public.projects 
FOR SELECT 
USING (public.can_access_data());

-- Create policy for inserting projects (only admins)
CREATE POLICY "Only admins can create projects" 
ON public.projects 
FOR INSERT 
WITH CHECK (public.is_admin());

-- Create policy for updating projects (only admins)
CREATE POLICY "Only admins can update projects" 
ON public.projects 
FOR UPDATE 
USING (public.is_admin());

-- Create policy for deleting projects (only admins)
CREATE POLICY "Only admins can delete projects" 
ON public.projects 
FOR DELETE 
USING (public.is_admin());

-- Enable RLS on nodes table
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting nodes (everyone with a valid role can view)
CREATE POLICY "All users can view nodes" 
ON public.nodes 
FOR SELECT 
USING (public.can_access_data());

-- Create policy for inserting nodes
CREATE POLICY "Users can create nodes" 
ON public.nodes 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating nodes
CREATE POLICY "Users can update nodes" 
ON public.nodes 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create policy for deleting nodes
CREATE POLICY "Users can delete nodes" 
ON public.nodes 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Enable RLS on tracks table
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting tracks (everyone with a valid role can view)
CREATE POLICY "All users can view tracks" 
ON public.tracks 
FOR SELECT 
USING (public.can_access_data());

-- Create policy for inserting tracks
CREATE POLICY "Users can create tracks" 
ON public.tracks 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating tracks
CREATE POLICY "Users can update tracks" 
ON public.tracks 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create policy for deleting tracks
CREATE POLICY "Users can delete tracks" 
ON public.tracks 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- For testing/development, you can temporarily allow all authenticated users to perform all actions
-- COMMENT OUT THESE POLICIES IN PRODUCTION
CREATE POLICY "Any authenticated user can manage projects during development" 
ON public.projects 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can manage nodes during development" 
ON public.nodes 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can manage tracks during development" 
ON public.tracks 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Add similar policies for other tables as needed 