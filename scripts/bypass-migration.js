require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role key bypasses RLS

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase URL or service role key in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateRestrictions() {
  console.log('Starting direct migration of restrictions to daily_restrictions...');

  try {
    // 1. Fetch all restrictions
    const { data: restrictions, error: fetchError } = await supabase
      .from('restrictions')
      .select(`
        id, 
        start_datetime, 
        end_datetime, 
        repetition_pattern, 
        restriction_types,
        comment,
        project_id
      `);

    if (fetchError) {
      console.error('Error fetching restrictions:', fetchError);
      return;
    }
    
    console.log(`Found ${restrictions?.length || 0} restrictions to process`);
    
    if (!restrictions || restrictions.length === 0) {
      console.log('No restrictions to migrate');
      return;
    }

    // 2. Process each restriction
    for (const restriction of restrictions) {
      console.log(`Processing restriction: ${restriction.id}`);
      
      // Get associated tracks
      const { data: tracks, error: tracksError } = await supabase
        .from('restriction_tracks')
        .select('track_id')
        .eq('restriction_id', restriction.id);
      
      if (tracksError) {
        console.error(`Error fetching tracks for restriction ${restriction.id}:`, tracksError);
        continue;
      }
      
      const trackIds = tracks.map(t => t.track_id);
      console.log(`Found ${trackIds.length} tracks for restriction ${restriction.id}`);
      
      // Delete any existing daily records for this restriction to prevent duplicates
      const { error: deleteError } = await supabase
        .from('daily_restrictions')
        .delete()
        .eq('original_restriction_id', restriction.id);
      
      if (deleteError) {
        console.error(`Error deleting existing daily records for restriction ${restriction.id}:`, deleteError);
      }
      
      // Process each restriction type
      const restrictionTypes = Array.isArray(restriction.restriction_types) 
        ? restriction.restriction_types 
        : [restriction.restriction_types];
      
      for (const type of restrictionTypes) {
        await expandRestriction(
          restriction.id,
          restriction.project_id,
          restriction.start_datetime,
          restriction.end_datetime,
          restriction.repetition_pattern,
          type,
          trackIds,
          restriction.comment
        );
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

async function expandRestriction(
  restrictionId,
  projectId,
  startDateTime,
  endDateTime,
  repetitionPattern,
  restrictionType,
  trackIds,
  comment
) {
  try {
    console.log(`Expanding restriction ${restrictionId} with type ${restrictionType}`);
    
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    // Get time components
    const timeFrom = start.toTimeString().substring(0, 8);
    const timeTo = end.toTimeString().substring(0, 8);
    
    // Handle different patterns
    if (repetitionPattern === 'once') {
      const dailyRecords = [];
      
      // Set start date to midnight
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      
      // Set end date to midnight of the next day
      const lastDate = new Date(end);
      lastDate.setDate(lastDate.getDate() + 1);
      lastDate.setHours(0, 0, 0, 0);
      
      // Loop through each day
      while (currentDate < lastDate) {
        const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        dailyRecords.push({
          original_restriction_id: restrictionId,
          project_id: projectId,
          restriction_date: dateString,
          time_from: timeFrom,
          time_to: timeTo,
          type: restrictionType,
          betroffene_gleise: trackIds,
          comment: comment || null
        });
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Insert in batches if there are many records
      if (dailyRecords.length > 0) {
        console.log(`Inserting ${dailyRecords.length} daily records for restriction ${restrictionId}`);
        
        // Process in smaller batches to avoid request size limits
        const batchSize = 50;
        for (let i = 0; i < dailyRecords.length; i += batchSize) {
          const batch = dailyRecords.slice(i, i + batchSize);
          const { error } = await supabase
            .from('daily_restrictions')
            .insert(batch);
          
          if (error) {
            console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
          } else {
            console.log(`Successfully inserted batch ${i / batchSize + 1}`);
          }
        }
      }
    } else if (repetitionPattern === 'daily') {
      // For daily pattern
      const dateString = start.toISOString().split('T')[0];
      
      const dailyRecord = {
        original_restriction_id: restrictionId,
        project_id: projectId,
        restriction_date: dateString,
        time_from: timeFrom,
        time_to: timeTo,
        type: restrictionType,
        betroffene_gleise: trackIds,
        comment: comment || null
      };
      
      const { error } = await supabase
        .from('daily_restrictions')
        .insert(dailyRecord);
      
      if (error) {
        console.error('Error inserting daily record:', error);
      } else {
        console.log('Successfully inserted daily record');
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error expanding restriction:', error);
    return { success: false, error };
  }
}

// Run the migration
migrateRestrictions()
  .then(() => {
    console.log('Script execution completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  }); 