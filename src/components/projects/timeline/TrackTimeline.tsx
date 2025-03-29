'use client';

import React, { useState, useEffect } from 'react';
import { Track, Wagon } from '@/lib/supabase';
import { DraggableWagon } from './DraggableWagon';
import { TrackDropZone } from './TrackDropZone';
import { useWagonDragDrop } from '@/hooks/useWagonDragDrop';

interface TrackTimelineProps {
  tracks: Track[];
  wagons: Wagon[];
  projectId: string;
  selectedDate?: string;
}

export function TrackTimeline({ tracks, wagons, projectId, selectedDate }: TrackTimelineProps) {
  const { moveWagons, isMoving } = useWagonDragDrop(projectId);
  const [groupedWagons, setGroupedWagons] = useState<{ [trackId: string]: Wagon[] }>({});
  
  // Group wagons by track
  useEffect(() => {
    const grouped: { [trackId: string]: Wagon[] } = {};
    
    // Initialize empty arrays for all tracks
    tracks.forEach(track => {
      grouped[track.id] = [];
    });
    
    // Add wagons to their respective tracks
    wagons.forEach(wagon => {
      const trackId = wagon.current_track_id;
      if (trackId && grouped[trackId]) {
        grouped[trackId].push(wagon);
      }
    });
    
    setGroupedWagons(grouped);
  }, [tracks, wagons]);
  
  // Handle wagon movement (creates an internal trip)
  const handleMoveWagons = async (
    sourceTrackId: string, 
    destTrackId: string, 
    wagonIds: string[],
    tripDate: string
  ) => {
    await moveWagons(sourceTrackId, destTrackId, wagonIds, tripDate);
  };
  
  return (
    <div className="timeline-container bg-white shadow-md rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Track Timeline</h3>
      
      <div className="relative">
        {/* Header row with date */}
        <div className="flex items-center mb-2 font-semibold text-sm text-gray-600">
          <div className="w-32 shrink-0">Track</div>
          <div className="flex-1">Wagons ({selectedDate || 'Current state'})</div>
        </div>
        
        {/* Track rows */}
        <div className="space-y-3">
          {tracks.map(track => (
            <div key={track.id} className="flex items-center">
              {/* Track info */}
              <div className="w-32 shrink-0">
                <div className="font-medium">{track.name}</div>
                <div className="text-xs text-gray-500">
                  {track.useful_length ? `${track.useful_length}m` : 'No limit'}
                </div>
              </div>
              
              {/* Wagons container */}
              <div className="flex-1 h-10 rounded-md border border-gray-300 bg-gray-50 p-1 flex items-center gap-1 overflow-x-auto">
                {groupedWagons[track.id]?.map(wagon => (
                  <DraggableWagon
                    key={wagon.id}
                    wagon={wagon}
                    tracks={tracks}
                    showDetails={true}
                  />
                ))}
                
                {groupedWagons[track.id]?.length === 0 && (
                  <div className="text-xs text-gray-400 italic ml-2">
                    No wagons on this track
                  </div>
                )}
              </div>
              
              {/* Drop zone */}
              <div className="ml-2 w-6">
                <TrackDropZone
                  track={track}
                  allTracks={tracks}
                  projectId={projectId}
                  tracks={tracks}
                  wagons={wagons}
                  onMove={handleMoveWagons}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>Drag wagons between tracks to create internal trips</p>
      </div>
    </div>
  );
} 