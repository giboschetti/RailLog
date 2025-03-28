-- Update tracks table to add the new fields
ALTER TABLE public.tracks 
  RENAME COLUMN length TO useful_length;  -- Rename to match our new model

-- Add availability columns to tracks
ALTER TABLE public.tracks 
  ADD COLUMN available_from TIMESTAMPTZ,
  ADD COLUMN available_to TIMESTAMPTZ;

-- Update tracks columns constraint to allow NULL (optional lengths)
ALTER TABLE public.tracks 
  ALTER COLUMN useful_length DROP NOT NULL;

-- Add policies for nodes
CREATE POLICY "Everyone can read nodes"
  ON public.nodes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert nodes"
  ON public.nodes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update nodes"
  ON public.nodes FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete nodes"
  ON public.nodes FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Add policies for tracks
CREATE POLICY "Everyone can read tracks"
  ON public.tracks FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert tracks"
  ON public.tracks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update tracks"
  ON public.tracks FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete tracks"
  ON public.tracks FOR DELETE
  USING (auth.uid() IS NOT NULL); 