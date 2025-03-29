'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getEnhancedTrackOccupancy, TrackWithOccupancy, WagonOnTrack } from '@/lib/trackUtils';
import { supabase } from '@/lib/supabase';
import { Node } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime, cn } from '@/lib/utils';
import { getTrackWagonsFromCurrentTrackId, getTrackWagonsAtTime } from '@/lib/trackUtils';
import { useWagonDragDrop } from '@/hooks/useWagonDragDrop';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  tracks?: Array<{ id: string; name: string }>;  // Add optional tracks prop for identifying track names
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
  tracks = [],
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
  const [showRestrictionDialog, setShowRestrictionDialog] = useState(false);
  const [restrictionDetails, setRestrictionDetails] = useState<{restrictions?: any[]} | null>(null);
  const [pendingWagonMove, setPendingWagonMove] = useState<any>(null);

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
        setError(null); // Clear any previous errors
        
        // Get the date in ISO format
        const targetTime = new Date(date).toISOString();
        
        console.log(`Fetching wagons for track ${track.id} at ${targetTime}`);
        
        // Use the simplified approach that directly queries wagons table
        const trackData = await getTrackWagonsAtTime(track.id, targetTime);
        
        if (trackData.success) {
          setTrackData(trackData.trackData);
          setWagons(trackData.wagons);
          console.log(`Set ${trackData.wagons.length} wagons for track ${track.id} at time ${targetTime}`);
        } else {
          console.error("Error fetching track data:", trackData.errorMessage);
          setError(trackData.errorMessage || "Failed to load track data");
          // Set default track data even if there was an error
          setTrackData({
            id: track.id,
            name: track.name,
            node_id: '', // Use empty string since track.node_id doesn't exist in the type
            useful_length: track.useful_length,
            occupiedLength: 0,
            availableLength: track.useful_length || 0,
            usagePercentage: 0,
            wagonCount: 0,
            created_at: '',
            updated_at: ''
          });
          setWagons([]);
        }
      } catch (error: any) {
        console.error(`Error loading wagons for track ${track.id}:`, error);
        setError(error.message || "Failed to load track data");
        // Set default track data even if there was an error
        setTrackData({
          id: track.id,
          name: track.name,
          node_id: '', // Use empty string since track.node_id doesn't exist in the type
          useful_length: track.useful_length,
          occupiedLength: 0,
          availableLength: track.useful_length || 0,
          usagePercentage: 0,
          wagonCount: 0,
          created_at: '',
          updated_at: ''
        });
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
      
      // Validation checks
      if (!wagonId || !sourceTrackId) {
        console.error('Invalid drag data:', data);
        toast({
          title: "Fehler",
          description: "Ungültige Daten für die Waggonbewegung",
          variant: "destructive"
        });
        return;
      }
      
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
      
      if (hasRestrictions && restrictionDetails && restrictionDetails.restrictions && restrictionDetails.restrictions.length > 0) {
        // Store the restriction details and pending wagon move
        setRestrictionDetails(restrictionDetails);
        setPendingWagonMove({
          sourceTrackId,
          destTrackId: track.id,
          wagonId,
          date,
          tripDateTime,
          tripDateTimeISO,
          sourceNodeName: data.sourceNodeName
        });
        setShowRestrictionDialog(true);
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

  // Add a cancelRestrictionDialog function for proper cleanup
  const cancelRestrictionDialog = () => {
    console.log('Cancelling restriction dialog');
    setShowRestrictionDialog(false);
    setPendingWagonMove(null);
    setIsSubmitting(false);
    setRestrictionDetails(null);
  };

  // New function to handle confirmed moves despite restrictions
  const handleConfirmRestrictedMove = async () => {
    if (!pendingWagonMove) {
      cancelRestrictionDialog();
      return;
    }
    
    const { sourceTrackId, destTrackId, wagonId, tripDateTimeISO, sourceNodeName } = pendingWagonMove;
    
    // Close the dialog right away to prevent UI freeze
    cancelRestrictionDialog();
    setIsSubmitting(true);
    
    try {
      // Check if this wagon is already in a trip within the same hour
      console.log(`Checking for existing trips in the time window around ${new Date(tripDateTimeISO).toISOString()}`);
      
      const tripHour = new Date(tripDateTimeISO);
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
        return;
      }
      
      // Verify the wagon exists and is on the expected track
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
        return;
      }
      
      // Execute the move using the wagon drag drop hook
      const tripId = await moveWagons(
        sourceTrackId,
        destTrackId,
        [wagonId],
        tripDateTimeISO,
        undefined, // No existing trip ID
        false // Not planned, execute immediately
      );
      
      if (!tripId) {
        throw new Error("Failed to create trip - no trip ID returned");
      }
      
      console.log(`Successfully created trip ${tripId} for wagon ${wagonId} despite restrictions`);
      
      // Refresh data
      if (onRefresh) {
        onRefresh();
      } else {
        // Fallback to just refreshing this track
        router.refresh();
      }
      
      // Show success message
      toast({
        title: "Waggon verschoben",
        description: `Der Waggon wurde trotz Einschränkungen von "${sourceNodeName}" nach "${nodeName}" verschoben.`,
        variant: "default"
      });
    } catch (moveError: any) {
      console.error("Error during wagon movement:", moveError);
      toast({
        title: "Fehler beim Verschieben des Waggons",
        description: moveError.message || "Ein unerwarteter Fehler ist aufgetreten",
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

  // Add a keyboard event handler for Escape key to close dialog
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showRestrictionDialog) {
        setShowRestrictionDialog(false);
        setPendingWagonMove(null);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showRestrictionDialog]);

  // Add a cleanup effect to reset dialog state on unmount
  useEffect(() => {
    // Force the dialog to be closed on initial mount
    setShowRestrictionDialog(false);
    setRestrictionDetails(null);
    setPendingWagonMove(null);
    
    // Clean up on unmount
    return () => {
      setShowRestrictionDialog(false);
      setRestrictionDetails(null);
      setPendingWagonMove(null);
    };
  }, []);

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
    <>
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

        {loading ? (
          <div className="flex items-center justify-center h-16 bg-gray-100 rounded-md">
            <span className="text-gray-500">Lade Daten...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-16 bg-red-50 rounded-md border border-red-200 p-2">
            <span className="text-red-600 text-sm">{error}</span>
            <button 
              className="text-xs text-blue-600 mt-1 hover:underline"
              onClick={() => {
                if (onRefresh) onRefresh();
              }}
            >
              Erneut versuchen
            </button>
          </div>
        ) : (
          <>
            {/* Track capacity visualization */}
            <div className="relative h-16 bg-gray-100 rounded-md overflow-hidden shadow-sm">
              {/* Occupied area visualization */}
              <div 
                className="absolute top-0 h-full bg-blue-200 flex items-center justify-end pr-2" 
                style={{ width: `${trackData?.usagePercentage || 0}%` }}
              >
                {trackData?.usagePercentage > 15 && (
                  <span className="text-xs text-blue-700 font-medium">
                    {Math.round(trackData?.usagePercentage || 0)}%
                  </span>
                )}
              </div>
              
              {/* Capacity ruler marks */}
              <div className="absolute top-0 w-full h-full pointer-events-none">
                <div className="absolute top-0 left-1/4 h-full border-l border-gray-300 border-dashed opacity-30"></div>
                <div className="absolute top-0 left-1/2 h-full border-l border-gray-300 border-dashed opacity-30"></div>
                <div className="absolute top-0 left-3/4 h-full border-l border-gray-300 border-dashed opacity-30"></div>
              </div>
              
              {/* Wagons on track */}
              <div className="relative h-full pt-2 pb-2 w-full">
                {(() => {
                  // Deduplicate wagons before rendering
                  const uniqueWagons = new Map();
                  wagons.forEach(wagon => {
                    if (!wagon.id) return; // Skip wagons without ID
                    uniqueWagons.set(wagon.id, wagon);
                  });
                  
                  const finalWagons = Array.from(uniqueWagons.values());
                  
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
                      
                      // Create readable tooltip
                      const tooltipContent = `
Typ: ${wagonTypeName}
ID: ${wagon.number || wagon.temp_id || wagon.id}
Länge: ${wagon.length}m
${constructionSiteName ? `Baustelle: ${constructionSiteName}` : ''}
`.trim();
                      
                      console.log(`Rendering wagon: ${wagon.id}, left: ${wagonLeft}%, width: ${wagonWidth}%, length: ${wagonLength}m`);
                      
                      return (
                        <div
                          key={wagon.id}
                          className={`absolute ${wagonColor} border border-1 rounded-md shadow-sm flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80`}
                          style={{ 
                            left: `${wagonLeft}%`, 
                            width: `${wagonWidth}%`,
                            minWidth: wagonWidth < 1 ? '20px' : '25px',
                            top: '3px',
                            height: 'calc(100% - 6px)',
                            zIndex: 10
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

            {/* Enhanced track occupancy information */}
            <div className="mt-2 grid grid-cols-3 text-xs">
              <div className="text-gray-500">
                {wagonCount} Waggon{wagonCount !== 1 ? 's' : ''}
              </div>
              <div className="text-center font-medium">
                <span className="text-blue-600">{occupiedLength}m</span>
                <span className="text-gray-400"> / </span>
                <span className="text-gray-600">{totalLength}m</span>
              </div>
              <div className="text-right text-green-600 font-medium">
                {availableLength}m verfügbar
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Add the restriction confirmation dialog */}
      {showRestrictionDialog && restrictionDetails && restrictionDetails.restrictions && restrictionDetails.restrictions.length > 0 && (
        <Dialog 
          open={showRestrictionDialog} 
          onOpenChange={(open) => {
            if (!open) {
              cancelRestrictionDialog();
            }
          }}
        >
          <DialogContent className="max-w-lg z-50">
            <DialogHeader>
              <DialogTitle className="text-red-600">Einschränkungen erkannt</DialogTitle>
            </DialogHeader>
            
            <div className="mt-4 space-y-4">
              <div className="space-y-3">
                <p className="text-red-600 font-medium">
                  Achtung! Es gibt aktive Einschränkungen für diese Waggonbewegung.
                </p>
                
                <div className="bg-red-50 border border-red-200 p-4 rounded-md space-y-3 max-h-60 overflow-y-auto">
                  {restrictionDetails?.restrictions?.map((r: any, index: number) => (
                    <div key={index} className={index > 0 ? "pt-2 border-t border-red-100" : ""}>
                      <div className="flex items-start">
                        <div className="bg-red-100 text-red-700 p-1 rounded-md mr-2">
                          {r.type === 'no_entry' ? 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 10a7 7 0 1114 0 7 7 0 01-14 0zm7-8a8 8 0 100 16 8 8 0 000-16zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                            </svg> : 
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          }
                        </div>
                        <div>
                          <p className="font-medium text-red-700">
                            {r.type === 'no_entry' ? 'Einfahrt verboten' : 'Ausfahrt verboten'}
                          </p>
                          {r.comment && (
                            <p className="text-sm mt-1">
                              <span className="font-medium">Grund:</span> {r.comment}
                            </p>
                          )}
                          {r.restriction_date && (
                            <p className="text-xs text-gray-600 mt-1">
                              <span className="font-medium">Gültig am:</span> {new Date(r.restriction_date).toLocaleDateString()}
                            </p>
                          )}
                          {r.affected_track_id && (
                            <p className="text-xs text-gray-600">
                              <span className="font-medium">Betroffenes Gleis:</span> {
                                (() => {
                                  const affectedTrack = tracks.find((t) => t.id === r.affected_track_id);
                                  return affectedTrack ? affectedTrack.name : r.affected_track_id;
                                })()
                              }
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {!restrictionDetails?.restrictions?.length && (
                    <p className="text-gray-500 italic">Keine Details verfügbar</p>
                  )}
                </div>
                
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-md">
                  <p className="text-sm text-amber-800 font-medium">
                    Waggonbewegung trotz Einschränkungen zulassen?
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Diese Waggonbewegung kann zu Planungskonflikten führen. Die Fahrt wird als "problematisch" markiert.
                  </p>
                </div>
              </div>
            </div>
            
            <DialogFooter className="gap-2 mt-2 flex flex-col sm:flex-row">
              <Button
                onClick={cancelRestrictionDialog}
                variant="outline"
                className="flex-1"
                disabled={isSubmitting}
              >
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  try {
                    handleConfirmRestrictedMove();
                  } catch (error) {
                    console.error("Error in restriction confirmation:", error);
                    cancelRestrictionDialog();
                    toast({
                      title: "Fehler",
                      description: "Die Bewegung konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.",
                      variant: "destructive"
                    });
                  }
                }}
                variant="destructive"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verarbeite...
                  </span>
                ) : (
                  "Trotz Einschränkungen verschieben"
                )}
              </Button>
            </DialogFooter>
            
            {/* Add emergency close button at top right */}
            <button 
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200"
              onClick={cancelRestrictionDialog}
              aria-label="Close dialog"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default TimelineTrack;