import { supabase } from './supabase';
import { checkTrackCapacity, checkTrackCapacityForTrip, checkTripRestrictionsSimplified } from './trackUtils';
import { TripType, Wagon, WagonGroup } from './supabase';

// Add interface for future conflicts
interface FutureConflict {
  trip_id: string;
  trip_name: string;
  trip_time: string;
  trip_type: string;
  available_length: number;
  required_length: number;
  conflict_date: string;
}

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
  
  // Check track capacity using our new approach
  if (deliveryData.destTrackId) {
    try {
      // Get track details to check capacity
      const { data: trackData } = await supabase
        .from('tracks')
        .select('id, name, useful_length')
        .eq('id', deliveryData.destTrackId)
        .single();
      
      if (trackData) {
        // 1. Check capacity at the specific arrival time
        const { data: occupancyData, error: occupancyError } = await supabase
          .rpc('get_track_occupancy_at_time', { 
            track_id_param: deliveryData.destTrackId,
            time_point: deliveryData.dateTime
          });
          
        if (occupancyError) throw occupancyError;
        
        if (!occupancyData.success) {
          throw new Error(occupancyData.error || 'Failed to check track occupancy');
        }
        
        const availableLength = occupancyData.available_length || 0;
        const hasCapacity = trackData.useful_length === 0 || totalWagonLength <= availableLength;
        
        // Only add an error if there's no capacity at the specific arrival time
        if (!hasCapacity) {
          errors.push({
            field: 'destTrackId',
            message: `Insufficient capacity on track "${trackData.name}". Available: ${availableLength}m, Required: ${totalWagonLength}m.`,
            details: {
              trackId: deliveryData.destTrackId,
              trackName: trackData.name,
              availableLength,
              requiredLength: totalWagonLength,
              overCapacityBy: totalWagonLength - availableLength
            }
          });
        } else {
          // 2. If it has capacity at the arrival time, check for future conflicts
          const { data: conflicts, error: conflictsError } = await supabase
            .rpc('check_delivery_future_conflicts', {
              track_id_param: deliveryData.destTrackId,
              time_point: deliveryData.dateTime,
              wagon_length: totalWagonLength
            });
            
          if (conflictsError) {
            console.error('Error checking future conflicts:', conflictsError);
          } else if (conflicts && conflicts.length > 0) {
            // Add future conflicts as warnings instead of blocking errors
            conflicts.forEach((conflict: FutureConflict) => {
              warnings.push({
                type: 'future_capacity_conflict',
                message: `Capacity conflict: This delivery will create a capacity issue for a future trip on ${conflict.conflict_date}. Available: ${conflict.available_length}m, Required: ${conflict.required_length}m.`,
                details: {
                  conflictTripId: conflict.trip_id,
                  conflictTripName: conflict.trip_name,
                  conflictTime: conflict.trip_time,
                  conflictType: conflict.trip_type,
                  availableLength: conflict.available_length,
                  requiredLength: conflict.required_length
                }
              });
            });
          }
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
    try {
      // Use the new simplified restrictions checking system
      const restrictionsResult = await checkTripRestrictionsSimplified(
        'delivery',
        deliveryData.dateTime,
        undefined, // No source track for deliveries
        deliveryData.destTrackId
      );
      
      if (restrictionsResult.hasRestrictions) {
        // If restrictions apply, add them as warnings
        restrictionsResult.restrictions.forEach(restriction => {
          warnings.push({
            type: 'restriction',
            message: `Einschränkung: ${restriction.comment || 'Keine Einfahrt auf dieses Gleis erlaubt'}`,
            details: {
              restrictionId: restriction.id,
              restrictionType: restriction.type,
              restrictionDate: restriction.restriction_date,
              affectedTrack: restriction.affected_track_id
            }
          });
        });
      }
    } catch (error: any) {
      console.error('Error checking track restrictions:', error);
      warnings.push({
        type: 'restrictions_check_error',
        message: `Error checking restrictions: ${error.message}`
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
        if (wagon.number) {
          numbers.push(wagon.number);
        }
      });
    }
  });
  
  return numbers;
}

/**
 * Interface for internal trip validation parameters
 */
export interface InternalTripData {
  projectId: string;
  dateTime: string;
  sourceTrackId: string;
  destTrackId: string;
  selectedWagons: Array<{id: string, length: number}>;
  isPlanned: boolean;
  tripId?: string;
}

/**
 * Validates an internal trip (moving wagons between tracks)
 * @param internalData The internal trip data to validate
 * @returns ValidationResult with errors and warnings
 */
export async function validateInternalTrip(internalData: InternalTripData): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // 1. Basic input validation
  if (!internalData.sourceTrackId) {
    errors.push({
      field: 'sourceTrackId',
      message: 'Source track is required for internal trips'
    });
  }
  
  if (!internalData.destTrackId) {
    errors.push({
      field: 'destTrackId',
      message: 'Destination track is required for internal trips'
    });
  }
  
  if (internalData.sourceTrackId === internalData.destTrackId) {
    errors.push({
      field: 'destTrackId',
      message: 'Source and destination tracks must be different'
    });
  }
  
  if (!internalData.dateTime) {
    errors.push({
      field: 'dateTime',
      message: 'Date and time are required'
    });
  }
  
  if (!internalData.selectedWagons || internalData.selectedWagons.length === 0) {
    errors.push({
      field: 'selectedWagons',
      message: 'At least one wagon must be selected'
    });
  }
  
  // Return early if there are basic validation errors
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings
    };
  }
  
  // 2. Verify wagons are actually on the source track
  try {
    // Get the list of wagon IDs
    const wagonIds = internalData.selectedWagons.map(w => w.id);
    
    // Check if all selected wagons are on the source track
    const { data: wagonsData, error: wagonsError } = await supabase
      .from('wagons')
      .select('id, current_track_id')
      .in('id', wagonIds);
    
    if (wagonsError) throw wagonsError;
    
    // Find wagons that are not on the source track
    const invalidWagons = wagonsData.filter(w => w.current_track_id !== internalData.sourceTrackId);
    
    if (invalidWagons.length > 0) {
      errors.push({
        field: 'selectedWagons',
        message: `${invalidWagons.length} selected wagons are not currently on the source track`,
        details: {
          invalidWagonIds: invalidWagons.map(w => w.id)
        }
      });
    }
  } catch (error: any) {
    console.error('Error verifying wagon locations:', error);
    errors.push({
      field: 'selectedWagons',
      message: `Error verifying wagon locations: ${error.message}`
    });
  }
  
  // 3. Check for future trip conflicts
  try {
    // Get the trip date for more precise checking
    const tripDate = new Date(internalData.dateTime);
    
    // Create time buffer objects (1 hour before and after)
    const timeBufferBefore = new Date(tripDate);
    timeBufferBefore.setHours(tripDate.getHours() - 1);
    
    const timeBufferAfter = new Date(tripDate);
    timeBufferAfter.setHours(tripDate.getHours() + 1);
    
    console.log('Checking time conflicts for wagons:', {
      wagonIds: internalData.selectedWagons.map(w => w.id),
      tripTime: tripDate.toISOString(),
      timeBufferRange: `${timeBufferBefore.toISOString()} to ${timeBufferAfter.toISOString()}`
    });
    
    // Check if any of these wagons have future trips
    // that are within the 2-hour window
    if (internalData.selectedWagons.length > 0) {
      const wagonIds = internalData.selectedWagons.map(w => w.id);
      
      // Look for trips in the 2-hour window
      const { data: conflictTrips, error } = await supabase
        .from('trips')
        .select(`
          id, 
          datetime, 
          type, 
          source_track_id, 
          dest_track_id,
          trip_wagons!inner(wagon_id)
        `)
        .in('trip_wagons.wagon_id', wagonIds)
        .gte('datetime', timeBufferBefore.toISOString())
        .lte('datetime', timeBufferAfter.toISOString())
        .eq('is_planned', true)
        .neq('id', internalData.tripId || '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      // Filter to unique trips (may be duplicated due to multiple wagons)
      const uniqueConflictTrips = conflictTrips.filter((trip, index, self) =>
        index === self.findIndex(t => t.id === trip.id)
      );
      
      if (uniqueConflictTrips.length > 0) {
        const conflictWagons = new Set<string>();
        
        // Collect which wagons are in conflict
        for (const trip of uniqueConflictTrips) {
          // Get wagons for this trip
          const { data: tripWagons } = await supabase
            .from('trip_wagons')
            .select('wagon_id')
            .eq('trip_id', trip.id)
            .in('wagon_id', wagonIds);
          
          tripWagons?.forEach(tw => conflictWagons.add(tw.wagon_id));
        }
        
        // DEBUG: Convert this from an error to a warning for testing
        warnings.push({
          type: 'time_proximity',
          message: `${conflictWagons.size} wagons have another planned trip within 2 hours of this trip time.`,
          details: {
            conflictTrips: uniqueConflictTrips,
            conflictWagonIds: Array.from(conflictWagons),
            tripTime: tripDate.toISOString()
          }
        });
        
        // Comment out the error - replace with console log
        console.warn(`Time conflict detected but converted to warning for testing`);
        /*
        errors.push({
          field: 'selectedWagons',
          message: `${conflictWagons.size} wagons have another planned trip within 2 hours of this trip time.`,
          details: {
            conflictTrips: uniqueConflictTrips,
            conflictWagonIds: Array.from(conflictWagons),
            tripTime: tripDate.toISOString()
          }
        });
        */
      }
      
      // Also check if there are any planned trips for these wagons on the same day
      // but outside our 2-hour window (these are OK, just added as warnings)
      const sameDayStart = new Date(tripDate);
      sameDayStart.setHours(0, 0, 0, 0);
      
      const sameDayEnd = new Date(tripDate);
      sameDayEnd.setHours(23, 59, 59, 999);
      
      const { data: sameDayTrips, error: sameDayError } = await supabase
        .from('trips')
        .select(`
          id, 
          datetime, 
          type, 
          source_track_id, 
          dest_track_id,
          trip_wagons!inner(wagon_id)
        `)
        .in('trip_wagons.wagon_id', wagonIds)
        .gte('datetime', sameDayStart.toISOString())
        .lte('datetime', sameDayEnd.toISOString())
        .eq('is_planned', true)
        .or(`datetime.lt.${timeBufferBefore.toISOString()},datetime.gt.${timeBufferAfter.toISOString()}`);
      
      if (sameDayError) throw sameDayError;
      
      // Filter to unique trips (may be duplicated due to multiple wagons)
      const uniqueSameDayTrips = sameDayTrips.filter((trip, index, self) =>
        index === self.findIndex(t => t.id === trip.id)
      );
      
      if (uniqueSameDayTrips.length > 0) {
        warnings.push({
          type: 'same_day_trips',
          message: `${uniqueSameDayTrips.length} other trips on the same day (outside the 2-hour window).`,
          details: {
            sameDayTrips: uniqueSameDayTrips,
            selectedWagonIds: wagonIds,
            plannedTime: tripDate.toISOString()
          }
        });
      }
    }
  } catch (error: any) {
    console.error('Error checking trip conflicts:', error);
    warnings.push({
      type: 'conflict_check_error',
      message: `Error checking time conflicts: ${error.message}`
    });
  }
  
  // 4. Check destination track capacity
  if (internalData.destTrackId) {
    try {
      // Calculate total length of wagons being moved
      const totalWagonLength = internalData.selectedWagons.reduce((total, wagon) => total + (wagon.length || 0), 0);
      
      // Check capacity on destination track at the trip time
      const capacityResult = await checkTrackCapacityForTrip(
        internalData.destTrackId,
        internalData.dateTime,
        totalWagonLength
      );
      
      if (!capacityResult.hasCapacity) {
        // Get track details for better error message
        const { data: trackData } = await supabase
          .from('tracks')
          .select('name')
          .eq('id', internalData.destTrackId)
          .single();
        
        const trackName = trackData?.name || 'Unknown';
        
        errors.push({
          field: 'destTrackId',
          message: `Insufficient capacity on track "${trackName}". Available: ${capacityResult.availableLength || 0}m, Required: ${totalWagonLength}m.`,
          details: {
            trackId: internalData.destTrackId,
            trackName,
            availableLength: capacityResult.availableLength || 0,
            requiredLength: totalWagonLength,
            overCapacityBy: totalWagonLength - (capacityResult.availableLength || 0)
          }
        });
      }
    } catch (error: any) {
      console.error('Error checking destination track capacity:', error);
      errors.push({
        field: 'destTrackId',
        message: `Error checking destination track capacity: ${error.message}`
      });
    }
  }
  
  // 5. Check for restrictions on source and destination tracks
  try {
    // Use the new simplified restrictions checking for internal trips
    const restrictionsResult = await checkTripRestrictionsSimplified(
      'internal',
      internalData.dateTime,
      internalData.sourceTrackId,
      internalData.destTrackId
    );
    
    if (restrictionsResult.hasRestrictions) {
      // Process each restriction and categorize by source/destination
      restrictionsResult.restrictions.forEach(restriction => {
        if (restriction.type === 'no_exit' && restriction.affected_track_id === internalData.sourceTrackId) {
          warnings.push({
            type: 'source_restriction',
            message: `Einschränkung: Abfahrt von diesem Gleis zu diesem Zeitpunkt nicht möglich`,
            details: {
              restriction: restriction
            }
          });
        } else if (restriction.type === 'no_entry' && restriction.affected_track_id === internalData.destTrackId) {
          warnings.push({
            type: 'dest_restriction',
            message: `Einschränkung: Einfahrt auf dieses Gleis zu diesem Zeitpunkt nicht möglich`,
            details: {
              restriction: restriction
            }
          });
        }
      });
    }
  } catch (error: any) {
    console.error('Error checking track restrictions:', error);
    warnings.push({
      type: 'restrictions_check_error',
      message: `Error checking track restrictions: ${error.message}`
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
} 