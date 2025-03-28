-- Add time window columns to projects table
ALTER TABLE public.projects 
ADD COLUMN start_date TIMESTAMPTZ,
ADD COLUMN end_date TIMESTAMPTZ;

-- Create project_users junction table to manage users per project
CREATE TABLE IF NOT EXISTS public.project_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Enable RLS on project_users
ALTER TABLE public.project_users ENABLE ROW LEVEL SECURITY;

-- Create policy for project_users
CREATE POLICY "Project admins can manage project users"
ON public.project_users
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id AND (
      public.is_admin() OR 
      EXISTS (
        SELECT 1 FROM public.project_users pu
        WHERE pu.project_id = project_id
        AND pu.user_id = auth.uid()
        AND pu.role = 'admin'
      )
    )
  )
);

-- Create policy for viewer access to project_users
CREATE POLICY "Project members can view project users" 
ON public.project_users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_users pu
    WHERE pu.project_id = project_id
    AND pu.user_id = auth.uid()
  )
);

-- Create trigger for project_users updated_at
CREATE TRIGGER update_project_users_timestamp
BEFORE UPDATE ON public.project_users
FOR EACH ROW EXECUTE PROCEDURE update_timestamp(); 