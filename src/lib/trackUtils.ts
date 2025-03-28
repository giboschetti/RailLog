import { supabase } from './supabase';
import { Track, Wagon, TrackOccupancy } from './supabase';

/**
 * Interface for track occupancy data
 */
export interface TrackOccupancyData {
  total_length: number;
  occupied_length: number;
  available_length: number;
  occupancy_percentage: number;
  wagon_count: number;
}

/**
 * Check track capacity at a specific point in time
 * @param trackId The track ID to check
 * @param datetime The point in time to check
 * @param additionalLength Optional additional length to check if it would fit
 * @returns Object containing occupancy details
 */
export async function getTrackOccupancyAtTime(
  trackId: string, 
  datetime: string
): Promise<{
  success: boolean;
  hasCapacity: boolean;
  totalLength?: number;
  availableLength?: number;
  requiredLength?: number;
  errorMessage?: string;
}> {
  try {
    console.log(`Checking occupancy for track ${trackId} at ${datetime}`);
    
    // Call the simplified SQL function
    const { data, error } = await supabase.rpc('get_track_occupancy', { 
      track_id_param: trackId,
      timestamp_param: datetime 
    });

    if (error) {
      console.error("RPC error:", error);
      return { 
        success: false, 
        hasCapacity: false, 
        errorMessage: `RPC error: ${error.message}` 
      };
    }

    if (!data) {
      console.error("No occupancy data returned");
      return { 
        success: false, 
        hasCapacity: false, 
        errorMessage: "No occupancy data returned" 
      };
    }

    console.log("Occupancy data:", data);
    
    // Parse results from the JSON response
    const totalLength = data.total_length || 0;
    const availableLength = data.available_length || 0;
    
    // If track has no length limit, it has capacity
    const hasCapacity = totalLength === 0 ? true : availableLength > 0;

    return {
      success: true,
      hasCapacity,
      totalLength,
      availableLength
    };
  } catch (error: any) {
    console.error("Error checking track occupancy:", error);
    return {
      success: false,
      hasCapacity: false,
      errorMessage: error.message || "Unknown error checking track occupancy"
    };
  }
}

/**
 * Get wagon locations for a time period
 * @param startTime Start of the time period
 * @param endTime End of the time period
 * @param nodeIds Optional array of node IDs to filter by
 * @returns Array of wagon location data for the timeline
 */
export async function getWagonLocationsForTimeline(
  startTime: string,
  endTime: string,
  nodeIds?: string[]
) {
  try {
    let query = supabase
      .from('wagon_locations')
      .select(`
        id,
        wagon_id,
        track_id,
        arrival_time,
        departure_time,
        arrival_trip_id,
        departure_trip_id,
        wagons (
          id,
          length,
          content,
          number,
          type_id,
          project_id,
          wagon_types (
            name
          ),
          projects (
            name,
            color
          )
        ),
        tracks (
          name,
          useful_length,
          node_id,
          nodes (
            name
          )
        )
      `)
      .or(`and(arrival_time.gte.${startTime},arrival_time.lte.${endTime}),and(departure_time.gte.${startTime},departure_time.lte.${endTime}),and(arrival_time.lte.${startTime},or(departure_time.is.null,departure_time.gte.${endTime}))`);
    
    // Filter by nodes if provided
    if (nodeIds && nodeIds.length > 0) {
      query = query.in('tracks.node_id', nodeIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching wagon locations for timeline:', error);
    return [];
  }
}

/**
 * Check if a track has enough capacity for additional wagons
 * @param trackId The track ID to check
 * @param wagonLength Total length of wagons to add
 * @param tripId Optional trip ID to exclude wagons that are being moved
 * @returns Object containing result of check and details
 */
export async function checkTrackCapacity(
  trackId: string,
  wagonLength: number,
  tripId?: string
) {
  try {
    // Get track information
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) throw trackError;
    if (!trackData) throw new Error('Track not found');
    
    const track = trackData as Track;
    
    // Get wagons currently on this track
    let wagonsQuery = supabase
      .from('wagons')
      .select('id, length')
      .eq('current_track_id', trackId);
    
    // If tripId is provided, exclude wagons that are being moved in this trip
    if (tripId) {
      const { data: tripWagonData } = await supabase
        .from('trip_wagons')
        .select('wagon_id')
        .eq('trip_id', tripId);
      
      if (tripWagonData && tripWagonData.length > 0) {
        const excludeWagonIds = tripWagonData.map(tw => tw.wagon_id);
        wagonsQuery = wagonsQuery.not('id', 'in', `(${excludeWagonIds.join(',')})`);
      }
    }
    
    const { data: wagonsData, error: wagonsError } = await wagonsQuery;
    
    if (wagonsError) throw wagonsError;
    
    // Calculate current usage
    const currentUsage = wagonsData.reduce((total, wagon) => total + (wagon.length || 0), 0);
    
    // Track's useful_length
    const trackLength = track.useful_length || 0;
    
    // Check if adding these wagons would exceed capacity
    // Skip check if track has unlimited capacity (useful_length = 0)
    const hasCapacity = trackLength === 0 || currentUsage + wagonLength <= trackLength;
    
    console.log(`Track capacity check:`, {
      trackId,
      trackLength,
      currentUsage,
      wagonLength,
      remainingSpace: trackLength - currentUsage,
      hasCapacity
    });
    
    return {
      hasCapacity,
      currentUsage,
      availableSpace: trackLength - currentUsage,
      trackLength,
      additionalLength: wagonLength,
      track
    };
  } catch (error) {
    console.error('Error checking track capacity:', error);
    return {
      hasCapacity: false,
      error
    };
  }
}

/**
 * Check track capacity specifically for a trip at a given time
 * @param trackId The track ID to check
 * @param tripDateTime The datetime of the trip
 * @param wagonLength Total length of wagons to add
 * @returns Object containing result of check and details
 */
export async function checkTrackCapacityForTrip(
  trackId: string,
  tripDateTime: string,
  wagonLength: number
) {
  try {
    // Get track information
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) throw trackError;
    if (!trackData) throw new Error('Track not found');
    
    const track = trackData;
    
    // Get wagons currently on this track
    const { data: wagonsData, error: wagonsError } = await supabase
      .from('wagons')
      .select('id, length')
      .eq('current_track_id', trackId);
    
    if (wagonsError) throw wagonsError;
    
    // Calculate current usage
    const currentUsage = wagonsData.reduce((total, wagon) => total + (wagon.length || 0), 0);
    
    // Track's useful_length
    const trackLength = track.useful_length || 0;
    
    // Check if adding these wagons would exceed capacity
    // Skip check if track has unlimited capacity (useful_length = 0)
    const hasCapacity = trackLength === 0 || currentUsage + wagonLength <= trackLength;
    
    // Calculate available length
    const availableLength = trackLength - currentUsage;
    
    console.log(`Track capacity check for trip:`, {
      trackId,
      trackLength,
      currentUsage,
      wagonLength,
      availableLength,
      tripDateTime,
      hasCapacity
    });
    
    return {
      hasCapacity,
      currentUsage,
      availableLength,
      trackLength,
      additionalLength: wagonLength,
      track
    };
  } catch (error: any) {
    console.error('Error checking track capacity for trip:', error);
    return {
      hasCapacity: false,
      error: error.message,
      availableLength: 0
    };
  }
}

/**
 * New simplified version of checkTripRestrictions that uses the daily_restrictions table
 */
export async function checkTripRestrictionsSimplified(
  tripType: string, 
  datetime: string,
  sourceTrackId?: string, 
  destTrackId?: string
) {
  try {
    // Parse the datetime
    const tripDate = new Date(datetime);
    const dateString = tripDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeString = tripDate.toTimeString().substring(0, 8); // HH:MM:SS
    
    let restrictions: any[] = [];
    
    // Check for entry restrictions (deliveries and internal trips)
    if ((tripType === 'delivery' || tripType === 'internal') && destTrackId) {
      // Look for restrictions where destTrackId is in betroffene_gleise
      const { data: entryRestrictions, error: entryError } = await supabase
        .from('daily_restrictions')
        .select('*')
        .eq('type', 'no_entry')
        .contains('betroffene_gleise', [destTrackId]);
      
      if (entryError) {
        console.error('Error fetching entry restrictions:', entryError);
      } else if (entryRestrictions && entryRestrictions.length > 0) {
        // Filter restrictions by date
        const activeRestrictions = entryRestrictions.filter(r => {
          const restrictionDate = r.restriction_date ? new Date(r.restriction_date) : null;
          
          // Check if the restriction date matches (null means it applies to all dates)
          if (!restrictionDate) {
            return true; // Applies to all dates
          }
          
          // Compare just the dates (ignore time)
          const restrictionDateStr = restrictionDate.toISOString().split('T')[0];
          return restrictionDateStr === dateString;
        });
        
        if (activeRestrictions.length > 0) {
          restrictions = restrictions.concat(activeRestrictions.map(r => ({
            ...r,
            restriction_type: 'no_entry',
            affected_track_id: destTrackId,
            comment: r.comment || null
          })));
        }
      }
    }
    
    // Check for exit restrictions (departures and internal trips)
    if ((tripType === 'departure' || tripType === 'internal') && sourceTrackId) {
      // Look for restrictions where sourceTrackId is in betroffene_gleise
      const { data: exitRestrictions, error: exitError } = await supabase
        .from('daily_restrictions')
        .select('*')
        .eq('type', 'no_exit')
        .contains('betroffene_gleise', [sourceTrackId]);
      
      if (exitError) {
        console.error('Error fetching exit restrictions:', exitError);
      } else if (exitRestrictions && exitRestrictions.length > 0) {
        // Filter restrictions by date
        const activeRestrictions = exitRestrictions.filter(r => {
          const restrictionDate = r.restriction_date ? new Date(r.restriction_date) : null;
          
          // Check if the restriction date matches (null means it applies to all dates)
          if (!restrictionDate) {
            return true; // Applies to all dates
          }
          
          // Compare just the dates (ignore time)
          const restrictionDateStr = restrictionDate.toISOString().split('T')[0];
          return restrictionDateStr === dateString;
        });
        
        if (activeRestrictions.length > 0) {
          restrictions = restrictions.concat(activeRestrictions.map(r => ({
            ...r,
            restriction_type: 'no_exit',
            affected_track_id: sourceTrackId,
            comment: r.comment || null
          })));
        }
      }
    }
    
    return {
      hasRestrictions: restrictions.length > 0,
      restrictions
    };
  } catch (error) {
    console.error('Error checking trip restrictions:', error);
    return {
      hasRestrictions: false,
      restrictions: [],
      error
    };
  }
}

/**
 * Check if a trip is affected by any restrictions
 * @param tripType The type of trip (delivery, departure, internal)
 * @param datetime The date and time of the trip
 * @param sourceTrackId The ID of the source track (for departure and internal trips)
 * @param destTrackId The ID of the destination track (for delivery and internal trips)
 * @returns Object with hasRestrictions flag and details of any restrictions
 */
export async function checkTripRestrictions(
  tripType: string, 
  datetime: string,
  sourceTrackId?: string, 
  destTrackId?: string
) {
  // Simply call the simplified version
  return checkTripRestrictionsSimplified(tripType, datetime, sourceTrackId, destTrackId);
}

/**
 * Enhanced track occupancy type with additional calculated fields
 */
export interface TrackWithOccupancy extends Track {
  occupiedLength: number;
  availableLength: number;
  usagePercentage: number;
  wagonCount: number;
}

/**
 * Wagon with additional track-specific information
 */
export interface WagonOnTrack extends Wagon {
  position?: number; // Position on track (in meters from start)
  current_track_id?: string; // Current track ID from database
}

/**
 * Enhanced version of getTrackOccupancyAtTime that uses trip replay for accurate occupancy
 * @param trackId The track ID to check
 * @param datetime The point in time to check
 * @returns Object containing track data, wagons on track, and occupancy details
 */
export async function getEnhancedTrackOccupancy(
  trackId: string,
  datetime: string
): Promise<{
  success: boolean;
  trackData: TrackWithOccupancy | null;
  wagons: WagonOnTrack[];
  errorMessage?: string;
}> {
  try {
    console.log(`Getting enhanced occupancy for track ${trackId} at ${datetime}`);
    
    // 1. Get track information
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) {
      console.error("Track fetch error:", trackError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: `Error fetching track: ${trackError.message}` 
      };
    }
    
    if (!trackData) {
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: "Track not found" 
      };
    }

    const track = trackData as Track;
    const totalLength = track.useful_length || 0;
    
    // Check if we're looking at a past date, current date, or future date
    const dateParam = new Date(datetime);
    const currentDate = new Date();
    const isSameDay = dateParam.toDateString() === currentDate.toDateString();
    const isPastDate = dateParam < currentDate && !isSameDay;
    const isFutureDate = dateParam > currentDate && !isSameDay;

    // 2. Get all trips affecting this track up to the specified datetime
    let tripsQuery = supabase
      .from('trips')
      .select(`
        id, type, datetime, source_track_id, dest_track_id, is_planned,
        trip_wagons(wagon_id)
      `)
      .or(`source_track_id.eq.${trackId},dest_track_id.eq.${trackId}`)
      .lte('datetime', datetime)
      .order('datetime', { ascending: true });
    
    // For past dates, only include executed trips (not planned)
    if (isPastDate) {
      tripsQuery = tripsQuery.eq('is_planned', false);
    }
    
    // For current date or future dates, include planned and executed trips
    // to show the projected state at the end of the day
    
    const { data: tripsData, error: tripsError } = await tripsQuery;
    
    if (tripsError) {
      console.error("Trips fetch error:", tripsError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: `Error fetching trips: ${tripsError.message}` 
      };
    }
    
    console.log(`Found ${tripsData.length} trips affecting track ${trackId}`);
    
    // 3. Get all wagons that could be on this track
    // Extract all wagon IDs from the trips
    const allTripWagonIds = tripsData
      .flatMap(trip => trip.trip_wagons)
      .map(tw => tw.wagon_id);
    
    console.log(`Found ${allTripWagonIds.length} total wagon IDs from trips`);
    
    // When showing current state without any trips affecting this track,
    // just use the current_track_id as the source of truth
    if (allTripWagonIds.length === 0) {
      console.log("No trips found - using current_track_id for wagon locations");
      
      // First, get all wagons that have this track as their current_track_id
      const { data: currentWagons, error: currentWagonsError } = await supabase
        .from('wagons')
        .select(`
          id, 
          type_id, 
          number, 
          length, 
          content,
          project_id,
          construction_site_id,
          current_track_id,
          wagon_types(name, default_length)
        `)
        .eq('current_track_id', trackId);
      
      if (currentWagonsError) {
        console.error("Current wagons fetch error:", currentWagonsError);
        return { 
          success: false, 
          trackData: null, 
          wagons: [],
          errorMessage: `Error fetching current wagons: ${currentWagonsError.message}` 
        };
      }
      
      console.log(`Found ${currentWagons?.length || 0} wagons directly on track ${trackId}`);
      
      // Calculate occupancy statistics from current wagons
      const occupiedLength = currentWagons?.reduce((sum, wagon) => sum + (wagon.length || 0), 0) || 0;
      const availableLength = totalLength - occupiedLength;
      const usagePercentage = totalLength > 0 ? (occupiedLength / totalLength) * 100 : 0;
      
      // Add position information to wagons
      let currentPosition = 0;
      const wagonsWithPosition = currentWagons ? currentWagons.map(wagon => {
        const wagonLength = wagon.length || 0;
        const position = currentPosition;
        currentPosition += wagonLength;
        return { ...wagon, position } as unknown as WagonOnTrack;
      }) : [];
      
      return {
        success: true,
        trackData: {
          ...track,
          occupiedLength,
          availableLength,
          usagePercentage,
          wagonCount: currentWagons?.length || 0
        },
        wagons: wagonsWithPosition
      };
    }
    
    // Get data for all the wagons involved in trips
    let wagonsQuery = supabase
      .from('wagons')
      .select(`
        id, 
        type_id, 
        number, 
        length, 
        content,
        project_id,
        construction_site_id,
        current_track_id,
        wagon_types(name, default_length)
      `);
    
    // Only use IN clause if we have wagon IDs
    if (allTripWagonIds.length > 0) {
      wagonsQuery = wagonsQuery.in('id', allTripWagonIds);
    }
    
    const { data: wagonsData, error: wagonsError } = await wagonsQuery;
    
    if (wagonsError) {
      console.error("Wagons fetch error:", wagonsError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: `Error fetching wagons: ${wagonsError.message}` 
      };
    }
    
    console.log(`Retrieved ${wagonsData?.length || 0} wagons data`);
    
    // 4. Replay all trips to determine current wagons on track
    let wagonsOnTrack: WagonOnTrack[] = [];
    
    for (const trip of tripsData) {
      const tripWagonIds = trip.trip_wagons.map(tw => tw.wagon_id);
      const tripWagons = wagonsData.filter(w => tripWagonIds.includes(w.id));
      
      console.log(`Processing trip ${trip.id} of type ${trip.type} with ${tripWagonIds.length} wagons (planned: ${trip.is_planned})`);
      
      if (trip.type === 'delivery' && trip.dest_track_id === trackId) {
        // Wagons arrived on this track
        wagonsOnTrack = [...wagonsOnTrack, ...tripWagons] as WagonOnTrack[];
        console.log(`Added ${tripWagons.length} wagons to track (delivery)`);
      }
      else if (trip.type === 'departure' && trip.source_track_id === trackId) {
        // Wagons departed from this track
        const beforeCount = wagonsOnTrack.length;
        wagonsOnTrack = wagonsOnTrack.filter(w => !tripWagonIds.includes(w.id));
        console.log(`Removed ${beforeCount - wagonsOnTrack.length} wagons from track (departure)`);
      }
      else if (trip.type === 'internal') {
        if (trip.dest_track_id === trackId) {
          // Wagons arrived on this track
          wagonsOnTrack = [...wagonsOnTrack, ...tripWagons] as WagonOnTrack[];
          console.log(`Added ${tripWagons.length} wagons to track (internal arrival)`);
        }
        if (trip.source_track_id === trackId) {
          // Wagons departed from this track
          const beforeCount = wagonsOnTrack.length;
          wagonsOnTrack = wagonsOnTrack.filter(w => !tripWagonIds.includes(w.id));
          console.log(`Removed ${beforeCount - wagonsOnTrack.length} wagons from track (internal departure)`);
        }
      }
    }
    
    console.log(`After replaying trips: ${wagonsOnTrack.length} wagons on track ${trackId}`);
    
    // 5. Calculate occupancy statistics
    const occupiedLength = wagonsOnTrack.reduce((sum, wagon) => sum + (wagon.length || 0), 0);
    const availableLength = Math.max(0, totalLength - occupiedLength);
    const usagePercentage = totalLength > 0 ? (occupiedLength / totalLength) * 100 : 0;
    
    // 6. Add position information to wagons
    let currentPosition = 0;
    const wagonsWithPosition = wagonsOnTrack.map(wagon => {
      const wagonLength = wagon.length || 0;
      const position = currentPosition;
      currentPosition += wagonLength;
      return { ...wagon, position };
    });
    
    return {
      success: true,
      trackData: {
        ...track,
        occupiedLength,
        availableLength,
        usagePercentage,
        wagonCount: wagonsOnTrack.length
      },
      wagons: wagonsWithPosition
    };
  } catch (error: any) {
    console.error("Error calculating track occupancy:", error);
    return {
      success: false,
      trackData: null,
      wagons: [],
      errorMessage: error.message || "Unknown error calculating track occupancy"
    };
  }
}

/**
 * Expands a restriction into daily records
 * This takes a single restriction and creates daily_restriction records for each day
 * 
 * NOTE: This function requires appropriate RLS permissions. 
 * The user must have permission to insert into the daily_restrictions table.
 */
export async function expandRestriction(
  restrictionId: string,
  projectId: string,
  startDateTime: string, 
  endDateTime: string,
  repetitionPattern: string,
  restrictionType: string,
  trackIds: string[],
  comment?: string,
  supabaseClient = supabase // Default to imported client, but allow override
) {
  try {
    console.log('expandRestriction called with params:', { 
      restrictionId, 
      projectId, 
      startDateTime, 
      endDateTime, 
      repetitionPattern, 
      restrictionType,
      trackIdsCount: trackIds.length,
      hasSupabase: !!supabaseClient
    });
    
    // Validate the supabase client is working
    try {
      const healthCheck = await supabaseClient.from('daily_restrictions').select('count', { count: 'exact', head: true });
      console.log('Supabase health check:', healthCheck);
    } catch (err) {
      console.error('Supabase health check failed:', err);
    }
    
    // Parse dates with explicit UTC handling to avoid timezone issues
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
    console.log(`Original date inputs:
    - startDateTime: ${startDateTime}
    - endDateTime: ${endDateTime}
    - parsed startDate: ${startDate.toISOString()}
    - parsed endDate: ${endDate.toISOString()}`);
    
    // Get original start and end time components
    const originalTimeFrom = startDate.toTimeString().substring(0, 8); // HH:MM:SS
    const originalTimeTo = endDate.toTimeString().substring(0, 8);
    
    // For 'once' pattern, create daily records for each day in the range
    if (repetitionPattern === 'once') {
      const dailyRecords = [];
      
      // FIX: Properly extract year, month, and day directly from the original Date objects
      // to avoid timezone shift issues when creating date-only objects
      const startYear = startDate.getFullYear();
      const startMonth = startDate.getMonth(); 
      const startDay = startDate.getDate();
      
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth();
      const endDay = endDate.getDate();
      
      // Create dates without time component for date comparison
      // Using the local date components to create UTC date objects
      const startDateOnly = new Date(Date.UTC(startYear, startMonth, startDay));
      const endDateOnly = new Date(Date.UTC(endYear, endMonth, endDay));
      
      console.log(`Fixed date comparison values:
      - Using local date parts: ${startYear}-${startMonth+1}-${startDay} to ${endYear}-${endMonth+1}-${endDay}
      - startDateOnly: ${startDateOnly.toISOString()}
      - endDateOnly: ${endDateOnly.toISOString()}`);
      
      // Calculate days between dates (inclusive)
      // Add 1 to include the end date (end - start) / day_in_ms + 1
      const dayDiff = Math.floor((endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      console.log(`Calculated day difference (inclusive): ${dayDiff} days`);
      
      // Create a date for each day in the range (inclusive of both start and end date)
      for (let i = 0; i < dayDiff; i++) {
        // Clone the start date and add days
        const currentDate = new Date(Date.UTC(
          startYear,
          startMonth,
          startDay + i
        ));
        
        // Format as YYYY-MM-DD for database
        const year = currentDate.getUTCFullYear();
        const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getUTCDate()).padStart(2, '0');
        const currentDateString = `${year}-${month}-${day}`;
        
        // Determine the correct time_from and time_to for this specific day
        let timeFrom = '00:00:00';
        let timeTo = '23:59:59';
        
        // If this is the first day (start date), use the original start time
        if (i === 0) {
          timeFrom = originalTimeFrom;
        }
        
        // If this is the last day (end date), use the original end time
        if (i === dayDiff - 1) {
          timeTo = originalTimeTo;
        }
        
        console.log(`Creating daily record ${i+1} of ${dayDiff}:
        - Date: ${currentDateString}
        - Time range: ${timeFrom} - ${timeTo}
        - Is first day: ${i === 0}
        - Is last day: ${i === dayDiff - 1}`);
        
        dailyRecords.push({
          original_restriction_id: restrictionId,
          project_id: projectId,
          restriction_date: currentDateString,
          time_from: timeFrom,
          time_to: timeTo,
          type: restrictionType,
          betroffene_gleise: trackIds,
          comment: comment || null
        });
      }
      
      // Insert all daily records
      if (dailyRecords.length > 0) {
        console.log(`Generated ${dailyRecords.length} daily records for restriction ${restrictionId}:`);
        console.log('First record:', dailyRecords[0]);
        console.log('Last record:', dailyRecords[dailyRecords.length-1]);
        
        // Add explicit type casting for the betroffene_gleise array
        const processedRecords = dailyRecords.map(record => ({
          ...record,
          betroffene_gleise: record.betroffene_gleise // PostgreSQL will handle this as UUID[]
        }));
        
        // Try to insert records
        try {
          const { error, data } = await supabaseClient
            .from('daily_restrictions')
            .insert(processedRecords)
            .select();
          
          if (error) {
            console.error('Error inserting daily records in bulk:', error);
            
            // Try inserting one by one to identify which record is problematic
            console.log('Trying to insert records one by one...');
            let successCount = 0;
            
            for (const record of processedRecords) {
              const { error: singleError } = await supabaseClient
                .from('daily_restrictions')
                .insert(record);
              
              if (singleError) {
                console.error('Error inserting single record:', singleError, record);
              } else {
                successCount++;
              }
            }
            
            console.log(`Successfully inserted ${successCount}/${processedRecords.length} records individually`);
            
            if (successCount === 0) {
              throw new Error(`Failed to insert any daily restrictions: ${error.message}`);
            }
          } else {
            console.log('Successfully inserted all daily records:', data?.length || 0);
          }
        } catch (insertError) {
          console.error('Exception during daily_restrictions insert:', insertError);
          throw insertError;
        }
      }
    } 
    // For 'daily' pattern, create a single record that represents the recurring pattern
    else if (repetitionPattern === 'daily') {
      // For daily pattern, the date is less important - we'll just use the start date
      // but time_from and time_to are critical
      const dateString = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const dailyRecord = {
        original_restriction_id: restrictionId,
        project_id: projectId,
        restriction_date: dateString,
        time_from: originalTimeFrom,
        time_to: originalTimeTo,
        type: restrictionType,
        betroffene_gleise: trackIds,  // This is already an array of UUIDs
        comment: comment || null
      };
      
      console.log(`Inserting daily record for daily restriction ${restrictionId}`, dailyRecord);
      try {
        // Make sure we're sending the proper type
        const processedRecord = {
          ...dailyRecord,
          betroffene_gleise: dailyRecord.betroffene_gleise // PostgreSQL will handle this as UUID[]
        };
        
        const { error, data } = await supabaseClient
          .from('daily_restrictions')
          .insert(processedRecord)
          .select();
        
        if (error) {
          console.error('Error inserting daily record for pattern:', error);
          throw error;
        } else {
          console.log('Successfully inserted daily pattern record:', data?.length || 0);
        }
      } catch (insertError) {
        console.error('Exception during daily_restrictions insert for pattern:', insertError);
        throw insertError;
      }
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error expanding restriction:', error);
    return {
      success: false,
      error
    };
  }
}

/**
 * Format restriction time and date for display in UI
 * @param restriction The restriction object from the database
 * @returns A formatted string to display in the UI
 */
export function formatRestrictionForDisplay(restriction: any): {
  type: string;
  grund: string;
  fromTime: string;
  toTime: string;
  dateRange: string;
  fromDateTime: string;
  toDateTime: string;
} {
  if (!restriction) {
    return {
      type: 'Unbekannt',
      grund: 'Nicht angegeben',
      fromTime: '',
      toTime: '',
      dateRange: '',
      fromDateTime: '',
      toDateTime: ''
    };
  }
  
  // Format the restriction type
  const type = restriction.restriction_type || restriction.type || 'Unbekannt';
  const displayType = type === 'no_entry' ? 'Keine Einfahrt' : type === 'no_exit' ? 'Keine Ausfahrt' : type;
  
  // Get the comment/grund
  const grund = restriction.comment || 'Nicht angegeben';
  
  // Format date/time fields (handle both new and old formats)
  let fromDateTime = '';
  let toDateTime = '';
  let fromTime = '';
  let toTime = '';
  let dateRange = '';
  
  // If we have start_datetime/end_datetime from the original restriction
  if (restriction.start_datetime || restriction.from_datetime) {
    const startDate = new Date(restriction.start_datetime || restriction.from_datetime);
    fromDateTime = startDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + startDate.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  if (restriction.end_datetime || restriction.to_datetime) {
    const endDate = new Date(restriction.end_datetime || restriction.to_datetime);
    toDateTime = endDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + endDate.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Format the time range for daily_restrictions format
  if (restriction.time_from) {
    const formatTimeString = (timeStr: string) => {
      if (!timeStr) return '';
      
      // Extract just the hour:minute part
      if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        return `${parts[0]}:${parts[1]}`;
      }
      
      return timeStr;
    };

    fromTime = formatTimeString(restriction.time_from) || '00:00';
    toTime = formatTimeString(restriction.time_to) || '23:59';
  }
  
  // Format the date range for daily_restrictions format
  if (restriction.restriction_date) {
    try {
      const date = new Date(restriction.restriction_date);
      dateRange = date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (e) {
      dateRange = restriction.restriction_date;
    }
  }
  
  return {
    type: displayType,
    grund,
    fromTime,
    toTime,
    dateRange,
    fromDateTime,
    toDateTime
  };
} 