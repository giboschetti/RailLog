'use client';

import React from 'react';
import { Track, Wagon } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface TrackListProps {
  tracks: Track[];
  wagons: Wagon[];
}

export function TrackList({ tracks, wagons }: TrackListProps) {
  // Group wagons by track
  const wagonsByTrack = wagons.reduce((acc, wagon) => {
    const trackId = wagon.current_track_id;
    if (!trackId) return acc;
    
    if (!acc[trackId]) {
      acc[trackId] = [];
    }
    
    acc[trackId].push(wagon);
    return acc;
  }, {} as Record<string, Wagon[]>);
  
  // Calculate track usage
  const getTrackUsage = (track: Track) => {
    const trackWagons = wagonsByTrack[track.id] || [];
    const totalLength = trackWagons.reduce((sum, wagon) => sum + (wagon.length || 0), 0);
    const trackLength = track.useful_length || 0;
    
    // Skip calculation if track has unlimited capacity
    if (trackLength === 0) {
      return {
        usage: 0,
        percentage: 0,
        hasCapacity: true,
        wagonsCount: trackWagons.length
      };
    }
    
    const percentage = Math.min(100, Math.round((totalLength / trackLength) * 100));
    
    return {
      usage: totalLength,
      percentage,
      hasCapacity: totalLength <= trackLength,
      wagonsCount: trackWagons.length
    };
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tracks.map(track => {
        const usage = getTrackUsage(track);
        const node = track.nodes as any;
        
        return (
          <Card key={track.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex justify-between items-center">
                <span>Track: {track.name}</span>
                <span className="text-sm font-normal text-gray-500">
                  {node?.name || 'Unknown node'}
                </span>
              </CardTitle>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Length: {track.useful_length ? `${track.useful_length}m` : 'Unlimited'}</span>
                  <span className={`font-medium ${!usage.hasCapacity ? 'text-red-600' : ''}`}>
                    {usage.usage}m used ({usage.percentage}%)
                  </span>
                </div>
                
                <Progress 
                  value={usage.percentage} 
                  className={`h-2 ${usage.percentage > 90 ? 'bg-red-100' : 'bg-gray-100'}`}
                  indicatorClassName={usage.percentage > 90 ? 'bg-red-500' : undefined}
                />
                
                <div className="flex justify-between text-sm">
                  <span>Wagons: {usage.wagonsCount}</span>
                  <span className={!usage.hasCapacity ? 'text-red-600 font-medium' : 'text-gray-500'}>
                    {!usage.hasCapacity 
                      ? 'Over capacity!' 
                      : usage.percentage > 90 
                        ? 'Almost full' 
                        : 'Has capacity'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
} 