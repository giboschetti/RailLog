import { supabase } from './supabase';
import { checkTrackCapacity, checkTripRestrictions } from './trackUtils';
import { TripType, Wagon, WagonGroup } from './supabase';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  details?: any;
}

export interface DeliveryValidationParams {
  projectId: string;
  dateTime: string;
  destTrackId: string;
  wagonGroups: WagonGroup[];
  transportPlanNumber?: string;
  isPlanned: boolean;
}

/**
 * Validates a delivery trip
 * @param params Delivery trip parameters
 * @returns Validation result with errors and warnings
 */
export async function validateDelivery(params: DeliveryValidationParams): Promise<ValidationResult> {
  const { projectId, dateTime, destTrackId, wagonGroups, isPlanned } = params;
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Basic data validation
  if (!dateTime) {
    errors.push({
      code: 'MISSING_DATETIME',
      message: 'Bitte geben Sie ein Datum und eine Uhrzeit an.',
      field: 'dateTime'
    });
  } else {
    // Validate that date is within project timeframe
    const dateObj = new Date(dateTime);
    const { data: projectData } = await supabase
      .from('projects')
      .select('start_date, end_date')
      .eq('id', projectId)
      .single();

    if (projectData) {
      const projectStart = projectData.start_date ? new Date(projectData.start_date) : null;
      const projectEnd = projectData.end_date ? new Date(projectData.end_date) : null;

      if (projectStart && dateObj < projectStart) {
        warnings.push({
          code: 'DATE_BEFORE_PROJECT',
          message: 'Das gewählte Datum liegt vor dem Projektbeginn.',
          details: { projectStart: projectData.start_date }
        });
      }

      if (projectEnd && dateObj > projectEnd) {
        warnings.push({
          code: 'DATE_AFTER_PROJECT',
          message: 'Das gewählte Datum liegt nach dem Projektende.',
          details: { projectEnd: projectData.end_date }
        });
      }
    }
  }

  if (!destTrackId) {
    errors.push({
      code: 'MISSING_DEST_TRACK',
      message: 'Bitte wählen Sie ein Zielgleis aus.',
      field: 'destTrackId'
    });
  }

  if (!wagonGroups || wagonGroups.length === 0) {
    errors.push({
      code: 'NO_WAGONS',
      message: 'Bitte fügen Sie mindestens eine Waggongruppe hinzu.',
      field: 'wagonGroups'
    });
  }

  // Return early if there are basic errors to prevent unnecessary API calls
  if (errors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // 2. Check track capacity
  if (destTrackId) {
    try {
      // Calculate total length of wagons being delivered
      const totalWagonLength = await calculateTotalWagonLength(wagonGroups);
      
      // Check capacity on destination track
      const capacityResult = await checkTrackCapacity(destTrackId, totalWagonLength);
      
      if (!capacityResult.hasCapacity) {
        warnings.push({
          code: 'INSUFFICIENT_CAPACITY',
          message: 'Das Zielgleis hat nicht genügend Kapazität für die angegebenen Waggons.',
          details: {
            trackLength: capacityResult.trackLength,
            currentUsage: capacityResult.currentUsage,
            requiredLength: totalWagonLength,
            availableSpace: capacityResult.availableSpace
          }
        });
      }
    } catch (error: any) {
      console.error('Error checking track capacity:', error);
      warnings.push({
        code: 'CAPACITY_CHECK_ERROR',
        message: 'Fehler bei der Überprüfung der Gleiskapazität.',
        details: { error: error.message }
      });
    }
  }

  // 3. Check track restrictions
  try {
    const restrictionsResult = await checkTripRestrictions('delivery', dateTime, undefined, destTrackId);
    
    if (restrictionsResult.hasRestrictions) {
      warnings.push({
        code: 'ACTIVE_RESTRICTIONS',
        message: 'Es gibt aktive Einschränkungen für das Zielgleis zum gewählten Zeitpunkt.',
        details: { restrictions: restrictionsResult.restrictions }
      });
    }
  } catch (error: any) {
    console.error('Error checking restrictions:', error);
    warnings.push({
      code: 'RESTRICTIONS_CHECK_ERROR',
      message: 'Fehler bei der Überprüfung der Gleiseinschränkungen.',
      details: { error: error.message }
    });
  }

  // 4. Check for wagon duplicates (wagons with the same number)
  const wagonNumbers = extractWagonNumbers(wagonGroups);
  if (wagonNumbers.length > 0) {
    try {
      const { data: existingWagons } = await supabase
        .from('wagons')
        .select('number')
        .in('number', wagonNumbers)
        .not('number', 'is', null);
      
      if (existingWagons && existingWagons.length > 0) {
        const duplicateNumbers = existingWagons.map(w => w.number);
        warnings.push({
          code: 'DUPLICATE_WAGON_NUMBERS',
          message: 'Einige Waggonnummern existieren bereits im System.',
          details: { duplicateNumbers }
        });
      }
    } catch (error: any) {
      console.error('Error checking for duplicate wagon numbers:', error);
      warnings.push({
        code: 'WAGON_CHECK_ERROR',
        message: 'Fehler bei der Überprüfung auf doppelte Waggonnummern.',
        details: { error: error.message }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Fetches wagon types from Supabase
 * @returns Array of wagon types
 */
export async function fetchWagonTypes() {
  try {
    const { data, error } = await supabase
      .from('wagon_types')
      .select('*');
    
    if (error) {
      console.error('Error fetching wagon types:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Exception fetching wagon types:', error);
    return [];
  }
}

/**
 * Helper function to calculate total length of wagons in wagon groups
 */
async function calculateTotalWagonLength(wagonGroups: WagonGroup[]): Promise<number> {
  try {
    // Fetch wagon types to get their lengths
    const { data: wagonTypes } = await supabase
      .from('wagon_types')
      .select('id, default_length');
    
    return wagonGroups.reduce((total, group) => {
      // Get the wagon type ID from the group
      const wagonTypeId = group.wagonTypeId;
      
      // Find the corresponding wagon type and get its default length
      const wagonType = wagonTypes?.find(t => t.id === wagonTypeId);
      const wagonTypeLength = wagonType?.default_length || 0;
      
      // If group has wagons with lengths, use those
      if (group.wagons && group.wagons.length > 0) {
        return total + group.wagons.reduce((sum, wagon) => sum + (wagon.length || wagonTypeLength), 0);
      }
      
      // If no wagons yet, multiply the type length by quantity
      return total + (wagonTypeLength * group.quantity);
    }, 0);
  } catch (error) {
    console.error('Error calculating wagon length:', error);
    return 0;
  }
}

/**
 * Helper function to extract wagon numbers from wagon groups
 */
function extractWagonNumbers(wagonGroups: WagonGroup[]): string[] {
  const numbers: string[] = [];
  
  wagonGroups.forEach(group => {
    if (group.wagons) {
      group.wagons.forEach(wagon => {
        // Add only defined numbers that aren't empty
        if (wagon.number && wagon.number.trim() !== '') {
          numbers.push(wagon.number.trim());
        }
      });
    }
  });
  
  return numbers;
} 