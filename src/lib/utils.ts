import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string or Date object to a human-readable string
 * @param dateTime The date/time to format
 * @returns Formatted date/time string
 */
export function formatDateTime(dateTime: string | Date): string {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  
  // Format: DD.MM.YYYY HH:MM
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a date string or Date object to a date-only string
 * @param date The date to format
 * @returns Formatted date string
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Format: DD.MM.YYYY
  return dateObj.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format a date string or Date object to a time-only string
 * @param date The date to format
 * @returns Formatted time string
 */
export function formatTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Format: HH:MM
  return dateObj.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Converts a date to an ISO string suitable for database storage
 * @param date The date to format
 * @returns ISO date string
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Get start of day for a given date
 * @param date The date to get start of day for
 * @returns Date object set to start of day
 */
export function getStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day for a given date
 * @param date The date to get end of day for
 * @returns Date object set to end of day
 */
export function getEndOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Utility to validate the structure of the daily_restrictions table
 * Can be called in the browser console for debugging
 */
export async function checkDailyRestrictionsTable(supabaseClient: any) {
  try {
    console.log('Checking daily_restrictions table...');
    
    // 1. Get table definition
    const { data: tableInfo, error: tableError } = await supabaseClient
      .rpc('get_table_definition', { table_name: 'daily_restrictions' });
    
    if (tableError) {
      console.error('Error getting table definition:', tableError);
      
      // Try a more basic approach - just try to select from the table
      const { data: sample, error: sampleError } = await supabaseClient
        .from('daily_restrictions')
        .select('*')
        .limit(1);
      
      if (sampleError) {
        console.error('Error selecting from daily_restrictions:', sampleError);
        return { success: false, error: sampleError };
      }
      
      console.log('Sample record from daily_restrictions:', sample);
      return { success: true, sampleData: sample };
    }
    
    console.log('Table definition:', tableInfo);
    
    // 2. Count records
    const { count, error: countError } = await supabaseClient
      .from('daily_restrictions')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error counting records:', countError);
    } else {
      console.log(`Total records in daily_restrictions: ${count}`);
    }
    
    return { success: true, tableInfo, count };
  } catch (error) {
    console.error('Error checking daily_restrictions table:', error);
    return { success: false, error };
  }
} 