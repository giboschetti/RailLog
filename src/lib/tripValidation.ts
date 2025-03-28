import { supabase } from './supabase';
import { checkTrackCapacity, checkTrackCapacityForTrip } from './trackUtils';
import { TripType, Wagon, WagonGroup } from './supabase';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code?: string;
  field: string;
  message: string;
  details?: any;
}

export interface ValidationWarning {
  code?: string;
  type?: string;
  message: string;
  details?: any;
}

export interface DeliveryTripData {
  projectId: string;
  dateTime: string;
  destTrackId: string;
  wagonGroups: WagonGroup[];
  transportPlanNumber?: string;
  isPlanned: boolean;
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
 * @param deliveryData The delivery trip data to validate
 * @returns ValidationResult with errors and warnings
 */
export async function validateDelivery(deliveryData: DeliveryTripData): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Required fields validation
  if (!deliveryData.destTrackId) {
    errors.push({
      field: 'destTrackId',
      message: 'Destination track is required for deliveries'
    });
  }
  
  if (!deliveryData.dateTime) {
    errors.push({
      field: 'dateTime',
      message: 'Date and time are required'
    });
  }
  
  if (!deliveryData.wagonGroups || deliveryData.wagonGroups.length === 0) {
    errors.push({
      field: 'wagonGroups',
      message: 'At least one wagon group is required'
    });
  }
  
  // If there are input validation errors, return them immediately
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings
    };
  }
  
  // Calculate the total length of all wagons in this delivery
  let totalWagonLength = 0;
  let wagonCount = 0;
  
  for (const group of deliveryData.wagonGroups) {
    // Skip groups without types or quantities
    if (!group.wagonTypeId || !group.quantity) continue;
    
    // Get wagon type details for length
    const { data: wagonType } = await supabase
      .from('wagon_types')
      .select('default_length')
      .eq('id', group.wagonTypeId)
      .single();
    
    if (wagonType) {
      totalWagonLength += (wagonType.default_length * group.quantity);
      wagonCount += group.quantity;
    }
  }
  
  // Skip capacity check if no wagons to add
  if (totalWagonLength === 0 || wagonCount === 0) {
    errors.push({
      field: 'wagonGroups',
      message: 'At least one valid wagon with type and quantity is required'
    });
    return {
      isValid: false,
      errors,
      warnings
    };
  }
  
  // Check track capacity
  if (deliveryData.destTrackId) {
    try {
      // Get track details to check capacity
      const { data: trackData } = await supabase
        .from('tracks')
        .select('id, name, useful_length')
        .eq('id', deliveryData.destTrackId)
        .single();
      
      if (trackData) {
        // Get current track usage
        const capacityResult = await checkTrackCapacityForTrip(
          deliveryData.destTrackId,
          deliveryData.dateTime,
          totalWagonLength
        );
        
        if (!capacityResult.hasCapacity) {
          // Treat capacity issues as errors instead of warnings
          errors.push({
            field: 'destTrackId',
            message: `Insufficient capacity on track "${trackData.name}". Available: ${capacityResult.availableLength || 0}m, Required: ${totalWagonLength}m.`,
            details: {
              trackId: deliveryData.destTrackId,
              trackName: trackData.name,
              availableLength: capacityResult.availableLength || 0,
              requiredLength: totalWagonLength,
              overCapacityBy: totalWagonLength - (capacityResult.availableLength || 0)
            }
          });
        }
      }
    } catch (error: any) {
      console.error('Error checking track capacity:', error);
      errors.push({
        field: 'destTrackId', 
        message: `Error checking track capacity: ${error.message}`
      });
    }
  }
  
  // Check for time-based restrictions
  if (deliveryData.dateTime && deliveryData.destTrackId) {
    const tripDate = new Date(deliveryData.dateTime);
    
    // Get destination track's node
    const { data: trackData } = await supabase
      .from('tracks')
      .select('node_id')
      .eq('id', deliveryData.destTrackId)
      .single();
    
    if (trackData?.node_id) {
      // Check for "in" restrictions that would prevent delivery
      const { data: restrictionsData } = await supabase
        .from('restrictions')
        .select('*')
        .eq('type', 'in')
        .lte('from_datetime', tripDate.toISOString())
        .gte('to_datetime', tripDate.toISOString())
        .or(`node_id.eq.${trackData.node_id},track_id.eq.${deliveryData.destTrackId}`);
      
      if (restrictionsData && restrictionsData.length > 0) {
        // If restrictions apply, add as warnings but not errors
        for (const restriction of restrictionsData) {
          warnings.push({
            type: 'restriction',
            message: `Restriction: ${restriction.comment || 'No ingress allowed'}`,
            details: {
              restrictionId: restriction.id,
              restrictionType: restriction.type,
              fromDatetime: restriction.from_datetime,
              toDatetime: restriction.to_datetime
            }
          });
        }
      }
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
        if (wagon.number) {
          numbers.push(wagon.number);
        }
      });
    }
  });
  
  return numbers;
} 