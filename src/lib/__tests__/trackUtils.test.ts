import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { supabase } from '../supabase';

// Directly import the function we want to test
// Note: Since doesRestrictionApplyToDate is not exported, we'll need to expose it temporarily for testing
// In real code, you might want to export it or refactor it for testability
import * as trackUtils from '../trackUtils';

// Temporarily expose the private function for testing
const doesRestrictionApplyToDate = (trackUtils as any).doesRestrictionApplyToDate;

describe('doesRestrictionApplyToDate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return false if target date is before start date', async () => {
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T18:00:00Z',
      repetition_pattern: 'once'
    };
    
    const result = await doesRestrictionApplyToDate(restriction, '2023-07-14T12:00:00Z');
    expect(result).toBe(false);
  });

  it('should return false if target date is after end date', async () => {
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T18:00:00Z',
      repetition_pattern: 'once'
    };
    
    const result = await doesRestrictionApplyToDate(restriction, '2023-07-21T12:00:00Z');
    expect(result).toBe(false);
  });

  it('should return true for "once" restriction when date is within range', async () => {
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T18:00:00Z',
      repetition_pattern: 'once'
    };
    
    const result = await doesRestrictionApplyToDate(restriction, '2023-07-17T12:00:00Z');
    expect(result).toBe(true);
  });

  it('should return true for "daily" restriction when time is within window', async () => {
    // Set up a restriction from 10am to 2pm each day between July 15-20
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T14:00:00Z',
      repetition_pattern: 'daily'
    };
    
    // Test for July 17 at 11am (within the window)
    const result = await doesRestrictionApplyToDate(restriction, '2023-07-17T11:00:00Z');
    expect(result).toBe(true);
  });

  it('should return false for "daily" restriction when time is outside window', async () => {
    // Set up a restriction from 10am to 2pm each day between July 15-20
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T14:00:00Z',
      repetition_pattern: 'daily'
    };
    
    // Test for July 17 at 9am (before window)
    const resultBefore = await doesRestrictionApplyToDate(restriction, '2023-07-17T09:00:00Z');
    expect(resultBefore).toBe(false);
    
    // Test for July 17 at 3pm (after window)
    const resultAfter = await doesRestrictionApplyToDate(restriction, '2023-07-17T15:00:00Z');
    expect(resultAfter).toBe(false);
  });

  it('should handle edge cases at window boundaries', async () => {
    // Set up a restriction from 10am to 2pm each day between July 15-20
    const restriction = {
      start_datetime: '2023-07-15T10:00:00Z',
      end_datetime: '2023-07-20T14:00:00Z',
      repetition_pattern: 'daily'
    };
    
    // Test for July 17 at 10am (at start time - should be true)
    const resultStart = await doesRestrictionApplyToDate(restriction, '2023-07-17T10:00:00Z');
    expect(resultStart).toBe(true);
    
    // Test for July 17 at 2pm (at end time - should be true)
    const resultEnd = await doesRestrictionApplyToDate(restriction, '2023-07-17T14:00:00Z');
    expect(resultEnd).toBe(true);
  });
}); 