'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Wagon, Track } from '@/lib/supabase';
import { AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { validateDragDrop } from '@/lib/trackUtils';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';

interface DraggableWagonProps {
  wagon: Wagon;
  tracks: Track[];
  onDrop?: (wagonId: string, newTrackId: string) => void;
  onMoveTrip?: (sourceTrackId: string, destTrackId: string, wagonIds: string[]) => void;
  showDetails?: boolean;
}

export function DraggableWagon({ wagon, tracks, onDrop, onMoveTrip, showDetails = false }: DraggableWagonProps) {
  const { supabase } = useSupabase();
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [wagonType, setWagonType] = useState<any>(null);
  const wagonRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Load wagon type info
  useEffect(() => {
    const fetchWagonType = async () => {
      if (!wagon.type_id) return;
      
      const { data } = await supabase
        .from('wagon_types')
        .select('*')
        .eq('id', wagon.type_id)
        .single();
      
      setWagonType(data);
    };
    
    fetchWagonType();
  }, [wagon.type_id, supabase]);
  
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      wagonId: wagon.id,
      sourceTrackId: wagon.current_track_id,
      length: wagon.length
    }));
    
    // Set drag image
    if (wagonRef.current) {
      const rect = wagonRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(wagonRef.current, rect.width / 2, rect.height / 2);
    }
    
    setIsDragging(true);
    setValidationError(null);
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  const handleClick = () => {
    if (showDetails) {
      router.push(`/wagons/${wagon.id}`);
    }
  };
  
  const getWagonColor = () => {
    // Use different colors based on wagon state
    if (isDragging) return 'opacity-50 bg-blue-400';
    if (validationError) return 'bg-red-300';
    if (!wagon.current_track_id) return 'bg-gray-300'; // Wagon not on any track
    
    // Default color based on wagon type or project
    if (wagonType?.color) return `bg-[${wagonType.color}]`;
    return 'bg-blue-500';
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={wagonRef}
            className={`relative rounded p-1 text-xs ${getWagonColor()} 
              cursor-grab border border-gray-400 min-w-[40px] text-center shadow
              transition-all duration-200 h-8 flex items-center justify-center
              ${isDragging ? 'opacity-50' : 'hover:brightness-110'}`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            style={{ width: `${Math.max(40, wagon.length * 3)}px` }}
          >
            <span className="font-semibold">
              {wagonType?.short_name || 'W'}
            </span>
            
            {validationError && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <AlertCircle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="p-1 text-xs">
            <div className="font-bold">{wagonType?.name || 'Wagon'}</div>
            <div>Length: {wagon.length}m</div>
            {wagon.content && <div>Content: {wagon.content}</div>}
            {validationError && (
              <div className="text-red-500 mt-1">{validationError}</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 