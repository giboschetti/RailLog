-- Script to regenerate the daily_restrictions table entries
-- This script can be run in the Supabase SQL Editor

-- First, delete all existing daily_restrictions
DELETE FROM public.daily_restrictions;

-- Insert function to help expand restrictions
CREATE OR REPLACE FUNCTION expand_restriction_to_daily(
  restriction_id UUID,
  project_id UUID,
  start_datetime TIMESTAMPTZ,
  end_datetime TIMESTAMPTZ,
  repetition_pattern TEXT,
  restriction_type TEXT,
  track_ids UUID[],
  comment TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  start_date DATE;
  end_date DATE;
  curr_date DATE;
  time_from TIME;
  time_to TIME;
  days_count INTEGER := 0;
  inserted_count INTEGER := 0;
BEGIN
  -- Get date and time parts
  start_date := DATE(start_datetime);
  end_date := DATE(end_datetime);
  
  -- For once pattern, generate a record for each day
  IF repetition_pattern = 'once' THEN
    curr_date := start_date;
    
    WHILE curr_date <= end_date LOOP
      -- Set time ranges - full day for middle days, partial for first/last
      IF curr_date = start_date THEN
        time_from := start_datetime::TIME;
      ELSE
        time_from := '00:00:00'::TIME;
      END IF;
      
      IF curr_date = end_date THEN
        time_to := end_datetime::TIME;
      ELSE
        time_to := '23:59:59'::TIME;
      END IF;
      
      -- Insert the daily record
      INSERT INTO public.daily_restrictions (
        original_restriction_id,
        project_id,
        restriction_date,
        time_from,
        time_to,
        type,
        betroffene_gleise,
        comment
      ) VALUES (
        restriction_id,
        project_id,
        curr_date,
        time_from,
        time_to,
        restriction_type,
        track_ids,
        comment
      );
      
      inserted_count := inserted_count + 1;
      curr_date := curr_date + INTERVAL '1 day';
      days_count := days_count + 1;
    END LOOP;
    
  -- For daily pattern, just create one record with the time range
  ELSIF repetition_pattern = 'daily' THEN
    INSERT INTO public.daily_restrictions (
      original_restriction_id,
      project_id,
      restriction_date,
      time_from,
      time_to,
      type,
      betroffene_gleise,
      comment
    ) VALUES (
      restriction_id,
      project_id,
      start_date,
      start_datetime::TIME,
      end_datetime::TIME,
      restriction_type,
      track_ids,
      comment
    );
    
    inserted_count := 1;
  END IF;
  
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Now process all restrictions
DO $$
DECLARE
  r RECORD;
  restriction_types TEXT[];
  rt TEXT;
  track_ids UUID[];
  expand_result INTEGER;
  total_expanded INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting restriction expansion...';
  
  FOR r IN 
    SELECT 
      r.id, 
      r.project_id, 
      r.start_datetime, 
      r.end_datetime, 
      r.repetition_pattern, 
      r.restriction_types,
      r.comment
    FROM 
      public.restrictions r
    ORDER BY r.created_at
  LOOP
    -- Get track IDs for this restriction
    SELECT array_agg(track_id) INTO track_ids
    FROM public.restriction_tracks
    WHERE restriction_id = r.id;
    
    -- Skip if no tracks
    IF track_ids IS NULL OR array_length(track_ids, 1) IS NULL THEN
      RAISE NOTICE 'Skipping restriction % - no associated tracks', r.id;
      CONTINUE;
    END IF;
    
    -- Handle restriction types array or single value
    IF r.restriction_types IS NULL THEN
      RAISE NOTICE 'Skipping restriction % - no restriction types', r.id;
      CONTINUE;
    END IF;
    
    -- Convert any format of restriction_types to array
    IF pg_typeof(r.restriction_types) = 'text[]'::regtype THEN
      restriction_types := r.restriction_types;
    ELSIF pg_typeof(r.restriction_types) = 'text'::regtype THEN
      restriction_types := ARRAY[r.restriction_types];
    ELSE
      RAISE NOTICE 'Unknown restriction_types format for %: %', r.id, pg_typeof(r.restriction_types);
      restriction_types := ARRAY['no_entry'];
    END IF;
    
    -- Process each restriction type
    FOREACH rt IN ARRAY restriction_types
    LOOP
      -- Expand the restriction
      expand_result := expand_restriction_to_daily(
        r.id,
        r.project_id,
        r.start_datetime,
        r.end_datetime,
        r.repetition_pattern::TEXT,
        rt,
        track_ids,
        r.comment
      );
      
      total_expanded := total_expanded + expand_result;
      RAISE NOTICE 'Expanded restriction % with type % - created % records', r.id, rt, expand_result;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Expansion complete. Total daily restrictions created: %', total_expanded;
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS expand_restriction_to_daily(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID[], TEXT);

-- Display count of generated restrictions
SELECT COUNT(*) AS total_daily_restrictions FROM public.daily_restrictions; 