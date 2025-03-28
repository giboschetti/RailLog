'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatDate } from '@/lib/utils';
import DailyRestrictions from './DailyRestrictions';

interface DailyTripsProps {
  date: string;
  onTripSelect?: (tripId: string) => void;
  projectId?: string;
}

interface WagonInfo {
  id: string;
  type_name: string;
  length: number;
}

interface TripWithWagons {
  id: string;
  type: string;
  datetime: string;
  source_track_id?: string;
  source_track_name?: string;
  source_node_name?: string;
  dest_track_id?: string;
  dest_track_name?: string;
  dest_node_name?: string;
  is_planned: boolean;
  wagons: WagonInfo[];
}

const DailyTrips: React.FC<DailyTripsProps> = ({ date, onTripSelect, projectId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripWithWagons[]>([]);

  useEffect(() => {
    const fetchDailyTrips = async () => {
      setLoading(true);
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Query for trips in the date range
        let query = supabase
          .from('trips')
          .select(`
            id, type, datetime, source_track_id, dest_track_id, is_planned,
            source_track:tracks!source_track_id(id, name, node_id, nodes!inner(id, name)),
            dest_track:tracks!dest_track_id(id, name, node_id, nodes!inner(id, name)),
            trip_wagons(
              wagon_id,
              wagons:wagons(
                id, length,
                wagon_types(name)
              )
            )
          `)
          .gte('datetime', startOfDay.toISOString())
          .lte('datetime', endOfDay.toISOString())
          .order('datetime', { ascending: true });

        // Filter by project if projectId provided
        if (projectId) {
          query = query.eq('project_id', projectId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Transform the data
        const formattedTrips: TripWithWagons[] = (data || []).map(trip => {
          // Extract wagon information
          const wagons: WagonInfo[] = trip.trip_wagons
            .filter(tw => tw.wagons) // Filter out any missing wagon references
            .map(tw => ({
              id: tw.wagons?.id || '',
              type_name: tw.wagons?.wagon_types?.name || 'Unknown Type',
              length: tw.wagons?.length || 0
            }));

          // Get track names
          let sourceTrackName = null;
          let sourceNodeName = null;
          if (trip.source_track) {
            sourceTrackName = trip.source_track.name;
            if (trip.source_track.nodes) {
              sourceNodeName = trip.source_track.nodes.name;
            }
          }

          let destTrackName = null;
          let destNodeName = null;
          if (trip.dest_track) {
            destTrackName = trip.dest_track.name;
            if (trip.dest_track.nodes) {
              destNodeName = trip.dest_track.nodes.name;
            }
          }

          return {
            id: trip.id,
            type: trip.type,
            datetime: trip.datetime,
            source_track_id: trip.source_track_id,
            source_track_name: sourceTrackName,
            source_node_name: sourceNodeName,
            dest_track_id: trip.dest_track_id,
            dest_track_name: destTrackName,
            dest_node_name: destNodeName,
            is_planned: trip.is_planned,
            wagons
          };
        });

        setTrips(formattedTrips);
      } catch (error) {
        console.error('Error fetching trips:', error);
        setError('Fehler beim Laden der Fahrten.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDailyTrips();
  }, [date, projectId]);

  // Group wagons by type for display
  const getWagonTypeSummary = (wagons: WagonInfo[]) => {
    const typeCounts: { [key: string]: number } = {};
    
    wagons.forEach(wagon => {
      typeCounts[wagon.type_name] = (typeCounts[wagon.type_name] || 0) + 1;
    });
    
    return Object.entries(typeCounts)
      .map(([type, count]) => `${count}x ${type}`)
      .join(', ');
  };

  // Get trip type label
  const getTripTypeLabel = (type: string) => {
    switch (type) {
      case 'delivery': return 'Lieferung';
      case 'departure': return 'Abfahrt';
      case 'internal': return 'Interne Bewegung';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Fahrten am {formatDate(date)}</h2>
      
      {/* Add the DailyRestrictions component if projectId is available */}
      {projectId && (
        <div className="mb-4">
          <DailyRestrictions 
            projectId={projectId}
            date={date}
          />
        </div>
      )}
      
      {trips.length === 0 ? (
        <div className="bg-gray-50 rounded p-6 text-center">
          <p className="text-gray-500">Keine Fahrten für diesen Tag geplant.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trips.map(trip => (
            <div
              key={trip.id}
              className={`p-4 rounded-lg shadow-sm border ${
                trip.is_planned ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
              } hover:shadow-md cursor-pointer transition-shadow`}
              onClick={() => onTripSelect && onTripSelect(trip.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold">{getTripTypeLabel(trip.type)}</span>
                  <span className="ml-2 text-gray-600">
                    {formatDateTime(trip.datetime)}
                  </span>
                </div>
                <div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    trip.is_planned 
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {trip.is_planned ? 'Geplant' : 'Ausgeführt'}
                  </span>
                </div>
              </div>
              
              <div className="text-sm mb-2">
                {trip.type !== 'delivery' && trip.source_track_name && (
                  <div>
                    Von: {trip.type === 'internal' && trip.source_node_name ? (
                      <span>{trip.source_node_name}, Gleis {trip.source_track_name}</span>
                    ) : (
                      trip.source_track_name
                    )}
                  </div>
                )}
                {trip.type !== 'departure' && trip.dest_track_name && (
                  <div>
                    Nach: {trip.type === 'internal' && trip.dest_node_name ? (
                      <span>{trip.dest_node_name}, Gleis {trip.dest_track_name}</span>
                    ) : (
                      trip.dest_track_name
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-2 text-sm">
                <div className="font-medium">Waggons:</div>
                <div className="text-gray-600">{getWagonTypeSummary(trip.wagons)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Gesamt: {trip.wagons.length} Waggons, {
                    trip.wagons.reduce((sum, w) => sum + w.length, 0)
                  }m Gesamtlänge
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyTrips; 