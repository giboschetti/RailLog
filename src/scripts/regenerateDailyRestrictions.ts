/**
 * Regenerate daily_restrictions script
 * 
 * This script rebuilds all daily_restriction records from the original restrictions table
 * with the corrected time handling for multi-day restrictions:
 * 
 * - First day: original start time to 23:59
 * - Middle days: 00:00 to 23:59 (full day)
 * - Last day: 00:00 to original end time
 * 
 * IMPORTANT: This version includes the fix for date component extraction to properly handle
 * timezone differences and ensure the actual end date is included in the generated daily restrictions.
 */

import { supabase } from '@/lib/supabase';
import { expandRestriction } from '@/lib/trackUtils';

// Export the function so it can be used elsewhere
export async function regenerateDailyRestrictions() {
  console.log('Regenerating all daily_restrictions from original restrictions...');
  
  try {
    // 1. Fetch all restrictions
    const { data: restrictions, error: fetchError } = await supabase
      .from('restrictions')
      .select('*')
      .order('created_at');
    
    if (fetchError) {
      throw fetchError;
    }
    
    console.log(`Found ${restrictions?.length || 0} restrictions to process`);
    
    // 2. Delete all existing daily_restrictions
    const { error: deleteError } = await supabase
      .from('daily_restrictions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (deleteError) {
      throw new Error(`Failed to delete existing daily_restrictions: ${deleteError.message}`);
    }
    
    console.log('Successfully deleted all existing daily_restrictions');
    
    // 3. Process each restriction
    let processedCount = 0;
    let errorCount = 0;
    
    for (const restriction of restrictions || []) {
      try {
        console.log(`Processing restriction: ${restriction.id}`);
        console.log(`Date range: ${restriction.start_datetime || restriction.from_datetime} to ${restriction.end_datetime || restriction.to_datetime}`);
        
        // Get associated tracks
        const { data: tracks, error: tracksError } = await supabase
          .from('restriction_tracks')
          .select('track_id')
          .eq('restriction_id', restriction.id);
        
        if (tracksError) {
          throw tracksError;
        }
        
        const trackIds = tracks?.map(t => t.track_id) || [];
        console.log(`Found ${trackIds.length} tracks for restriction ${restriction.id}`);
        
        // Process each restriction type
        let restrictionTypes = [];
        
        // Handle different data structures for restriction types
        if (Array.isArray(restriction.restriction_types)) {
          restrictionTypes = restriction.restriction_types;
        } else if (restriction.restriction_types) {
          restrictionTypes = [restriction.restriction_types];
        } else if (restriction.type) {
          restrictionTypes = [restriction.type];
        } else {
          console.warn(`No restriction type found for restriction ${restriction.id}`);
          continue;
        }
        
        console.log(`Processing ${restrictionTypes.length} restriction types: ${restrictionTypes.join(', ')}`);
        
        for (const type of restrictionTypes) {
          // Use the fixed expandRestriction function to create daily records
          const result = await expandRestriction(
            restriction.id,
            restriction.project_id,
            restriction.start_datetime || restriction.from_datetime, // Handle both field names
            restriction.end_datetime || restriction.to_datetime,     // Handle both field names
            restriction.repetition_pattern || restriction.recurrence || 'once', // Handle both field names with default
            type,
            trackIds,
            restriction.comment
          );
          
          if (!result.success) {
            throw new Error(`Failed to expand restriction ${restriction.id} with type ${type}: ${JSON.stringify(result.error)}`);
          } else {
            console.log(`Successfully expanded restriction ${restriction.id} with type ${type}`);
          }
        }
        
        processedCount++;
        console.log(`Successfully processed restriction ${restriction.id} (${processedCount}/${restrictions?.length || 0})`);
      } catch (error) {
        errorCount++;
        console.error(`Error processing restriction ${restriction.id}:`, error);
      }
    }
    
    console.log(`===== REGENERATION SUMMARY =====`);
    console.log(`Total restrictions: ${restrictions?.length || 0}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Errors: ${errorCount}`);
    if (errorCount > 0) {
      console.log(`Some restrictions failed to process. Check the logs above for details.`);
    } else {
      console.log(`All restrictions were successfully processed.`);
    }
  } catch (error) {
    console.error('Regeneration failed:', error);
  }
}

// Run the regeneration function if this module is invoked directly
if (require.main === module) {
  regenerateDailyRestrictions()
    .then(() => {
      console.log('Regeneration complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('Regeneration failed:', error);
      process.exit(1);
    });
} 