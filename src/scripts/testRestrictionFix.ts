/**
 * Test script for the expandRestriction fix
 * 
 * This script creates a test restriction and expands it to daily records
 * to verify that the fix for the date handling correctly includes the last day.
 */

import { supabase } from '@/lib/supabase';
import { expandRestriction } from '@/lib/trackUtils';

async function testRestrictionFix() {
  console.log('Testing expandRestriction fix with a test restriction...');
  
  try {
    // Create a test restriction ID
    const testId = 'test-' + new Date().getTime();
    
    // Set up test dates that span multiple days
    // This example is similar to the reported issue: 23 to 26.06.25
    const startDateTime = '2025-06-23T08:00:00.000Z';
    const endDateTime = '2025-06-26T16:00:00.000Z';
    
    // Use a project ID that exists in the database
    // Get the first project from the database
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .limit(1);
    
    if (projectError) {
      throw projectError;
    }
    
    if (!projects || projects.length === 0) {
      throw new Error('No projects found to use for testing');
    }
    
    const projectId = projects[0].id;
    console.log(`Using project ID: ${projectId}`);
    
    // Get some tracks from the database
    const { data: tracks, error: tracksError } = await supabase
      .from('tracks')
      .select('id')
      .limit(3);
    
    if (tracksError) {
      throw tracksError;
    }
    
    if (!tracks || tracks.length === 0) {
      throw new Error('No tracks found to use for testing');
    }
    
    const trackIds = tracks.map(t => t.id);
    console.log(`Using ${trackIds.length} tracks: ${trackIds.join(', ')}`);
    
    // Delete any existing test daily restrictions 
    // (in case this script was run before)
    const { error: deleteError } = await supabase
      .from('daily_restrictions')
      .delete()
      .eq('original_restriction_id', testId);
    
    if (deleteError) {
      console.warn(`Failed to delete existing test records: ${deleteError.message}`);
    }
    
    // Test with 'once' pattern and 'no_entry' type
    const result = await expandRestriction(
      testId,
      projectId,
      startDateTime,
      endDateTime,
      'once',
      'no_entry',
      trackIds,
      'Test restriction for fix verification'
    );
    
    if (!result.success) {
      throw new Error(`Failed to expand test restriction: ${JSON.stringify(result.error)}`);
    }
    
    // Fetch the created daily records
    const { data: dailyRecords, error: fetchError } = await supabase
      .from('daily_restrictions')
      .select('*')
      .eq('original_restriction_id', testId)
      .order('restriction_date');
    
    if (fetchError) {
      throw fetchError;
    }
    
    console.log(`\n===== TEST RESULTS =====`);
    console.log(`Created ${dailyRecords?.length || 0} daily records`);
    
    if (dailyRecords && dailyRecords.length > 0) {
      // Format for better readability
      const formattedRecords = dailyRecords.map(record => ({
        date: new Date(record.restriction_date).toISOString().split('T')[0],
        time_range: `${record.time_from} - ${record.time_to}`,
        type: record.type
      }));
      
      console.log('\nDaily records created:');
      console.table(formattedRecords);
      
      // Check specific dates
      const dates = formattedRecords.map(r => r.date);
      
      // Expected dates: 2025-06-23, 2025-06-24, 2025-06-25, 2025-06-26
      const expectedDates = ['2025-06-23', '2025-06-24', '2025-06-25', '2025-06-26'];
      const missingDates = expectedDates.filter(date => !dates.includes(date));
      const extraDates = dates.filter(date => !expectedDates.includes(date));
      
      if (missingDates.length > 0) {
        console.error(`❌ Missing expected dates: ${missingDates.join(', ')}`);
      }
      
      if (extraDates.length > 0) {
        console.warn(`⚠️ Found unexpected dates: ${extraDates.join(', ')}`);
      }
      
      if (missingDates.length === 0 && extraDates.length === 0) {
        console.log(`✅ All expected dates present! The fix was successful.`);
      }
    }
    
    // Clean up after test
    console.log('\nCleaning up test data...');
    const { error: cleanupError } = await supabase
      .from('daily_restrictions')
      .delete()
      .eq('original_restriction_id', testId);
    
    if (cleanupError) {
      console.warn(`Failed to clean up test records: ${cleanupError.message}`);
    } else {
      console.log('Test data cleaned up successfully');
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Execute the test
testRestrictionFix()
  .then(() => console.log('Test script execution complete'))
  .catch(err => console.error('Test script execution failed:', err)); 