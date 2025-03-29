'use client';

import React, { useState } from 'react';
import { Track, Wagon } from '@/lib/supabase';
import { validateDragDrop } from '@/lib/trackUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { validateInternalTrip, InternalTripData } from '@/lib/tripValidation';
import ValidationWarnings from '../trips/ValidationWarnings';
import { useSupabase } from '@/components/providers/SupabaseProvider';

interface TrackDropZoneProps {
  track: Track;
  allTracks: Track[];
  projectId: string;
  tracks: Track[];
  wagons: Wagon[];
  onMove: (sourceTrackId: string, destTrackId: string, wagonIds: string[], tripDate: string) => Promise<void>;
}

export function TrackDropZone({ track, allTracks, projectId, tracks, wagons, onMove }: TrackDropZoneProps) {
  const { supabase } = useSupabase();
  const [isOver, setIsOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState<{
    sourceTrackId: string;
    wagonIds: string[];
    validationWarnings: any[];
  } | null>(null);
  const [tripDate, setTripDate] = useState<string>(new Date().toISOString().slice(0, 16));
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
    
    try {
      // Get the dragged wagon data
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { sourceTrackId, wagonId, length } = data;
      
      // Don't allow dropping on the same track
      if (sourceTrackId === track.id) {
        setValidationError('Cannot move wagon to the same track');
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      
      // Get the wagon and perform quick validation
      const selectedWagon = wagons.find(w => w.id === wagonId);
      
      if (selectedWagon) {
        // Format tracks for validation to ensure they match the expected type
        const formattedTracks = allTracks.map(t => ({
          id: t.id,
          useful_length: t.useful_length || 0,
          wagons: wagons.filter(w => w.current_track_id === t.id)
        }));
      
        const validationResult = validateDragDrop(
          sourceTrackId,
          track.id,
          [{ id: wagonId, length }],
          formattedTracks
        );
        
        if (!validationResult.isValid) {
          setValidationError(validationResult.errors[0].message);
          e.dataTransfer.dropEffect = 'none';
        } else {
          setValidationError(null);
          e.dataTransfer.dropEffect = 'move';
        }
      }
    } catch (error) {
      console.error('Error in drag over:', error);
      e.dataTransfer.dropEffect = 'none';
    }
  };
  
  const handleDragLeave = () => {
    setIsOver(false);
    setValidationError(null);
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    try {
      // Get the dragged wagon data
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { sourceTrackId, wagonId } = data;
      
      // Don't allow dropping on the same track
      if (sourceTrackId === track.id) {
        setValidationError('Cannot move wagon to the same track');
        return;
      }
      
      // Find the selected wagon
      const selectedWagon = wagons.find(w => w.id === wagonId);
      
      if (!selectedWagon) {
        setValidationError('Wagon not found');
        return;
      }
      
      // Create InternalTripData for validation
      const internalData: InternalTripData = {
        projectId,
        dateTime: tripDate,
        sourceTrackId,
        destTrackId: track.id,
        selectedWagons: [{ id: wagonId, length: selectedWagon.length }],
        isPlanned: true,
        tripId: undefined // No tripId for new trips, allows validation to skip current trip
      };
      
      // Perform full validation with database checks
      const validationResult = await validateInternalTrip(internalData);
      
      if (!validationResult.isValid) {
        setValidationError(validationResult.errors[0].message);
        return;
      }
      
      // If there are warnings, show confirmation dialog
      if (validationResult.warnings.length > 0) {
        setDialogData({
          sourceTrackId,
          wagonIds: [wagonId],
          validationWarnings: validationResult.warnings
        });
        setIsDialogOpen(true);
        return;
      }
      
      // No warnings, proceed with the move
      await onMove(sourceTrackId, track.id, [wagonId], tripDate);
    } catch (error: any) {
      console.error('Error dropping wagon:', error);
      setValidationError(error.message || 'Error moving wagon');
    }
  };
  
  const handleConfirmMove = async () => {
    if (!dialogData) return;
    
    try {
      await onMove(
        dialogData.sourceTrackId, 
        track.id, 
        dialogData.wagonIds, 
        tripDate
      );
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Error confirming move:', error);
      setValidationError(error.message || 'Error moving wagon after confirmation');
    }
  };
  
  return (
    <>
      <div
        className={`relative h-10 flex-1 rounded-md transition-colors duration-200 ${
          isOver 
            ? validationError 
              ? 'bg-red-200 border-2 border-red-500' 
              : 'bg-green-200 border-2 border-green-500'
            : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center text-xs">
            {validationError ? (
              <span className="text-red-800">{validationError}</span>
            ) : (
              <span className="text-green-800">Drop to move</span>
            )}
          </div>
        )}
      </div>
      
      {/* Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Internal Trip</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trip Date & Time
              </label>
              <input
                type="datetime-local"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            
            {dialogData?.validationWarnings && (
              <ValidationWarnings warnings={dialogData.validationWarnings} />
            )}
            
            <div className="flex justify-end space-x-3 mt-4">
              <Button
                onClick={() => setIsDialogOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmMove}
                variant="default"
              >
                Create Trip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 