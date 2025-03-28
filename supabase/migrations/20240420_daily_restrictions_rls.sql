-- Drop the existing policy for daily_restrictions INSERT
DROP POLICY IF EXISTS "Admins can insert daily restrictions" ON daily_restrictions;

-- Create new simplified policy that allows all authenticated users to insert
CREATE POLICY "Any authenticated user can insert daily restrictions" 
ON daily_restrictions FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Drop the existing policy for daily_restrictions UPDATE
DROP POLICY IF EXISTS "Admins can update daily restrictions" ON daily_restrictions;

-- Create new simplified policy that allows all authenticated users to update
CREATE POLICY "Any authenticated user can update daily restrictions" 
ON daily_restrictions FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Drop the existing policy for daily_restrictions DELETE
DROP POLICY IF EXISTS "Admins can delete daily restrictions" ON daily_restrictions;

-- Create new simplified policy that allows all authenticated users to delete
CREATE POLICY "Any authenticated user can delete daily restrictions" 
ON daily_restrictions FOR DELETE 
USING (auth.uid() IS NOT NULL); 