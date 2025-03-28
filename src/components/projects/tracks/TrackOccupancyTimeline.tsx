import { useState, useEffect } from 'react';
import { Track, Node } from '@/lib/supabase';
import { getWagonLocationsForTimeline } from '@/lib/trackUtils';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';

interface TrackOccupancyTimelineProps {
  projectId: string;
  tracks?: Track[];
  nodes?: Node[];
}

interface TimelineWagon {
  id: string;
  wagonId: string;
  trackId: string;
  trackName: string;
  nodeName: string;
  arrivalTime: string;
  departureTime: string | null;
  wagonNumber: string;
  wagonType: string;
  content: string;
  projectName: string;
  projectColor: string;
}

const TrackOccupancyTimeline: React.FC<TrackOccupancyTimelineProps> = ({
  projectId,
  tracks = [],
  nodes = []
}) => {
  const { supabase } = useSupabase();
  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return subDays(now, 3);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return addDays(now, 7);
  });
  const [wagonLocations, setWagonLocations] = useState<TimelineWagon[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load wagon locations for the selected time period
  useEffect(() => {
    const fetchWagonLocations = async () => {
      setLoading(true);
      try {
        // Format dates for the API
        const startTimeStr = startDate.toISOString();
        const endTimeStr = endDate.toISOString();
        
        // Filter by selected nodes, or use all nodes if none selected
        const nodeIdsToUse = selectedNodeIds.length > 0 
          ? selectedNodeIds 
          : nodes.map(node => node.id);
        
        const locationData = await getWagonLocationsForTimeline(
          startTimeStr, 
          endTimeStr,
          nodeIdsToUse
        );
        
        // Transform data for the timeline
        const timelineData: TimelineWagon[] = locationData.map((location: any) => ({
          id: location.id,
          wagonId: location.wagon_id,
          trackId: location.track_id,
          trackName: location.tracks?.name || 'Unknown Track',
          nodeName: location.tracks?.nodes?.name || 'Unknown Node',
          arrivalTime: location.arrival_time,
          departureTime: location.departure_time,
          wagonNumber: location.wagons?.number || 'N/A',
          wagonType: location.wagons?.wagon_types?.name || 'Unknown Type',
          content: location.wagons?.content || '',
          projectName: location.wagons?.projects?.name || 'Unknown Project',
          projectColor: location.wagons?.projects?.color || '#888888'
        }));
        
        setWagonLocations(timelineData);
      } catch (error) {
        console.error('Error fetching wagon locations:', error);
        toast({
          title: 'Fehler',
          description: 'Die Gleisbelegungsdaten konnten nicht geladen werden.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchWagonLocations();
  }, [startDate, endDate, selectedNodeIds, nodes, supabase]);

  // Handle date range changes
  const handleDateRangeChange = (days: number) => {
    setStartDate(prevStart => subDays(prevStart, days));
    setEndDate(prevEnd => addDays(prevEnd, days));
  };

  // Toggle node selection
  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds(prev => {
      if (prev.includes(nodeId)) {
        return prev.filter(id => id !== nodeId);
      } else {
        return [...prev, nodeId];
      }
    });
  };

  // Calculate timeline grid based on dates
  const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Group wagons by track
  const wagonsByTrack = wagonLocations.reduce((acc: Record<string, TimelineWagon[]>, wagon) => {
    if (!acc[wagon.trackId]) {
      acc[wagon.trackId] = [];
    }
    acc[wagon.trackId].push(wagon);
    return acc;
  }, {});

  // Calculate position and width for a wagon bar on the timeline
  const calculateTimelinePosition = (startTime: string, endTime: string | null) => {
    const start = Math.max(parseISO(startTime).getTime(), startDate.getTime());
    const end = endTime 
      ? Math.min(parseISO(endTime).getTime(), endDate.getTime())
      : endDate.getTime();
    
    const totalTimeRange = endDate.getTime() - startDate.getTime();
    const startPercentage = ((start - startDate.getTime()) / totalTimeRange) * 100;
    const widthPercentage = ((end - start) / totalTimeRange) * 100;
    
    return {
      left: `${startPercentage}%`,
      width: `${widthPercentage}%`
    };
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Gleisbelegung Zeitlinie</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => handleDateRangeChange(2)}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            Erweitern
          </button>
          <button 
            onClick={() => handleDateRangeChange(-2)}
            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            Verkleinern
          </button>
        </div>
      </div>
      
      <div className="flex space-x-4 text-sm">
        <div>
          <span className="font-medium">Von:</span> {format(startDate, 'dd.MM.yyyy', { locale: de })}
        </div>
        <div>
          <span className="font-medium">Bis:</span> {format(endDate, 'dd.MM.yyyy', { locale: de })}
        </div>
      </div>
      
      {/* Node filter */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="font-medium mr-2">Knoten:</span>
        {nodes.map(node => (
          <button
            key={node.id}
            onClick={() => toggleNodeSelection(node.id)}
            className={`px-2 py-1 rounded text-xs ${
              selectedNodeIds.includes(node.id) || selectedNodeIds.length === 0
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {node.name}
          </button>
        ))}
      </div>
      
      {loading ? (
        <div className="py-8 text-center">
          <span className="animate-pulse">Lade Daten...</span>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          {/* Timeline header with dates */}
          <div className="flex border-b mb-2">
            <div className="w-40 shrink-0 font-medium">Gleis</div>
            <div className="grow relative h-8">
              {Array.from({ length: daysInRange + 1 }).map((_, index) => {
                const date = addDays(startDate, index);
                const position = (index / daysInRange) * 100;
                return (
                  <div 
                    key={index}
                    className="absolute top-0 text-xs transform -translate-x-1/2"
                    style={{ left: `${position}%` }}
                  >
                    {format(date, 'dd.MM', { locale: de })}
                    <div className="h-2 border-l border-gray-300 mx-auto mt-1"></div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Timeline rows for each track */}
          <div className="space-y-1">
            {tracks
              .filter(track => {
                // Show tracks from selected nodes or all if none selected
                return selectedNodeIds.length === 0 || 
                  selectedNodeIds.includes(track.node_id);
              })
              .map(track => {
                const node = nodes.find(n => n.id === track.node_id);
                return (
                  <div key={track.id} className="flex group hover:bg-gray-50">
                    <div className="w-40 shrink-0 py-1 text-sm truncate" title={`${node?.name} - ${track.name}`}>
                      {node?.name} - {track.name}
                    </div>
                    <div className="grow relative h-8 border-l border-gray-200">
                      {/* Day markers */}
                      {Array.from({ length: daysInRange }).map((_, index) => (
                        <div 
                          key={index}
                          className="absolute top-0 h-full border-l border-gray-100"
                          style={{ left: `${(index / daysInRange) * 100}%` }}
                        ></div>
                      ))}
                      
                      {/* Wagon occupancy bars */}
                      {wagonsByTrack[track.id]?.map(wagon => {
                        const position = calculateTimelinePosition(
                          wagon.arrivalTime, 
                          wagon.departureTime
                        );
                        
                        return (
                          <div
                            key={wagon.id}
                            className="absolute top-1 h-6 rounded text-xs text-white overflow-hidden whitespace-nowrap px-1 flex items-center"
                            style={{
                              ...position,
                              backgroundColor: wagon.projectColor,
                              opacity: 0.9
                            }}
                            title={`${wagon.wagonType} ${wagon.wagonNumber}: ${wagon.content || 'Kein Inhalt'}`}
                          >
                            {position.width !== '0%' && (
                              <span className="truncate">
                                {wagon.wagonType} {wagon.wagonNumber}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          
          {tracks.length === 0 && (
            <div className="py-4 text-center text-gray-500">
              Keine Gleise verfügbar.
            </div>
          )}
          
          {tracks.length > 0 && wagonLocations.length === 0 && (
            <div className="py-4 text-center text-gray-500">
              Keine Gleisbelegungsdaten im ausgewählten Zeitraum.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackOccupancyTimeline; 