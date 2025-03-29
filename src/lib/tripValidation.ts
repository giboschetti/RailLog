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
        .eq('is_planned', true);
      
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
        
        errors.push({
          field: 'selectedWagons',
          message: `${conflictWagons.size} wagons have another planned trip within 2 hours of this trip time.`,
          details: {
            conflictTrips: uniqueConflictTrips,
            conflictWagonIds: Array.from(conflictWagons),
            tripTime: tripDate.toISOString()
          }
        });
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
        .not('datetime', 'gte', timeBufferBefore.toISOString())
        .not('datetime', 'lte', timeBufferAfter.toISOString());
      
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
    const tripDate = new Date(internalData.dateTime);
    
    // Check for outgoing restrictions on source track
    if (internalData.sourceTrackId) {
      // Get source track's node
      const { data: sourceTrackData } = await supabase
        .from('tracks')
        .select('node_id')
        .eq('id', internalData.sourceTrackId)
        .single();
      
      if (sourceTrackData?.node_id) {
        // Check for "out" restrictions that would prevent departure
        const { data: sourceRestrictionsData } = await supabase
          .from('restrictions')
          .select('*')
          .eq('type', 'out')
          .lte('from_datetime', tripDate.toISOString())
          .gte('to_datetime', tripDate.toISOString())
          .or(`node_id.eq.${sourceTrackData.node_id},track_id.eq.${internalData.sourceTrackId}`);
        
        if (sourceRestrictionsData && sourceRestrictionsData.length > 0) {
          warnings.push({
            type: 'source_restriction',
            message: `${sourceRestrictionsData.length} restrictions may prevent departures from the source track at this time`,
            details: {
              restrictions: sourceRestrictionsData
            }
          });
        }
      }
    }
    
    // Check for incoming restrictions on destination track
    if (internalData.destTrackId) {
      // Get destination track's node
      const { data: destTrackData } = await supabase
        .from('tracks')
        .select('node_id')
        .eq('id', internalData.destTrackId)
        .single();
      
      if (destTrackData?.node_id) {
        // Check for "in" restrictions that would prevent arrival
        const { data: destRestrictionsData } = await supabase
          .from('restrictions')
          .select('*')
          .eq('type', 'in')
          .lte('from_datetime', tripDate.toISOString())
          .gte('to_datetime', tripDate.toISOString())
          .or(`node_id.eq.${destTrackData.node_id},track_id.eq.${internalData.destTrackId}`);
        
        if (destRestrictionsData && destRestrictionsData.length > 0) {
          warnings.push({
            type: 'dest_restriction',
            message: `${destRestrictionsData.length} restrictions may prevent arrivals at the destination track at this time`,
            details: {
              restrictions: destRestrictionsData
            }
          });
        }
      }
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