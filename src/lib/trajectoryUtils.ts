import { supabase } from './supabase';
import { formatDateTime } from './utils';

export interface WagonTrajectory {
  id: string;
  wagon_id: string;
  track_id: string;
  node_id: string;
  timestamp: string;
  move_type: 'initial' | 'delivery' | 'departure' | 'internal' | 'manual';
  trip_id?: string;
  previous_track_id?: string;
  position?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  track_name?: string;
  node_name?: string;
  previous_track_name?: string;
  previous_node_name?: string;
  trip_type?: string;
  transport_plan_number?: string;
}

export interface FormattedTrajectory extends WagonTrajectory {
  formattedDate: string;
  formattedTime: string;
  durationAtLocation: string;
  moveTypeLabel: string;
}

const moveTypeLabels: Record<string, string> = {
  initial: 'Erstplatzierung',
  delivery: 'Anlieferung/Erstplatzierung',
  departure: 'Abfahrt',
  internal: 'Interne Bewegung',
  manual: 'Manuelle Änderung'
};

/**
 * Fetches the complete trajectory history for a wagon
 */
export async function getWagonTrajectory(wagonId: string): Promise<FormattedTrajectory[]> {
  // Fetch all trajectory records for this wagon with related data
  // Explicitly join with trips table to get trip details
  const { data, error } = await supabase
    .from('wagon_trajectories')
    .select(`
      *,
      tracks!wagon_trajectories_track_id_fkey(id, name, node_id),
      previous_track:tracks!wagon_trajectories_previous_track_id_fkey(id, name, node_id),
      trips(id, type, transport_plan_number, datetime)
    `)
    .eq('wagon_id', wagonId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching wagon trajectory:', error);
    throw new Error(`Failed to load trajectory data: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Check for duplicate records - specifically filter out 'initial' records
  // when there's already a 'delivery' record for the same location
  
  // Create a set of locations where we have delivery records
  const deliveryLocations = new Set<string>();
  
  // Track delivery records by trip_id for the case where they share the same trip
  const deliveryWithTripIds = new Set<string>();
  
  // First pass: identify all locations where we have delivery records
  data.forEach(record => {
    if (record.move_type === 'delivery') {
      // Track by location (track_id)
      if (record.track_id) {
        deliveryLocations.add(record.track_id);
      }
      
      // Also track by trip_id if available
      if (record.trip_id) {
        deliveryWithTripIds.add(record.trip_id);
      }
    }
  });

  // Filter out redundant 'initial' records
  const filteredData = data.filter(record => {
    // Keep the record if it's not an 'initial' record
    if (record.move_type !== 'initial') {
      return true;
    }
    
    // For 'initial' records, filter them out if:
    // 1. There's a 'delivery' record with the same trip_id
    if (record.trip_id && deliveryWithTripIds.has(record.trip_id)) {
      return false;
    }
    
    // 2. Or if there's a 'delivery' record for the same location (track_id)
    if (record.track_id && deliveryLocations.has(record.track_id)) {
      return false;
    }
    
    // Keep all other 'initial' records
    return true;
  });

  // Get all node IDs to fetch node names
  const nodeIds = new Set<string>();
  filteredData.forEach(record => {
    if (record.tracks && record.tracks.node_id) {
      nodeIds.add(record.tracks.node_id);
    }
    if (record.previous_track && record.previous_track.node_id) {
      nodeIds.add(record.previous_track.node_id);
    }
  });

  // Fetch all node names in one go
  const { data: nodesData, error: nodesError } = await supabase
    .from('nodes')
    .select('id, name')
    .in('id', Array.from(nodeIds));

  if (nodesError) {
    console.error('Error fetching node names:', nodesError);
  }

  // Create a lookup map for node names
  const nodeNames: Record<string, string> = {};
  if (nodesData) {
    nodesData.forEach(node => {
      nodeNames[node.id] = node.name;
    });
  }

  // Format the trajectory data
  const formattedTrajectories: FormattedTrajectory[] = filteredData.map((record, index) => {
    const nextRecord = filteredData[index + 1]; // the next record is the previous movement in time

    // Calculate duration at the location
    let durationAtLocation = '';
    if (nextRecord) {
      const currentTime = new Date(record.timestamp);
      const previousTime = new Date(nextRecord.timestamp);
      const durationMs = currentTime.getTime() - previousTime.getTime();
      
      // Format duration into days, hours, minutes
      const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) {
        durationAtLocation = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        durationAtLocation = `${hours}h ${minutes}m`;
      } else {
        durationAtLocation = `${minutes}m`;
      }
    } else {
      // For the earliest record, calculate duration to now
      const currentTime = new Date();
      const recordTime = new Date(record.timestamp);
      const durationMs = currentTime.getTime() - recordTime.getTime();
      
      const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) {
        durationAtLocation = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        durationAtLocation = `${hours}h ${minutes}m`;
      } else {
        durationAtLocation = `${minutes}m`;
      }
    }

    // Format date and time from the trajectory timestamp
    // Use trip datetime if available (instead of record creation time)
    const tripDatetime = record.trips && record.trips.datetime;
    const date = new Date(tripDatetime || record.timestamp);
    const formattedDate = date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const formattedTime = date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Get track and node names
    const track_name = record.tracks ? record.tracks.name : 'Unbekannt';
    const node_name = record.tracks && record.tracks.node_id ? 
      nodeNames[record.tracks.node_id] : 'Unbekannt';
    
    const previous_track_name = record.previous_track ? record.previous_track.name : undefined;
    const previous_node_name = record.previous_track && record.previous_track.node_id ? 
      nodeNames[record.previous_track.node_id] : undefined;

    // Get trip type and transport plan number
    const trip_type = record.trips ? record.trips.type : undefined;
    const transport_plan_number = record.trips ? record.trips.transport_plan_number : undefined;

    return {
      ...record,
      track_name,
      node_name,
      previous_track_name,
      previous_node_name,
      trip_type,
      transport_plan_number,
      formattedDate,
      formattedTime,
      durationAtLocation,
      moveTypeLabel: moveTypeLabels[record.move_type] || record.move_type
    };
  });

  return formattedTrajectories;
}

/**
 * Calculates statistics about a wagon's trajectory
 */
export function calculateTrajectoryStats(trajectories: FormattedTrajectory[]) {
  if (!trajectories || trajectories.length === 0) {
    return {
      totalMoves: 0,
      totalLocations: 0,
      averageDuration: 'N/A',
      mostFrequentLocation: 'N/A',
      firstSeen: 'N/A',
      lastMoved: 'N/A'
    };
  }

  // Count total moves
  const totalMoves = trajectories.length;
  
  // Count unique locations (node_id + track_id combinations)
  const uniqueLocations = new Set<string>();
  trajectories.forEach(t => {
    uniqueLocations.add(`${t.node_id}-${t.track_id}`);
  });
  const totalLocations = uniqueLocations.size;
  
  // Find most frequent location
  const locationCounts: Record<string, { count: number, name: string }> = {};
  trajectories.forEach(t => {
    const locationKey = `${t.node_id}-${t.track_id}`;
    const locationName = `${t.node_name} / ${t.track_name}`;
    
    if (!locationCounts[locationKey]) {
      locationCounts[locationKey] = { count: 0, name: locationName };
    }
    locationCounts[locationKey].count++;
  });
  
  let mostFrequentLocation = 'N/A';
  let maxCount = 0;
  
  Object.entries(locationCounts).forEach(([key, data]) => {
    if (data.count > maxCount) {
      maxCount = data.count;
      mostFrequentLocation = data.name;
    }
  });
  
  // Calculate first seen and last moved
  const lastMoved = formatDateTime(trajectories[0].timestamp);
  const firstSeen = formatDateTime(trajectories[trajectories.length - 1].timestamp);
  
  // Calculate average duration at locations
  const totalDurationMs = trajectories.reduce((sum, t, index) => {
    if (index === trajectories.length - 1) return sum; // Skip the last (earliest) record
    
    const currentTime = new Date(t.timestamp);
    const previousTime = new Date(trajectories[index + 1].timestamp);
    const durationMs = currentTime.getTime() - previousTime.getTime();
    
    return sum + durationMs;
  }, 0);
  
  const avgDurationMs = totalMoves > 1 ? totalDurationMs / (totalMoves - 1) : 0;
  
  // Format average duration
  const avgDays = Math.floor(avgDurationMs / (1000 * 60 * 60 * 24));
  const avgHours = Math.floor((avgDurationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const avgMinutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  let averageDuration = 'N/A';
  if (avgDays > 0) {
    averageDuration = `${avgDays}d ${avgHours}h ${avgMinutes}m`;
  } else if (avgHours > 0) {
    averageDuration = `${avgHours}h ${avgMinutes}m`;
  } else {
    averageDuration = `${avgMinutes}m`;
  }
  
  return {
    totalMoves,
    totalLocations,
    averageDuration,
    mostFrequentLocation,
    firstSeen,
    lastMoved
  };
} 