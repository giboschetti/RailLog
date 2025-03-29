'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function useWagonDragDrop(projectId: string) {
  const { toast } = useToast();
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  
  /**
   * Move wagon(s) from one track to another by creating an internal trip
   * Uses createInternalTrip RPC function to bypass RLS
   * The database trigger will handle wagon_trajectories creation
   */
  const moveWagons = async (
    sourceTrackId: string, 
    destTrackId: string, 
    wagonIds: string[],
    tripDateTime: string,
    existingTripId?: string, // Optional existing trip ID for updates
    isPlanned?: boolean // Optional parameter to override default is_planned value
  ) => {
    if (isMoving) return;
    
    try {
      setIsMoving(true);
      
      // Create a UUID for the trip or use existing ID
      const tripId = existingTripId || uuidv4();
      
      console.log(`Moving ${wagonIds.length} wagons from track ${sourceTrackId} to ${destTrackId}`);
      console.log(`Trip ID: ${tripId}, Trip Time: ${tripDateTime}, Planned: ${isPlanned !== false}`);
      
      // Create trip data
      const tripData = {
        id: tripId,
        type: 'internal',
        datetime: tripDateTime,
        source_track_id: sourceTrackId,
        dest_track_id: destTrackId,
        project_id: projectId,
        is_planned: isPlanned !== false, // Use provided value or default to true
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_conflicts: false
      };
      
      // Use the RPC function to bypass RLS instead of direct inserts
      let successCount = 0;
      let errorMessages: string[] = [];
      
      for (const wagonId of wagonIds) {
        console.log(`Using RPC to move wagon ${wagonId} to track ${destTrackId}`);
        
        try {
          const { data, error } = await supabase.rpc('create_internal_trip_v2', {
            trip_data: tripData,
            wagon_id_param: wagonId
          });
          
          if (error) {
            console.error(`RPC error for wagon ${wagonId}:`, error);
            errorMessages.push(`${wagonId}: ${error.message}`);
            continue;
          }
          
          console.log(`Successfully moved wagon ${wagonId} to track ${destTrackId}`);
          successCount++;
        } catch (moveError: any) {
          console.error(`Exception while moving wagon ${wagonId}:`, moveError);
          errorMessages.push(`${wagonId}: ${moveError.message || 'Unknown error'}`);
        }
      }
      
      // Display appropriate message based on success count
      if (successCount === wagonIds.length) {
        toast({
          title: 'Bewegung erfolgreich',
          description: `Waggon erfolgreich verschoben`,
          variant: 'default',
        });
      } else if (successCount > 0) {
        toast({
          title: 'Teilweise erfolgreich',
          description: `${successCount} von ${wagonIds.length} Waggons verschoben`,
          variant: 'default',
        });
        
        // Log detailed error information for partial success
        console.warn('Some wagons could not be moved:', errorMessages.join(', '));
      } else {
        let errorDetails = 'Fehler beim Verschieben der Waggons';
        if (errorMessages.length > 0) {
          errorDetails += `: ${errorMessages[0]}`;
        }
        
        toast({
          title: 'Fehler',
          description: errorDetails,
          variant: 'destructive',
        });
        
        // Log comprehensive error information for complete failure
        console.error('All wagon movements failed:', errorMessages);
        return null;
      }
      
      // Force a delay before refreshing to ensure DB operations complete
      console.log('Waiting for DB operations to complete...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh data by reloading the page
      console.log('Refreshing UI...');
      router.refresh();
      
      // Return the trip ID
      return tripId;
    } catch (error: any) {
      console.error('Error moving wagons:', error);
      
      // Show a more detailed error message
      const errorMessage = error.message || 'Fehler beim Verschieben der Waggons';
      toast({
        title: 'Fehler',
        description: errorMessage,
        variant: 'destructive',
      });
      
      return null;
    } finally {
      setIsMoving(false);
    }
  };
  
  return {
    moveWagons,
    isMoving
  };
} 