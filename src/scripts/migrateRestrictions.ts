/**
 * Migration script to create daily_restrictions records for all existing restrictions
 * 
 * This script should be run once to populate the daily_restrictions table with
 * expanded records from the existing restrictions table.
 */

import { createClient } from '@supabase/supabase-js';
import { expandRestriction } from '../lib/trackUtils';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Log message with timestamp
const log = (message: string) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Main migration function
async function migrateRestrictions() {
  try {
    log('Starting restriction migration...');

    // 1. Fetch all restrictions from the DB
    const { data: restrictions, error: fetchError } = await supabase
      .from('restrictions')
      .select(`
        id, 
        project_id,
        start_datetime, 
        end_datetime, 
        repetition_pattern, 
        restriction_types,
        comment
      `);

    if (fetchError) throw fetchError;
    
    log(`Found ${restrictions?.length || 0} restrictions to migrate`);
    
    if (!restrictions || restrictions.length === 0) {
      log('No restrictions to migrate. Exiting.');
      return;
    }

    // 2. For each restriction, find associated tracks
    let processedCount = 0;
    let errorCount = 0;

    for (const restriction of restrictions) {
      try {
        // Get track IDs for this restriction
        const { data: trackData, error: trackError } = await supabase
          .from('restriction_tracks')
          .select('track_id')
          .eq('restriction_id', restriction.id);

        if (trackError) throw trackError;

        const trackIds = trackData?.map(t => t.track_id) || [];
        
        log(`Processing restriction ${restriction.id} with ${trackIds.length} tracks`);

        // Delete any existing daily_restrictions for this restriction
        const { error: deleteError } = await supabase
          .from('daily_restrictions')
          .delete()
          .eq('original_restriction_id', restriction.id);

        if (deleteError) throw deleteError;

        // Process each restriction type separately
        if (Array.isArray(restriction.restriction_types)) {
          for (const restrictionType of restriction.restriction_types) {
            // Expand the restriction
            const result = await expandRestriction(
              restriction.id,
              restriction.project_id,
              restriction.start_datetime,
              restriction.end_datetime,
              restriction.repetition_pattern,
              restrictionType,
              trackIds,
              restriction.comment
            );

            if (!result.success) {
              throw new Error(`Failed to expand restriction: ${JSON.stringify(result.error)}`);
            }
          }
        } else if (restriction.restriction_types) {
          // If it's a single restriction type (not in an array)
          const result = await expandRestriction(
            restriction.id,
            restriction.project_id,
            restriction.start_datetime,
            restriction.end_datetime,
            restriction.repetition_pattern,
            restriction.restriction_types,
            trackIds,
            restriction.comment
          );

          if (!result.success) {
            throw new Error(`Failed to expand restriction: ${JSON.stringify(result.error)}`);
          }
        }

        processedCount++;
        log(`Successfully processed restriction ${restriction.id} (${processedCount}/${restrictions.length})`);
      } catch (err) {
        errorCount++;
        console.error(`Error processing restriction ${restriction.id}:`, err);
      }
    }

    log(`Migration completed. Processed ${processedCount} restrictions with ${errorCount} errors.`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateRestrictions()
  .then(() => {
    log('Migration script execution completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Unhandled error in migration script:', err);
    process.exit(1);
  }); 