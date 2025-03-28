'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TimelineTrack from './TimelineTrack';
import DailyTrips from './DailyTrips';
import { formatDate, getStartOfDay, getEndOfDay } from '@/lib/utils';
import TripDrawer from '../projects/trips/TripDrawer';
import WagonDrawer from '../projects/wagons/WagonDrawer';

interface EnhancedTimelineProps {
  projectId: string;
  initialDate?: string;
  refreshKey?: number;
  onDateChange?: (date: string) => void;
}

interface Node {
  id: string;
  name: string;
  tracks: {
    id: string;
    name: string;
    useful_length: number;
  }[];
}

const EnhancedTimeline: React.FC<EnhancedTimelineProps> = ({ 
  projectId,
  initialDate = new Date().toISOString(),
  refreshKey = 0,
  onDateChange
}) => {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const [project, setProject] = useState<any>(null);
  
  // State for selected trip and wagon
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedWagonId, setSelectedWagonId] = useState<string | null>(null);
  const [isTripDrawerOpen, setIsTripDrawerOpen] = useState(false);
  const [isWagonDrawerOpen, setIsWagonDrawerOpen] = useState(false);

  // Calculate timeline slider range
  const startDate = project?.start_date 
    ? new Date(project.start_date) 
    : new Date(new Date().setFullYear(new Date().getFullYear() - 1)); // Default to 1 year ago
  
  const endDate = project?.end_date 
    ? new Date(project.end_date) 
    : new Date(new Date().setFullYear(new Date().getFullYear() + 1)); // Default to 1 year in future
  
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  
  // Calculate current day position for slider
  const currentDateObj = new Date(date);
  const currentDayPosition = Math.max(
    0, 
    Math.min(
      100,
      ((currentDateObj.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100
    )
  );

  // Fetch project data for date range
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single();

        if (error) {
          console.error('Error fetching project:', error);
          return;
        }

        setProject(data);
        
        // If project has a start date, use it as the initial date
        if (data.start_date) {
          // Only update date if not already set manually
          if (date === initialDate) {
            const today = new Date();
            const projectStart = new Date(data.start_date);
            const projectEnd = data.end_date ? new Date(data.end_date) : null;
            
            // If today is within the project dates, use today, otherwise use project start
            if (projectEnd && (today < projectStart || today > projectEnd)) {
              setDate(projectStart.toISOString());
            } else if (!projectEnd && today < projectStart) {
              setDate(projectStart.toISOString());
            }
          }
        }
      } catch (err) {
        console.error('Exception fetching project data:', err);
      }
    };

    fetchProjectData();
  }, [projectId, initialDate, date]);

  // Fetch nodes and tracks for this project
  const fetchNodesAndTracks = async () => {
    setLoading(true);
    try {
      const { data: nodesData, error: nodesError } = await supabase
        .from('nodes')
        .select(`
          id,
          name,
          tracks (
            id,
            name,
            useful_length
          )
        `)
        .eq('project_id', projectId)
        .order('name');
      
      if (nodesError) {
        console.error('Error fetching nodes:', nodesError);
        setError(nodesError.message);
        return;
      }
      
      setNodes(nodesData || []);
      setError(null);
    } catch (err: any) {
      console.error('Exception fetching nodes:', err);
      setError(err.message || 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodesAndTracks();
  }, [projectId]);
  
  // Refetch data when refreshKey changes
  useEffect(() => {
    if (refreshKey > 0) {
      fetchNodesAndTracks();
    }
  }, [refreshKey]);

  // Update the date change handler to call the onDateChange callback
  useEffect(() => {
    // When date changes, notify parent component
    if (onDateChange) {
      onDateChange(date);
    }
  }, [date, onDateChange]);

  // Navigate to previous/next day
  const goToPreviousDay = () => {
    const currentDate = new Date(date);
    const prevDay = new Date(currentDate);
    prevDay.setDate(prevDay.getDate() - 1);
    setDate(prevDay.toISOString());
  };

  const goToNextDay = () => {
    const currentDate = new Date(date);
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setDate(nextDay.toISOString());
  };

  const goToToday = () => {
    const today = new Date();
    
    // Check if today is within the project timeframe
    if (project?.start_date && project?.end_date) {
      const projectStart = new Date(project.start_date);
      const projectEnd = new Date(project.end_date);
      
      // If today is outside the project timeframe, use project start date
      if (today < projectStart || today > projectEnd) {
        setDate(projectStart.toISOString());
        return;
      }
    }
    
    // If today is within project timeframe or no project dates defined, use today
    setDate(today.toISOString());
  };

  // Handle timeline slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseFloat(e.target.value);
    const newDateMs = startDate.getTime() + (position / 100) * (endDate.getTime() - startDate.getTime());
    setDate(new Date(newDateMs).toISOString());
  };

  // Format date for tooltip
  const formatSliderDate = (position: number) => {
    const dateMs = startDate.getTime() + (position / 100) * (endDate.getTime() - startDate.getTime());
    return formatDate(new Date(dateMs));
  };

  // Handle trip selection
  const handleTripSelect = (tripId: string) => {
    setSelectedTripId(tripId);
    setIsTripDrawerOpen(true);
  };

  // Handle wagon selection
  const handleWagonSelect = (wagonId: string) => {
    setSelectedWagonId(wagonId);
    setIsWagonDrawerOpen(true);
  };

  // Handle refresh after updates
  const handleRefresh = () => {
    fetchNodesAndTracks();
  };

  const handleTripDrawerClose = () => {
    setIsTripDrawerOpen(false);
    setSelectedTripId(null);
    // Refresh data when trip drawer is closed (in case changes were made)
    fetchNodesAndTracks();
  };

  const handleWagonDrawerClose = () => {
    setIsWagonDrawerOpen(false);
    setSelectedWagonId(null);
    // Refresh data when wagon drawer is closed (in case changes were made)
    fetchNodesAndTracks();
  };

  // Format date for display with day of week
  const formatDateWithDay = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const dayOfWeek = days[date.getDay()];
    const formattedDate = formatDate(date);
    return `${dayOfWeek}, ${formattedDate}`;
  };

  // Get ISO week number
  const getWeekNumber = (d: Date) => {
    // Copy date to avoid modifying the original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday (makes the week calculation ISO-compliant)
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks between yearStart and date
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  };

  // Generate week markers for the timeline
  const generateWeekMarkers = () => {
    const segments = 10;
    const markers = [];
    
    for (let i = 0; i <= segments; i++) {
      const position = (i / segments) * 100;
      const segmentDate = new Date(
        startDate.getTime() + (endDate.getTime() - startDate.getTime()) * (position / 100)
      );
      
      const weekNumber = getWeekNumber(segmentDate);
      
      markers.push(
        <div 
          key={i} 
          className="absolute h-full"
          style={{ left: `${position}%` }}
        >
          <div className="h-full w-px bg-gray-200"></div>
          <div className="absolute -top-5 -translate-x-1/2 text-xs text-gray-500 font-bold">
            {i > 0 && i < segments ? `KW${weekNumber}` : ''}
          </div>
        </div>
      );
    }
    
    return markers;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 rounded">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Date Navigation */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <h1 className="text-2xl font-bold">Zeitachse</h1>
          <div className="ml-auto flex items-center space-x-2">
            <button 
              onClick={goToPreviousDay}
              className="p-2 bg-gray-100 rounded hover:bg-gray-200"
              title="Vorheriger Tag"
            >
              ←
            </button>
            <div className="px-4 py-2 font-bold">{formatDateWithDay(date)}</div>
            <button 
              onClick={goToNextDay}
              className="p-2 bg-gray-100 rounded hover:bg-gray-200"
              title="Nächster Tag"
            >
              →
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 bg-primary text-white rounded hover:bg-primary-dark ml-2"
            >
              Heute
            </button>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="relative w-full h-24 bg-white rounded-lg shadow-sm border border-gray-200 px-12 pt-7 pb-3 flex items-center">
          {/* Start and end date display */}
          <div className="flex justify-between w-full text-xs text-gray-500 absolute top-3 inset-x-12">
            <span className="font-bold">{formatDate(startDate)}</span>
            <span className="font-bold">{formatDate(endDate)}</span>
          </div>
          
          {/* Week markers */}
          <div className="absolute inset-x-12 top-10 bottom-7 z-0">
            {generateWeekMarkers()}
          </div>
          
          {/* Slider input */}
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={currentDayPosition}
            onChange={handleSliderChange}
            onMouseDown={() => setIsSliderDragging(true)}
            onMouseUp={() => setIsSliderDragging(false)}
            onTouchStart={() => setIsSliderDragging(true)}
            onTouchEnd={() => setIsSliderDragging(false)}
            className="w-full h-3 appearance-none cursor-pointer bg-gray-200 rounded-full relative z-10"
            style={{
              background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${currentDayPosition}%, #E5E7EB ${currentDayPosition}%, #E5E7EB 100%)`,
              accentColor: '#3B82F6'
            }}
          />
          
          {/* Tooltip when dragging */}
          {isSliderDragging && (
            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-3 py-1.5 rounded text-xs whitespace-nowrap z-20 shadow-md">
              {formatDateWithDay(date)}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
        {/* Left side: Track visualization */}
        <div className="md:col-span-2 lg:col-span-3 bg-white rounded-lg border border-gray-200 p-4 overflow-auto max-h-[70vh]">
          <h2 className="text-xl font-bold mb-4">Gleisbelegung</h2>
          
          {nodes.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded text-center">
              <p className="text-gray-500">Keine Logistikknoten gefunden</p>
            </div>
          ) : (
            <div className="space-y-6">
              {nodes.map(node => (
                <div key={node.id} className="space-y-2">
                  <h3 className="font-semibold text-lg">{node.name}</h3>
                  
                  {node.tracks && node.tracks.length > 0 ? (
                    <div className="space-y-4">
                      {node.tracks.map((track: any) => (
                        <TimelineTrack
                          key={track.id}
                          nodeName={node.name}
                          track={track}
                          date={date}
                          onWagonSelect={handleWagonSelect}
                          onRefresh={handleRefresh}
                          projectId={projectId}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <p className="text-gray-500">Keine Gleise für diesen Knoten</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Right side: Daily trips */}
        <div className="md:col-span-1 bg-white rounded-lg border border-gray-200">
          <DailyTrips 
            date={date} 
            onTripSelect={handleTripSelect}
            projectId={projectId}
          />
        </div>
      </div>

      {/* Trip and Wagon Drawers */}
      {selectedTripId && isTripDrawerOpen && project && (
        <TripDrawer
          tripId={selectedTripId}
          isOpen={isTripDrawerOpen}
          onClose={handleTripDrawerClose}
          onTripUpdated={handleRefresh}
          project={project}
        />
      )}
      
      {selectedWagonId && isWagonDrawerOpen && (
        <WagonDrawer
          wagonId={selectedWagonId}
          isOpen={isWagonDrawerOpen}
          onClose={handleWagonDrawerClose}
          onWagonUpdated={handleRefresh}
          projectId={projectId}
        />
      )}
    </div>
  );
};

export default EnhancedTimeline; 
