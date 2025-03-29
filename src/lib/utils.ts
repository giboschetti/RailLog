import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './supabase';

/**
 * Combines multiple class names using clsx and tailwind-merge
 * This is useful for conditionally applying Tailwind CSS classes
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

// Re-export from supabase
export * from './supabase';

/**
 * Checks if the daily_restrictions table exists and is properly configured
 * This function is used before expanding restrictions into daily records
 * @param supabaseClient Optional Supabase client
 * @returns Object with success status and error message if any
 */
export async function checkDailyRestrictionsTable(supabaseClient: any = supabase) {
  try {
    // Check if the table exists by querying it
    const { count, error } = await supabaseClient
      .from('daily_restrictions')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error checking daily_restrictions table:', error);
      return {
        success: false,
        error: error.message
      };
    }
    
    // If we got here, the table exists and is accessible
    return {
      success: true,
      count: count
    };
  } catch (err: any) {
    console.error('Exception checking daily_restrictions table:', err);
    return {
      success: false,
      error: err.message || 'Unknown error checking daily_restrictions table'
    };
  }
}
