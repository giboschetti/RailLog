import { useState, useEffect } from 'react';
import { Track, Node } from '@/lib/supabase';
import { getWagonLocationsForTimeline } from '@/lib/trackUtils';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';

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
  // Set default date to today
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
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

  // Generate a datetime string from selected date and time
  const getSelectedDateTimeISO = () => {
    if (!selectedDate) return new Date().toISOString();
    
    const date = new Date(selectedDate);
    if (selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      date.setHours(hours || 0, minutes || 0, 0, 0);
    }
    return date.toISOString();
  };

  // Load wagon locations for the selected time point
  useEffect(() => {
    const fetchWagonLocations = async () => {
      setLoading(true);
      try {
        // Get the selected datetime in ISO format
        const datetimeISO = getSelectedDateTimeISO();
        
        // Filter by selected nodes, or use all nodes if none selected
        const nodeIdsToUse = selectedNodeIds.length > 0 
          ? selectedNodeIds 
          : nodes.map(node => node.id);
        
        const locationData = await getWagonLocationsForTimeline(
          datetimeISO, 
          datetimeISO,
          nodeIdsToUse
        );
        
        // Transform data for the timeline
        const timelineData: TimelineWagon[] = locationData.map((location: any) => ({
          id: location.id,
          wagonId: location.wagon_id,
          trackId: location.track_id,
          trackName: location.trackName || location.tracks?.name || 'Unknown Track',
          nodeName: location.nodeName || location.tracks?.nodes?.name || 'Unknown Node',
          arrivalTime: location.arrivalTime || location.arrival_time,
          departureTime: location.departureTime || location.departure_time,
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
  }, [selectedDate, selectedTime, selectedNodeIds, nodes, supabase]);

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

  // Group wagons by track
  const wagonsByTrack = wagonLocations.reduce((acc: Record<string, TimelineWagon[]>, wagon) => {
    if (!acc[wagon.trackId]) {
      acc[wagon.trackId] = [];
    }
    acc[wagon.trackId].push(wagon);
    return acc;
  }, {});

  // Format the selected datetime for display
  const formattedDateTime = selectedDate ? 
    `${format(selectedDate, 'dd.MM.yyyy', { locale: de })} ${selectedTime}` : 
    'Jetzt';

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Gleisbelegung zu einem bestimmten Zeitpunkt</h2>
      </div>
      
      {/* Date and time selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Datum:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[200px] justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'PPP', { locale: de }) : <span>Datum wählen</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Uhrzeit:</span>
          <Input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-[120px]"
          />
        </div>
        
        <Button 
          variant="outline"
          onClick={() => {
            setSelectedDate(new Date());
            const now = new Date();
            setSelectedTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
          }}
        >
          Jetzt
        </Button>
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
      
      <div className="text-center text-sm font-medium py-2">
        Gleisbelegung am {formattedDateTime} Uhr
      </div>
      
      {loading ? (
        <div className="py-8 text-center">
          <span className="animate-pulse">Lade Daten...</span>
        </div>
      ) : (
        <div className="relative">
          {/* Track list with wagons */}
          <div className="space-y-1">
            {tracks
              .filter(track => {
                // Show tracks from selected nodes or all if none selected
                return selectedNodeIds.length === 0 || 
                  selectedNodeIds.includes(track.node_id);
              })
              .map(track => {
                const node = nodes.find(n => n.id === track.node_id);
                const trackWagons = wagonsByTrack[track.id] || [];
                
                return (
                  <div key={track.id} className="flex group hover:bg-gray-50 border-b pb-2">
                    <div className="w-40 shrink-0 py-1 text-sm truncate" title={`${node?.name} - ${track.name}`}>
                      {node?.name} - {track.name}
                    </div>
                    <div className="grow">
                      {trackWagons.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {trackWagons.map(wagon => (
                            <div
                              key={wagon.id}
                              className="px-2 py-1 text-xs text-white rounded"
                              style={{
                                backgroundColor: wagon.projectColor || '#888888',
                                opacity: 0.9
                              }}
                              title={`${wagon.wagonType} ${wagon.wagonNumber}: ${wagon.content || 'Kein Inhalt'}`}
                            >
                              {wagon.wagonType} {wagon.wagonNumber}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 py-1">Keine Waggons</div>
                      )}
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
              Keine Gleisbelegungsdaten am ausgewählten Zeitpunkt.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackOccupancyTimeline; 