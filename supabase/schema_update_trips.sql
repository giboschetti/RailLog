-- Enable RLS on trips table
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting trips (everyone with a valid role can view)
CREATE POLICY "All users can view trips" 
ON public.trips 
FOR SELECT 
USING (true);

-- Create policy for inserting trips
CREATE POLICY "Users can create trips" 
ON public.trips 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating trips
CREATE POLICY "Users can update trips" 
ON public.trips 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create policy for deleting trips
CREATE POLICY "Users can delete trips" 
ON public.trips 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Enable RLS on trip_wagons table
ALTER TABLE public.trip_wagons ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting trip_wagons
CREATE POLICY "All users can view trip_wagons" 
ON public.trip_wagons 
FOR SELECT 
USING (true);

-- Create policy for inserting trip_wagons
CREATE POLICY "Users can create trip_wagons" 
ON public.trip_wagons 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating trip_wagons
CREATE POLICY "Users can update trip_wagons" 
ON public.trip_wagons 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create policy for deleting trip_wagons
CREATE POLICY "Users can delete trip_wagons" 
ON public.trip_wagons 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Enable RLS on wagons table
ALTER TABLE public.wagons ENABLE ROW LEVEL SECURITY;

-- Create policy for selecting wagons
CREATE POLICY "All users can view wagons" 
ON public.wagons 
FOR SELECT 
USING (true);

-- Create policy for inserting wagons
CREATE POLICY "Users can create wagons" 
ON public.wagons 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy for updating wagons
CREATE POLICY "Users can update wagons" 
ON public.wagons 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Create policy for deleting wagons
CREATE POLICY "Users can delete wagons" 
ON public.wagons 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- For testing/development, allow all authenticated users to perform all actions
CREATE POLICY "Any authenticated user can manage trips during development" 
ON public.trips 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can manage trip_wagons during development" 
ON public.trip_wagons 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Any authenticated user can manage wagons during development" 
ON public.wagons 
FOR ALL 
USING (auth.uid() IS NOT NULL); 