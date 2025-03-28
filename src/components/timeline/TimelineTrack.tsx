'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getEnhancedTrackOccupancy, TrackWithOccupancy, WagonOnTrack } from '@/lib/trackUtils';
import { supabase } from '@/lib/supabase';
import { Node } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/utils';

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

  useEffect(() => {
    const fetchTrackOccupancy = async () => {
      setLoading(true);
      try {
        // The date parameter now contains the full datetime with hour precision
        // (The old version used end of day for all visualizations)
        const selectedDateTime = new Date(date).toISOString();
        
        console.log(`Fetching track occupancy for ${track.id} at specific time: ${selectedDateTime}`);
        const result = await getEnhancedTrackOccupancy(track.id, selectedDateTime);
        if (result.success && result.trackData) {
          setTrackData(result.trackData);
          setWagons(result.wagons);
          setError(null);
        } else {
          setError(result.errorMessage || 'Failed to load track data');
          setTrackData(null);
          setWagons([]);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred');
        setTrackData(null);
        setWagons([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrackOccupancy();
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
      
      // Don't do anything if dropping on the same track
      if (sourceTrackId === track.id) {
        return;
      }
      
      setIsSubmitting(true);
      
      // Get the date part from the ISO string for restriction checking
      const selectedDateTime = new Date(date);
      
      // Create times to check throughout the day
      const timeCheckPoints = [
        new Date(selectedDateTime),                    // Current selected time
        new Date(selectedDateTime.setHours(0, 1, 0, 0)), // Start of day
        new Date(selectedDateTime.setHours(8, 0, 0, 0)), // Morning
        new Date(selectedDateTime.setHours(12, 0, 0, 0)), // Noon
        new Date(selectedDateTime.setHours(17, 0, 0, 0)), // Evening
        new Date(selectedDateTime.setHours(23, 59, 0, 0))  // End of day
      ];
      
      // Use the current selected time for the actual trip time
      const tripDateTime = new Date(date);
      const tripDateTimeISO = tripDateTime.toISOString();
      
      // Check for restrictions at each time point throughout the day
      const { checkTripRestrictions } = await import('@/lib/trackUtils');
      
      console.log(`Checking restrictions for wagon movement from track ${sourceTrackId} to track ${track.id} on ${formatDateTime(date)}`);
      
      // Check restrictions for each time point
      let hasRestrictions = false;
      let restrictionDetails = null;
      
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
        setIsSubmitting(false);
        return;
      }
      
      // First check if this wagon is already in a trip today
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const { data: existingTrips, error: tripCheckError } = await supabase
        .from('trip_wagons')
        .select(`
          trip_id,
          trips!inner(id, datetime, source_track_id, dest_track_id, type)
        `)
        .eq('wagon_id', wagonId)
        .gte('trips.datetime', startOfDay.toISOString())
        .lte('trips.datetime', endOfDay.toISOString());
      
      if (tripCheckError) {
        console.error('Error checking existing trips:', tripCheckError);
        toast({
          title: "Fehler",
          description: "Konnte nicht prüfen, ob der Waggon bereits in Bewegung ist.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // If the wagon is already in a trip today, don't allow another move
      if (existingTrips && existingTrips.length > 0) {
        toast({
          title: "Waggon bereits in Bewegung",
          description: "Dieser Waggon wird heute bereits bewegt und kann nicht erneut verschoben werden.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Check if the wagon is currently on the source track (prevent duplicates)
      const { data: wagonCheck, error: wagonCheckError } = await supabase
        .from('wagons')
        .select('current_track_id')
        .eq('id', wagonId)
        .single();
      
      if (wagonCheckError) {
        console.error('Error checking wagon location:', wagonCheckError);
        toast({
          title: "Fehler",
          description: "Konnte die aktuelle Position des Waggons nicht prüfen.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Verify the wagon exists and check if it's actually on the source track
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
      
      // Create an internal trip
      const tripData = {
        id: crypto.randomUUID(),
        type: 'internal',
        datetime: tripDateTimeISO, // Use the selected timestamp
        source_track_id: sourceTrackId,
        dest_track_id: track.id,
        project_id: projectId,
        is_planned: false, // Mark as executed immediately
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_conflicts: false // No conflicts since we're enforcing restrictions
      };
      
      try {
        // Insert the trip
        const { error: tripError } = await supabase
          .from('trips')
          .insert(tripData);
          
        if (tripError) throw new Error(`Fehler beim Erstellen der Fahrt: ${tripError.message}`);
        
        // Associate the wagon with the trip
        const { error: wagonError } = await supabase
          .from('trip_wagons')
          .insert({
            trip_id: tripData.id,
            wagon_id: wagonId
          });
        
        if (wagonError) throw new Error(`Fehler beim Zuweisen des Waggons: ${wagonError.message}`);
        
        // Update wagon's current track
        const { error: updateError } = await supabase
          .from('wagons')
          .update({ current_track_id: track.id })
          .eq('id', wagonId);
        
        if (updateError) throw new Error(`Fehler beim Aktualisieren des Waggons: ${updateError.message}`);
      
        // Refresh data
        if (onRefresh) {
          onRefresh();
        } else {
          // Fallback to just refreshing this track
          const result = await getEnhancedTrackOccupancy(track.id, date);
          if (result.success && result.trackData) {
            setTrackData(result.trackData);
            setWagons(result.wagons);
          }
        }
        
        const successMessage = `Der Waggon wurde erfolgreich von "${data.sourceNodeName}" nach "${nodeName}" verschoben.`;
        
        toast({
          title: "Waggon verschoben",
          description: successMessage,
          variant: "default"
        });
      } catch (innerError: any) {
        console.error('Error in trip creation:', innerError);
        throw innerError;
      }
    } catch (error: any) {
      console.error('Error creating internal trip:', error);
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Verschieben des Waggons",
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
        
        {/* Individual wagons */}
        {wagons.map((wagon) => {
          const wagonWidth = totalLength ? (wagon.length || 0) / totalLength * 100 : 0;
          const wagonLeft = totalLength ? (wagon.position || 0) / totalLength * 100 : 0;
          
          // Get color based on construction site
          const wagonColor = getColorForConstructionSite(wagon.construction_site_id);
          
          // Get construction site name for tooltip
          let constructionSiteName = '';
          if (wagon.construction_site_id && constructionSites[wagon.construction_site_id]) {
            constructionSiteName = constructionSites[wagon.construction_site_id].name;
          }
          
          // Get wagon type name from type_id or custom_type
          // We use any type assertion since the wagon_types property might come from the DB query
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
        })}
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