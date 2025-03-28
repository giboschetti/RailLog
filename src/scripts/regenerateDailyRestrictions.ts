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
 * IMPORTANT: This version includes the fix for end date handling to ensure the actual end date
 * is properly included in the generated daily restrictions.
 */

import { supabase } from '@/lib/supabase';
import { expandRestriction } from '@/lib/trackUtils';

async function regenerateDailyRestrictions() {
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
        const restrictionTypes = Array.isArray(restriction.restriction_types) 
          ? restriction.restriction_types 
          : [restriction.restriction_types];
        
        for (const type of restrictionTypes) {
          const result = await expandRestriction(
            restriction.id,
            restriction.project_id,
            restriction.start_datetime || restriction.from_datetime, // Handle both field names
            restriction.end_datetime || restriction.to_datetime,     // Handle both field names
            restriction.repetition_pattern || restriction.recurrence, // Handle both field names
            type,
            trackIds,
            restriction.comment
          );
          
          if (!result.success) {
            throw new Error(`Failed to expand restriction ${restriction.id} with type ${type}: ${JSON.stringify(result.error)}`);
          }
        }
        
        processedCount++;
        console.log(`Successfully processed restriction ${restriction.id} (${processedCount}/${restrictions?.length || 0})`);
      } catch (error) {
        errorCount++;
        console.error(`Error processing restriction ${restriction.id}:`, error);
      }
    }
    
    console.log(`Regeneration completed. Processed ${processedCount} restrictions with ${errorCount} errors.`);
  } catch (error) {
    console.error('Regeneration failed:', error);
  }
}

// Execute the regeneration
regenerateDailyRestrictions()
  .then(() => console.log('Script execution complete'))
  .catch(err => console.error('Script execution failed:', err)); 