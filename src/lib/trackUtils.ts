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
    console.log(`Checking track capacity for trip at ${tripDateTime}`);
    
    // Get track information
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) throw trackError;
    if (!trackData) throw new Error('Track not found');
    
    const track = trackData;
    
    // Track's useful_length
    const trackLength = track.useful_length || 0;
    
    // Skip capacity check if track has unlimited capacity
    if (trackLength === 0) {
      return {
        hasCapacity: true,
        currentUsage: 0,
        availableLength: 0, // Unlimited
        trackLength: 0,
        additionalLength: wagonLength,
        track
      };
    }
    
    // Parse the trip datetime for time-based lookups
    const tripTime = new Date(tripDateTime);
    
    // Create time buffer objects (1 hour before and after) - using 2-hour window consistent with tripValidation.ts
    const timeBufferBefore = new Date(tripTime);
    timeBufferBefore.setHours(tripTime.getHours() - 1);
    
    const timeBufferAfter = new Date(tripTime);
    timeBufferAfter.setHours(tripTime.getHours() + 1);
    
    console.log('Using time window:', {
      tripTime: tripTime.toISOString(),
      timeBufferRange: `${timeBufferBefore.toISOString()} to ${timeBufferAfter.toISOString()}`
    });
    
    // 1. Get wagons that will be on the track at the time of the trip
    const { data: currentWagonsData, error: currentWagonsError } = await supabase
      .from('wagons')
      .select('id, length')
      .eq('current_track_id', trackId);
    
    if (currentWagonsError) throw currentWagonsError;
    
    // Current wagons on the track
    const currentWagons = currentWagonsData || [];
    
    // 2. Get all future trips affecting this track before the trip time
    // For internal trips or departures that would remove wagons
    const { data: departureTripData, error: departureTripError } = await supabase
      .from('trips')
      .select(`
        id,
        datetime,
        source_track_id,
        type,
        trip_wagons(wagon_id)
      `)
      .eq('is_planned', true)
      .eq('source_track_id', trackId)
      .lt('datetime', tripTime.toISOString())
      .gt('datetime', new Date().toISOString())
      .or('type.eq.internal,type.eq.departure')
      .order('datetime', { ascending: true });
    
    if (departureTripError) throw departureTripError;
    
    // 3. Get all future trips that would add wagons to this track before the trip time
    const { data: arrivalTripData, error: arrivalTripError } = await supabase
      .from('trips')
      .select(`
        id,
        datetime,
        dest_track_id,
        type,
        trip_wagons(wagon_id)
      `)
      .eq('is_planned', true)
      .eq('dest_track_id', trackId)
      .lt('datetime', tripTime.toISOString())
      .gt('datetime', new Date().toISOString())
      .or('type.eq.internal,type.eq.delivery')
      .order('datetime', { ascending: true });
    
    if (arrivalTripError) throw arrivalTripError;
    
    // 4. Check for trips that would conflict with our target trip time
    // (trips within the 2-hour window)
    const { data: conflictTripData, error: conflictTripError } = await supabase
      .from('trips')
      .select(`
        id,
        datetime,
        type
      `)
      .eq('is_planned', true)
      .or(`source_track_id.eq.${trackId},dest_track_id.eq.${trackId}`)
      .gte('datetime', timeBufferBefore.toISOString())
      .lte('datetime', timeBufferAfter.toISOString());
    
    if (conflictTripError) throw conflictTripError;
    
    const hasTimeConflicts = (conflictTripData || []).length > 0;
    if (hasTimeConflicts) {
      console.log('Found time conflicts:', conflictTripData);
    }
    
    // 5. Calculate expected track usage at trip time
    
    // First, identify wagons that will be removed
    const wagonsToRemove = new Set<string>();
    departureTripData?.forEach(trip => {
      trip.trip_wagons?.forEach((tw: any) => {
        wagonsToRemove.add(tw.wagon_id);
      });
    });
    
    // Filter current wagons to remove those that will be gone
    const remainingWagons = currentWagons.filter(wagon => !wagonsToRemove.has(wagon.id));
    
    // Add lengths of wagons that will arrive before the trip
    const wagonsToAdd: { length: number }[] = [];
    arrivalTripData?.forEach(trip => {
      // We need to count how many wagons will be added - for simplicity
      // we'll estimate based on trip_wagons count, using average length
      const wagonCount = trip.trip_wagons?.length || 0;
      const avgWagonLength = 15; // Default average wagon length
      
      // Add estimated length for each wagon
      for (let i = 0; i < wagonCount; i++) {
        wagonsToAdd.push({ length: avgWagonLength });
      }
    });
    
    // Calculate current usage at trip time
    const currentUsage = [
      ...remainingWagons,
      ...wagonsToAdd
    ].reduce((total, wagon) => total + (wagon.length || 0), 0);
    
    // Calculate available space
    const availableLength = trackLength - currentUsage;
    
    // Check if adding these wagons would exceed capacity
    const hasCapacity = currentUsage + wagonLength <= trackLength;
    
    console.log(`Time-based track capacity check for trip:`, {
      trackId,
      trackLength,
      tripTime: tripTime.toISOString(),
      currentWagonsCount: currentWagons.length,
      wagonsToRemoveCount: wagonsToRemove.size,
      wagonsToAddCount: wagonsToAdd.length,
      calculatedUsage: currentUsage,
      additionalLength: wagonLength,
      availableLength,
      hasCapacity,
      hasTimeConflicts
    });
    
    return {
      hasCapacity,
      currentUsage,
      availableLength,
      trackLength,
      additionalLength: wagonLength,
      track,
      timeBasedCheck: true,
      hasTimeConflicts
    };
  } catch (error: any) {
    console.error('Error checking track capacity for trip:', error);
    
    // Fall back to simple static check on failure
    return checkTrackCapacityStatic(trackId, wagonLength);
  }
}

/**
 * Simple static capacity check (not time-based) as a fallback
 */
async function checkTrackCapacityStatic(trackId: string, wagonLength: number) {
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
    
    return {
      hasCapacity,
      currentUsage,
      availableLength: trackLength - currentUsage,
      trackLength,
      additionalLength: wagonLength,
      track,
      staticCheck: true
    };
  } catch (error: any) {
    console.error('Error in static capacity check:', error);
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
 * Wagon interface
 */
export interface Wagon {
  id: string;
  type_id?: string;
  number?: string;
  temp_id?: string;
  length: number;
  content?: string;
  project_id?: string;
  construction_site_id?: string;
  created_at?: string;
  updated_at?: string;
  wagon_types?: any; // For the joined table data
}

/**
 * Wagon with additional track-specific information
 */
export interface WagonOnTrack extends Wagon {
  position?: number; // Position on track (in meters from start)
  current_track_id?: string; // Current track ID from database
}

/**
 * Interface for trajectory data returned from the SQL function
 */
interface TrajectoryData {
  trajectory_id: string;
  wagon_id: string;
  event_time: string;
  move_type: string;
}

/**
 * Type guard to validate and transform trajectory data if necessary
 */
function validateTrajectoryData(data: any[]): TrajectoryData[] {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  // Check if the data is already in the expected format
  if (data[0].trajectory_id && data[0].wagon_id && data[0].event_time && data[0].move_type) {
    return data as TrajectoryData[];
  }
  
  // If data is in a different format, try to transform it
  console.log("Transforming trajectory data to expected format");
  
  return data.map(item => {
    // Create a new object with the expected structure
    const transformedItem: TrajectoryData = {
      trajectory_id: item.trajectory_id || item.id || '',
      wagon_id: item.wagon_id || '',
      event_time: item.event_time || item.timestamp || new Date().toISOString(),
      move_type: item.move_type || 'unknown'
    };
    
    return transformedItem;
  });
}

/**
 * Advanced function to get track occupancy information with wagon details
 * Uses the enhanced function that relies on wagon_trajectories
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
    // 1. Get track details first
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) {
      console.error("Error fetching track data:", trackError);
      return { success: false, trackData: null, wagons: [], errorMessage: `Error loading track: ${trackError.message}` };
    }
    
    const track = trackData;
    const totalLength = track.useful_length || 0;
    
    // 2. Use the updated RPC function to get wagons at this specific time
    // The function now handles proper deduplication based on updated_at
    console.log(`Fetching wagons on track ${trackId} at ${datetime}`);
    
    const { data: rawTrajectoryData, error: trajectoryError } = await supabase
      .rpc('get_track_wagons_at_time', {
        track_id_param: trackId,
        time_param: datetime
      });
    
    // Process the data from RPC call or try fallback approach
    let trajectoryData: any[] = [];
    
    if (trajectoryError) {
      console.error("Error with trajectory query:", trajectoryError);
      
      // Use a fallback approach that matches our updated RPC logic
      console.log("Attempting fallback query...");
      try {
        // First, get all trajectories up to the specified time
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('wagon_trajectories')
          .select('id, wagon_id, track_id, move_type, timestamp, updated_at')
          .eq('track_id', trackId)
          .lte('timestamp', datetime)
          .order('updated_at', { ascending: false });
          
        if (fallbackError) {
          console.error("Fallback query failed:", fallbackError);
          return { 
            success: false, 
            trackData: null, 
            wagons: [],
            errorMessage: `Error with wagon trajectory query: ${trajectoryError.message}. Fallback also failed: ${fallbackError.message}` 
          };
        }
        
        // Manually deduplicate by keeping only the most recently updated trajectory for each wagon
        console.log(`Fallback found ${fallbackData?.length || 0} trajectory records before filtering`);
        
        const latestTrajectories = new Map();
        
        fallbackData?.forEach(item => {
          const existingItem = latestTrajectories.get(item.wagon_id);
          if (!existingItem || new Date(item.updated_at) > new Date(existingItem.updated_at)) {
            latestTrajectories.set(item.wagon_id, item);
          }
        });
        
        const uniqueFallbackData = Array.from(latestTrajectories.values());
        console.log(`After deduplication, using ${uniqueFallbackData.length} wagon records`);
        
        // Transform fallback data to match expected structure
        const transformedData = uniqueFallbackData.map(item => ({
          trajectory_id: item.id,
          wagon_id: item.wagon_id,
          event_time: item.timestamp,
          move_type: item.move_type
        }));
        
        trajectoryData = validateTrajectoryData(transformedData || []);
      } catch (fallbackError: any) {
        console.error("Error in fallback approach:", fallbackError);
        return {
          success: false,
          trackData: null,
          wagons: [],
          errorMessage: `Fallback approach failed: ${fallbackError.message}`
        };
      }
    } else {
      // Process data from successful RPC call
      trajectoryData = validateTrajectoryData(rawTrajectoryData || []);
    }
    
    // Log the trajectories we're going to display for debugging
    console.log(`Found ${trajectoryData.length} wagons on track ${trackId} at time ${datetime}`);
    
    // If no wagons found at this time, return empty track
    if (trajectoryData.length === 0) {
      return {
        success: true,
        trackData: {
          ...track,
          occupiedLength: 0,
          availableLength: totalLength,
          usagePercentage: 0,
          wagonCount: 0
        },
        wagons: []
      };
    }
    
    // CRITICAL: Ensure we're only using one trajectory per wagon by deduplicating
    const uniqueWagonIds = new Set<string>();
    const uniqueTrajectories = trajectoryData.filter(trajectory => {
      // Keep only the first occurrence of each wagon_id
      if (uniqueWagonIds.has(trajectory.wagon_id)) {
        console.log(`Filtering out duplicate trajectory for wagon ${trajectory.wagon_id}`);
        return false;
      }
      
      uniqueWagonIds.add(trajectory.wagon_id);
      return true;
    });
    
    if (uniqueTrajectories.length < trajectoryData.length) {
      console.log(`Removed ${trajectoryData.length - uniqueTrajectories.length} duplicate wagons from trajectory data`);
    }
    
    // Get all wagon details for the found trajectories
    const wagonIds = uniqueTrajectories.map(t => t.wagon_id);
    
    const { data: wagonsData, error: wagonsError } = await supabase
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
        temp_id,
        wagon_types(name, default_length)
      `)
      .in('id', wagonIds);
    
    if (wagonsError) {
      console.error("Error fetching wagons:", wagonsError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: `Error fetching wagons: ${wagonsError.message}` 
      };
    }
    
    // Create a map of wagons by ID for easy lookup
    const wagonsById: Record<string, any> = {};
    wagonsData.forEach(wagon => {
      wagonsById[wagon.id] = wagon;
    });
    
    // Create an array of wagons with position information
    const wagonsOnTrack: WagonOnTrack[] = [];
    let currentPosition = 0;
    
    // Sort trajectories by event_time to maintain chronological order
    const sortedTrajectories = [...uniqueTrajectories].sort((a, b) => {
      const timeA = a.event_time ? new Date(a.event_time).getTime() : 0;
      const timeB = b.event_time ? new Date(b.event_time).getTime() : 0;
      return timeA - timeB;
    });
    
    // Log all wagons we're going to display for debugging
    console.log(`Displaying ${sortedTrajectories.length} wagons on track ${trackId}:`);
    sortedTrajectories.forEach(trajectory => {
      console.log(`Wagon ${trajectory.wagon_id} - move_type: ${trajectory.move_type} - time: ${trajectory.event_time}`);
    });
    
    // Use a Set to track which wagons we've already added
    const addedWagonIds = new Set<string>();
    
    sortedTrajectories.forEach(trajectory => {
      const wagon = wagonsById[trajectory.wagon_id];
      // Skip if this wagon is already added or not found
      if (!wagon || addedWagonIds.has(wagon.id)) {
        console.log(`Skipping wagon ${trajectory.wagon_id} - already added or not found`);
        return;
      }
      
      const wagonLength = wagon.length || 0;
      
      wagonsOnTrack.push({
        ...wagon,
        position: currentPosition
      } as WagonOnTrack);
      
      // Mark this wagon as added
      addedWagonIds.add(wagon.id);
      
      currentPosition += wagonLength;
    });
    
    // Calculate occupancy statistics
    const occupiedLength = wagonsOnTrack.reduce((sum, wagon) => sum + (wagon.length || 0), 0);
    const availableLength = Math.max(0, totalLength - occupiedLength);
    const usagePercentage = totalLength > 0 ? (occupiedLength / totalLength) * 100 : 0;
    
    return {
      success: true,
      trackData: {
        ...track,
        occupiedLength,
        availableLength,
        usagePercentage,
        wagonCount: wagonsOnTrack.length
      },
      wagons: wagonsOnTrack
    };
  } catch (error: any) {
    console.error("Unexpected error in getEnhancedTrackOccupancy:", error);
    return {
      success: false,
      trackData: null,
      wagons: [],
      errorMessage: `Unexpected error: ${error.message}`
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

/**
 * Quick validation for drag-and-drop operations
 * This is a lightweight version of validateInternalTrip without DB calls
 * @param sourceTrackId Source track ID
 * @param destTrackId Destination track ID
 * @param selectedWagons Array of wagons being moved
 * @param tracks Array of tracks (for quick capacity lookup)
 * @returns ValidationResult with quick checks
 */
export function validateDragDrop(
  sourceTrackId: string,
  destTrackId: string,
  selectedWagons: Array<{id: string, length: number}>,
  tracks: Array<{id: string, useful_length: number, wagons?: Array<{id: string, length: number}>}>
) {
  const errors: Array<{field: string, message: string}> = [];
  
  // Basic validation
  if (!sourceTrackId) {
    errors.push({
      field: 'sourceTrackId',
      message: 'Source track is required'
    });
  }
  
  if (!destTrackId) {
    errors.push({
      field: 'destTrackId',
      message: 'Destination track is required'
    });
  }
  
  if (sourceTrackId === destTrackId) {
    errors.push({
      field: 'destTrackId',
      message: 'Source and destination tracks must be different'
    });
  }
  
  if (!selectedWagons || selectedWagons.length === 0) {
    errors.push({
      field: 'selectedWagons',
      message: 'At least one wagon must be selected'
    });
  }
  
  // If there are basic validation errors, return early
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings: []
    };
  }
  
  // Quick capacity check without database calls
  // Find destination track in provided tracks array
  const destTrack = tracks.find(t => t.id === destTrackId);
  
  if (destTrack) {
    // Skip capacity check if track has unlimited capacity
    if (destTrack.useful_length > 0) {
      // Calculate total length of wagons being moved
      const totalWagonLength = selectedWagons.reduce(
        (total, wagon) => total + (wagon.length || 0), 
        0
      );
      
      // Calculate current usage of destination track
      const currentWagons = destTrack.wagons || [];
      const currentUsage = currentWagons.reduce(
        (total, wagon) => total + (wagon.length || 0),
        0
      );
      
      // Check if adding these wagons would exceed capacity
      const availableLength = destTrack.useful_length - currentUsage;
      
      if (totalWagonLength > availableLength) {
        errors.push({
          field: 'destTrackId',
          message: `Insufficient capacity on destination track. Available: ${availableLength}m, Required: ${totalWagonLength}m.`
        });
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings: [] // For quick validation, we skip generating warnings
  };
}

/**
 * Get wagons on a track using the current_track_id field directly from the wagons table
 * This is a simpler, more direct approach that avoids complex trajectory queries
 */
export async function getTrackWagonsFromCurrentTrackId(
  trackId: string,
  datetime: string
): Promise<{
  success: boolean;
  trackData: TrackWithOccupancy | null;
  wagons: WagonOnTrack[];
  errorMessage?: string;
}> {
  try {
    console.log(`Fetching track data for track ${trackId} directly from wagons table`);
    
    // 1. Get track details first
    const { data: trackData, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', trackId)
      .single();
    
    if (trackError) {
      console.error("Error fetching track data:", trackError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [], 
        errorMessage: `Error loading track: ${trackError.message}` 
      };
    }
    
    const track = trackData;
    const totalLength = track.useful_length || 0;
    
    // 2. Get all wagons directly using current_track_id
    const { data: wagonsData, error: wagonsError } = await supabase
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
        temp_id,
        created_at,
        updated_at,
        wagon_types(name, default_length)
      `)
      .eq('current_track_id', trackId);
    
    if (wagonsError) {
      console.error("Error fetching wagons:", wagonsError);
      return { 
        success: false, 
        trackData: null, 
        wagons: [],
        errorMessage: `Error fetching wagons: ${wagonsError.message}` 
      };
    }
    
    console.log(`Found ${wagonsData.length} wagons on track ${trackId} using current_track_id approach`);
    
    // If no wagons found, return empty track
    if (!wagonsData || wagonsData.length === 0) {
      return {
        success: true,
        trackData: {
          ...track,
          occupiedLength: 0,
          availableLength: totalLength,
          usagePercentage: 0,
          wagonCount: 0
        },
        wagons: []
      };
    }
    
    // Calculate track occupancy statistics
    const occupiedLength = wagonsData.reduce((sum, wagon) => sum + (wagon.length || 0), 0);
    const availableLength = totalLength > 0 ? Math.max(0, totalLength - occupiedLength) : 9999999;
    const usagePercentage = totalLength > 0 ? (occupiedLength / totalLength) * 100 : 0;
    
    // Create enhanced track data
    const enhancedTrackData: TrackWithOccupancy = {
      ...track,
      occupiedLength,
      availableLength,
      usagePercentage,
      wagonCount: wagonsData.length
    };
    
    // Create array of wagons with position information
    // Calculate positions based on wagon order in the array
    const wagonsOnTrack: WagonOnTrack[] = [];
    let currentPosition = 0;
    
    wagonsData.forEach((wagon) => {
      const wagonLength = wagon.length || 0;
      
      // Add the wagon with its calculated position
      wagonsOnTrack.push({
        ...wagon,
        position: currentPosition
      } as WagonOnTrack);
      
      // Update position for the next wagon
      currentPosition += wagonLength;
    });
    
    // Log result for debugging
    console.log(`Successfully processed ${wagonsOnTrack.length} wagons with direct approach`);
    
    return {
      success: true,
      trackData: enhancedTrackData,
      wagons: wagonsOnTrack
    };
  } catch (error: any) {
    console.error("Error in getTrackWagonsFromCurrentTrackId:", error);
    return {
      success: false,
      trackData: null,
      wagons: [],
      errorMessage: `Error retrieving track wagons: ${error.message}`
    };
  }
} 