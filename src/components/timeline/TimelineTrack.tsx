'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getEnhancedTrackOccupancy, TrackWithOccupancy, WagonOnTrack } from '@/lib/trackUtils';
import { supabase } from '@/lib/supabase';
import { Node } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/utils';
import { getTrackWagonsFromCurrentTrackId, getTrackWagonsAtTime } from '@/lib/trackUtils';
import { useWagonDragDrop } from '@/hooks/useWagonDragDrop';
import { useRouter } from 'next/navigation';

// Define a utility function to generate colors based on construction site ID
const getColorForConstructionSite = (siteId: string | undefined): string => {
  if (!siteId) return 'bg-blue-500 border-blue-600'; // Default color for wagons without construction site
  
  // Hash the siteId to generate a consistent color
  // This is a simple hash function that will produce a number between 0 and 360 for hue
  let hash = 0;
  for (let i = 0; i < siteId.length; i++) {
    hash = siteId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Predefined set of colors for better visual distinction
  const colors = [
    'bg-red-500 border-red-600',
    'bg-green-500 border-green-600',
    'bg-yellow-500 border-yellow-600',
    'bg-purple-500 border-purple-600',
    'bg-pink-500 border-pink-600',
    'bg-indigo-500 border-indigo-600',
    'bg-orange-500 border-orange-600',
    'bg-teal-500 border-teal-600',
  ];
  
  // Use the hash to select a color from the predefined set
  return colors[Math.abs(hash) % colors.length];
};

interface TimelineTrackProps {
  track: {
    id: string;
    name: string;
    useful_length: number;
  };
  nodeName: string;
  date: string; // ISO date string with time information
  onWagonSelect?: (wagonId: string) => void;
  onRefresh?: () => void;
  projectId: string;
  selectedDateTime?: Date;  // Add this new prop for the selected time
}

// Helper function to deduplicate wagons by ID
function deduplicateWagons(wagons: WagonOnTrack[]): WagonOnTrack[] {
  const uniqueWagons = new Map<string, WagonOnTrack>();
  wagons.forEach(wagon => {
    // Only keep the first occurrence of each wagon ID
    if (!uniqueWagons.has(wagon.id)) {
      uniqueWagons.set(wagon.id, wagon);
    }
  });
  return Array.from(uniqueWagons.values());
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({ 
  track, 
  nodeName, 
  date, 
  onWagonSelect,
  onRefresh,
  projectId,
  selectedDateTime,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackData, setTrackData] = useState<TrackWithOccupancy | null>(null);
  const [wagons, setWagons] = useState<WagonOnTrack[]>([]);
  const [constructionSites, setConstructionSites] = useState<{[key: string]: Node}>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const { toast } = useToast();
  const { moveWagons, isMoving } = useWagonDragDrop(projectId || '');
  const router = useRouter();

  // Calculate start and end dates for the current day
  const startDate = useMemo(() => {
    if (!date) return null;
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    return dateObj;
  }, [date]);

  const endDate = useMemo(() => {
    if (!date) return null;
    const dateObj = new Date(date);
    dateObj.setHours(23, 59, 59, 999);
    return dateObj;
  }, [date]);

  // Fetch construction sites to display their names in tooltips
  useEffect(() => {
    const fetchConstructionSites = async () => {
      try {
        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .eq('type', 'site');
        
        if (error) throw error;
        
        // Convert array to object for easier lookup
        const sitesObj: {[key: string]: Node} = {};
        (data || []).forEach(site => {
          sitesObj[site.id] = site;
        });
        
        setConstructionSites(sitesObj);
      } catch (err) {
        console.error('Error fetching construction sites:', err);
      }
    };
    
    fetchConstructionSites();
  }, []);

  // Fetch wagons for this track at the current time
  useEffect(() => {
    if (!track.id || !date) return;
    
    const fetchTrackData = async () => {
      try {
        setLoading(true);
        
        // Get the date in ISO format
        const targetTime = new Date(date).toISOString();
        
        console.log(`Fetching wagons for track ${track.id} at ${targetTime}`);
        
        // Use the new time-based function instead of current_track_id approach
        const trackData = await getTrackWagonsAtTime(track.id, targetTime);
        
        if (trackData.success) {
          setTrackData(trackData.trackData);
          setWagons(trackData.wagons);
          console.log(`Set ${trackData.wagons.length} wagons for track ${track.id} at time ${targetTime}`);
        } else {
          console.error("Error fetching track data:", trackData.errorMessage);
          setWagons([]);
        }
      } catch (error) {
        console.error(`Error loading wagons for track ${track.id}:`, error);
        setWagons([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTrackData();
  }, [track.id, date]);

  // Handle drag start event for wagons
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, wagon: WagonOnTrack) => {
    // Ensure we have the correct current track ID
    const currentTrackId = wagon.current_track_id || track.id;
    
    // Set the data to be transferred
    e.dataTransfer.setData('application/json', JSON.stringify({
      wagonId: wagon.id,
      sourceTrackId: currentTrackId,
      sourceNodeName: nodeName,
      date: date
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over event for track
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drag leave event for track
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Handle drop event for track
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    try {
      // Get data from the drag event
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { wagonId, sourceTrackId, date: dragDate } = data;
      
      console.log(`Handling drop of wagon ${wagonId} from track ${sourceTrackId} to track ${track.id}`);
      
      // Don't do anything if dropping on the same track
      if (sourceTrackId === track.id) {
        console.log(`Wagon is already on track ${track.id}, ignoring drop`);
        return;
      }
      
      setIsSubmitting(true);
      
      // Get the date part from the ISO string for restriction checking
      const selectedDateTime = new Date(date);
      
      // Use the current selected time for the actual trip time
      const tripDateTime = new Date(date);
      const tripDateTimeISO = tripDateTime.toISOString();
      
      // Check for restrictions at some key time points throughout the day
      const timeCheckPoints = [
        new Date(selectedDateTime),                    // Current selected time
        new Date(selectedDateTime.setHours(0, 1, 0, 0)), // Start of day
        new Date(selectedDateTime.setHours(8, 0, 0, 0)), // Morning
        new Date(selectedDateTime.setHours(12, 0, 0, 0)), // Noon
        new Date(selectedDateTime.setHours(17, 0, 0, 0)), // Evening
        new Date(selectedDateTime.setHours(23, 59, 0, 0))  // End of day
      ];
      
      // Check for restrictions at each time point throughout the day
      const { checkTripRestrictions } = await import('@/lib/trackUtils');
      
      console.log(`Checking restrictions for wagon movement from track ${sourceTrackId} to track ${track.id} on ${formatDateTime(date)}`);
      
      let hasRestrictions = false;
      let restrictionDetails = null;
      
      try {
        for (const checkTime of timeCheckPoints) {
          console.log(`Checking restrictions at time: ${checkTime.toLocaleTimeString()}`);
          const checkTimeISO = checkTime.toISOString();
          
          const restrictionsCheck = await checkTripRestrictions(
            'internal',
            checkTimeISO,
            sourceTrackId,
            track.id
          );
          
          if (restrictionsCheck.hasRestrictions) {
            console.log(`Found restrictions at time ${checkTime.toLocaleTimeString()}:`, restrictionsCheck);
            hasRestrictions = true;
            restrictionDetails = restrictionsCheck;
            break; // Exit early if we find any restrictions
          }
        }
      } catch (restrictionError: any) {
        console.error("Error checking restrictions:", restrictionError);
        toast({
          title: "Fehler",
          description: `Konnte Einschränkungen nicht prüfen: ${restrictionError.message || 'Unbekannter Fehler'}`,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      if (hasRestrictions && restrictionDetails) {
        // There are restrictions - do not allow the move
        const restrictionTypes = restrictionDetails.restrictions.map((r: any) => 
          r.restriction_type === 'no_entry' ? 'Einfahrt verboten' : 'Ausfahrt verboten'
        );
        
        // Format the restriction information for better user feedback
        const restrictionInfo = restrictionDetails.restrictions.map((r: any) => {
          let timeInfo = '';
          if (r.start_datetime && r.end_datetime) {
            const start = new Date(r.start_datetime);
            const end = new Date(r.end_datetime);
            
            if (r.repetition_pattern === 'once') {
              timeInfo = `${start.toLocaleDateString()} bis ${end.toLocaleDateString()}`;
            } else {
              timeInfo = `${start.toLocaleTimeString()} bis ${end.toLocaleTimeString()} (${r.repetition_pattern})`;
            }
          }
          
          return `${r.restriction_type === 'no_entry' ? 'Einfahrt verboten' : 'Ausfahrt verboten'} (${timeInfo})`;
        }).join('\n');
        
        toast({
          title: "Bewegung nicht möglich",
          description: `Diese Waggonbewegung kann wegen aktiver Einschränkungen nicht durchgeführt werden:\n${restrictionInfo}`,
          variant: "destructive"
        });
        
        setIsSubmitting(false);
        return;
      }
      
      // No restrictions, confirm the move
      const confirmMove = window.confirm(`Möchten Sie den Waggon von "${data.sourceNodeName}" nach "${nodeName}" verschieben?`);
      if (!confirmMove) {
        console.log("User cancelled the move");
        setIsSubmitting(false);
        return;
      }
      
      // Check if this wagon is already in a trip within the same hour
      try {
        console.log(`Checking for existing trips in the time window around ${tripDateTime.toISOString()}`);
        
        const tripHour = new Date(date);
        const hourStart = new Date(tripHour);
        hourStart.setMinutes(0, 0, 0);
        const hourEnd = new Date(tripHour);
        hourEnd.setMinutes(59, 59, 999);
        
        const { data: existingTrips, error: tripCheckError } = await supabase
          .from('trip_wagons')
          .select(`
            trip_id,
            trips!inner(id, datetime, source_track_id, dest_track_id, type)
          `)
          .eq('wagon_id', wagonId)
          .gte('trips.datetime', hourStart.toISOString())
          .lte('trips.datetime', hourEnd.toISOString());
        
        if (tripCheckError) {
          throw new Error(`Error checking existing trips: ${tripCheckError.message}`);
        }
        
        // If the wagon is already in a trip in this hour, don't allow another move
        if (existingTrips && existingTrips.length > 0) {
          console.log(`Wagon ${wagonId} already has trips in this time window:`, existingTrips);
          toast({
            title: "Waggon bereits in Bewegung",
            description: "Dieser Waggon wird in dieser Stunde bereits bewegt und kann nicht erneut verschoben werden.",
            variant: "destructive"
          });
          setIsSubmitting(false);
          return;
        }
      } catch (tripsCheckError: any) {
        console.error("Error checking existing trips:", tripsCheckError);
        toast({
          title: "Fehler",
          description: `Konnte nicht prüfen, ob der Waggon bereits in Bewegung ist: ${tripsCheckError.message || 'Unbekannter Fehler'}`,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Verify the wagon exists and is on the expected track
      try {
        console.log(`Verifying wagon ${wagonId} location`);
        
        const { data: wagonCheck, error: wagonCheckError } = await supabase
          .from('wagons')
          .select('current_track_id')
          .eq('id', wagonId)
          .single();
        
        if (wagonCheckError) {
          throw new Error(`Error checking wagon location: ${wagonCheckError.message}`);
        }
        
        // Accept either the source track from the drag event or null if the wagon is not yet assigned to a track
        const actualTrackId = wagonCheck?.current_track_id;
        if (actualTrackId !== sourceTrackId && actualTrackId !== null) {
          console.error(`Waggon location mismatch: expected track ${sourceTrackId}, but found ${actualTrackId}`);
          toast({
            title: "Waggon nicht gefunden",
            description: `Der Waggon befindet sich möglicherweise nicht mehr auf dem angegebenen Gleis. Bitte aktualisieren Sie die Seite.`,
            variant: "destructive"
          });
          setIsSubmitting(false);
          return;
        }
      } catch (locationCheckError: any) {
        console.error("Error verifying wagon location:", locationCheckError);
        toast({
          title: "Fehler",
          description: `Konnte die aktuelle Position des Waggons nicht prüfen: ${locationCheckError.message || 'Unbekannter Fehler'}`,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // All checks passed, execute the move
      console.log(`All checks passed. Moving wagon ${wagonId} from track ${sourceTrackId} to ${track.id}`);
      
      // Handle the move using the wagon drag drop hook
      try {
        const tripId = await moveWagons(
          sourceTrackId,
          track.id,
          [wagonId],
          tripDateTimeISO,
          undefined, // No existing trip ID
          false // Not planned, execute immediately
        );
        
        if (!tripId) {
          throw new Error("Failed to create trip - no trip ID returned");
        }
        
        console.log(`Successfully created trip ${tripId} for wagon ${wagonId}`);
        
        // Refresh data
        if (onRefresh) {
          onRefresh();
        } else {
          // Fallback to just refreshing this track
          router.refresh();
        }
      } catch (moveError: any) {
        console.error("Error during wagon movement:", moveError);
        toast({
          title: "Fehler beim Verschieben des Waggons",
          description: moveError.message || "Ein unerwarteter Fehler ist aufgetreten",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("Unexpected error handling drop:", error);
      toast({
        title: "Fehler",
        description: `Ein unerwarteter Fehler ist aufgetreten: ${error.message || 'Unbekannter Fehler'}`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate position for current time indicator
  const currentTimePosition = useMemo(() => {
    if (!selectedDateTime || !startDate || !endDate) return 0;
    
    const totalMs = endDate.getTime() - startDate.getTime();
    const elapsedMs = selectedDateTime.getTime() - startDate.getTime();
    
    return (elapsedMs / totalMs) * 100;
  }, [selectedDateTime, startDate, endDate]);

  if (loading) {
    return (
      <div className="h-16 bg-gray-50 animate-pulse rounded">
        <div className="h-full flex items-center justify-center">
          <p className="text-gray-400">Loading track data...</p>
        </div>
      </div>
    );
  }

  if (error || !trackData) {
    return (
      <div className="h-16 bg-red-50 rounded">
        <div className="h-full flex items-center justify-center">
          <p className="text-red-500 text-sm">{error || 'Failed to load track data'}</p>
        </div>
      </div>
    );
  }

  const { 
    name: trackName, 
    useful_length: totalLength, 
    occupiedLength,
    availableLength,
    usagePercentage, 
    wagonCount
  } = trackData;

  return (
    <div 
      className={`relative mb-6 ${
        isDragOver ? 'border-primary border-2' : 'border-gray-200'
      } ${isSubmitting ? 'opacity-50 cursor-wait' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-medium">
            {nodeName && <span className="text-gray-500">{nodeName} / </span>}
            {trackData?.name || track.name}
          </h3>
        </div>
        <div className="text-sm text-gray-600">
          {trackData?.occupiedLength || 0}m / {trackData?.useful_length || track.useful_length}m ({Math.round(trackData?.usagePercentage || 0)}%)
        </div>
      </div>

      {/* Track capacity visualization */}
      <div className="relative h-16 bg-gray-100 rounded-md overflow-hidden shadow-sm">
        {/* Occupied area */}
        <div 
          className="absolute top-0 h-full bg-blue-200" 
          style={{ width: `${trackData?.usagePercentage || 0}%` }}
        ></div>
        
        {/* Wagons on track */}
        <div className="relative h-10 mt-2 w-full">
          {(() => {
            // Final wagons deduplication check just before rendering
            const uniqueWagons = new Map();
            wagons.forEach(wagon => {
              if (!wagon.id) return; // Skip wagons without ID
              uniqueWagons.set(wagon.id, wagon);
            });
            
            const finalWagons = Array.from(uniqueWagons.values());
            if (finalWagons.length < wagons.length) {
              console.log(`Final deduplication removed ${wagons.length - finalWagons.length} duplicate wagons before rendering`);
            }
            
            // Now render only the unique wagons
            return finalWagons
              .sort((a, b) => (a.position || 0) - (b.position || 0))
              .map(wagon => {
                // Calculate position and width based on track dimensions
                const wagonLength = wagon.length || 0;
                const trackTotalLength = totalLength || 1;
                const wagonLeft = (wagon.position || 0) / trackTotalLength * 100;
                const wagonWidth = wagonLength / trackTotalLength * 100;
                
                // Get color based on construction site or project
                const constructionSiteId = (wagon as any).construction_site_id;
                const constructionSiteName = constructionSites[constructionSiteId]?.name;
                const wagonColor = getColorForConstructionSite(constructionSiteId);
                
                const wagonData = wagon as any;
                const wagonTypeName = wagonData.wagon_types?.name || wagonData.custom_type || '';
                
                // Get last 4 digits of ID (from number or temp_id)
                const displayId = wagon.number ? 
                  wagon.number.slice(-4) : 
                  (wagon.temp_id ? wagon.temp_id.slice(-4) : wagon.id.slice(-4));
                
                // Create readable tooltip with better formatting
                const tooltipContent = `
Typ: ${wagonTypeName}
ID: ${wagon.number || wagon.temp_id || wagon.id}
Länge: ${wagon.length}m
${constructionSiteName ? `Baustelle: ${constructionSiteName}` : ''}
`.trim();
                
                return (
                  <div
                    key={wagon.id}
                    className={`absolute top-0 h-full ${wagonColor} border-r flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80`}
                    style={{ 
                      left: `${wagonLeft}%`, 
                      width: `${wagonWidth}%`,
                      minWidth: wagonWidth < 1 ? '20px' : '25px' // Adjust minimum size based on relative width
                    }}
                    title={tooltipContent}
                    onClick={() => onWagonSelect && onWagonSelect(wagon.id)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, wagon)}
                  >
                    <div className="flex flex-col items-center justify-center h-full w-full px-0.5">
                      {/* For larger wagons, show type and construction site */}
                      {wagonWidth > 6 && (
                        <span className={`text-white text-center leading-tight font-medium ${wagonWidth <= 12 ? 'text-[9px]' : 'text-xs'}`}>
                          {wagonTypeName}{constructionSiteName ? ` - ${constructionSiteName.substring(0, 6)}${constructionSiteName.length > 6 ? '...' : ''}` : ''}
                        </span>
                      )}
                      
                      {/* For medium wagons, show simplified info */}
                      {wagonWidth <= 6 && wagonWidth > 3 && (
                        <span className="text-white text-center leading-none text-[8px]">
                          {wagonTypeName ? wagonTypeName.substring(0, 4) : ''}
                        </span>
                      )}
                      
                      {/* Always show the ID */}
                      <span className={`text-white text-center font-bold ${
                        wagonWidth <= 3 ? 'text-[7px] leading-none' : 
                        wagonWidth <= 6 ? 'text-[8px] leading-none' : 
                        wagonWidth <= 10 ? 'text-[10px]' : 'text-sm'
                      }`}>
                        {displayId}
                      </span>
                    </div>
                  </div>
                );
              });
          })()}
        </div>
      </div>

      {/* Additional information */}
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <div>
          {wagonCount} Waggon{wagonCount !== 1 ? 's' : ''}
        </div>
        <div>
          {availableLength}m verfügbar
        </div>
      </div>
    </div>
  );
};

export default TimelineTrack;