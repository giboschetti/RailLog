'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { createInternalTrip } from '@/lib/tripCreation';

export function useWagonDragDrop(projectId: string) {
  const { toast } = useToast();
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  
  /**
   * Move wagon(s) from one track to another by creating an internal trip
   */
  const moveWagons = async (
    sourceTrackId: string, 
    destTrackId: string, 
    wagonIds: string[],
    tripDateTime: string
  ) => {
    if (isMoving) return;
    
    try {
      setIsMoving(true);
      
      // Create the internal trip
      const result = await createInternalTrip({
        projectId,
        sourceTrackId,
        destTrackId,
        wagonIds,
        tripDateTime,
        isPlanned: true // By default, create as planned trip
      });
      
      if (result.success) {
        toast({
          title: 'Trip Created',
          description: `Successfully created internal trip for ${wagonIds.length} wagon(s)`,
          variant: 'default',
        });
        
        // Refresh data by reloading the page
        router.refresh();
        
        // Return the trip ID
        return result.tripId;
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create internal trip',
          variant: 'destructive',
        });
        
        return null;
      }
    } catch (error: any) {
      console.error('Error moving wagons:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to move wagons',
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