'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TimelineTrack from './TimelineTrack';
import DailyTrips from './DailyTrips';
import HourSlider from './HourSlider';
import { formatDate, getStartOfDay, getEndOfDay, formatDateTime } from '@/lib/utils';
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
  const [selectedHour, setSelectedHour] = useState(0); // Default to midnight
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [tripsForDay, setTripsForDay] = useState<any[]>([]);
  
  // State for selected trip and wagon
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedWagonId, setSelectedWagonId] = useState<string | null>(null);
  const [isTripDrawerOpen, setIsTripDrawerOpen] = useState(false);
  const [isWagonDrawerOpen, setIsWagonDrawerOpen] = useState(false);

  // Calculate timeline slider range with proper fallbacks
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

  // Get selected datetime with hour precision
  const getSelectedDateTime = () => {
    const selectedDate = new Date(date);
    selectedDate.setHours(selectedHour, 0, 0, 0);
    return selectedDate.toISOString();
  };

  // Function to generate hour markers for the timeline
  const generateHourMarkers = () => {
    if (!date) return null;
    
    const markers = [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Calculate the width of one day
    const totalMs = endOfDay.getTime() - startOfDay.getTime();
    
    // Add a marker every 6 hours (4 markers for a day)
    for (let hour = 6; hour < 24; hour += 6) {
      const time = new Date(date);
      time.setHours(hour, 0, 0, 0);
      
      // Calculate the position as a percentage of the total width
      const elapsedMs = time.getTime() - startOfDay.getTime();
      const position = (elapsedMs / totalMs) * 100;
      
      markers.push(
        <div 
          key={`hour-${hour}`}
          className="absolute h-full border-l border-gray-300 z-0"
          style={{ left: `${position}%` }}
        >
          <span className="absolute -top-5 -translate-x-1/2 text-xs text-gray-500 bg-white px-0.5 font-medium">
            {hour}:00
          </span>
        </div>
      );
    }
    
    return markers;
  };

  // Function to generate week markers for the timeline
  const generateWeekMarkers = () => {
    if (!startDate || !endDate) return null;
    
    const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / oneDay);
    const weekMarkers = [];
    
    // Calculate the number of weeks to show based on total days
    const totalWeeks = Math.floor(totalDays / 7);
    
    // Only show markers if we have reasonable space
    const weeksToShow = Math.min(totalWeeks, 15); // Limit to 15 markers maximum
    const weekInterval = Math.max(1, Math.floor(totalWeeks / weeksToShow));
    
    // Get ISO week number for a date
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
    
    // Create a marker every X weeks
    for (let i = 7; i < totalDays; i += 7 * weekInterval) {
      const position = (i / totalDays) * 100;
      const markerDate = new Date(startDate.getTime() + (i * oneDay));
      const weekNumber = getWeekNumber(markerDate);
      
      weekMarkers.push(
        <div 
          key={i}
          className="absolute h-full border-l border-gray-300 z-0 flex flex-col items-center"
          style={{ left: `${position}%` }}
        >
          <span className="text-xs text-gray-500 bg-white px-1 rounded-sm">
            KW{weekNumber}
          </span>
        </div>
      );
    }
    
    return weekMarkers;
  };

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();
      
      if (!error && data) {
        setProject(data);
        
        // If project has a start date, use it
        if (data.start_date) {
          setDate(new Date(data.start_date).toISOString());
        }
      }
    };
    
    fetchProject();
  }, [projectId]);

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

  // Fetch trips for the selected day (for hour markers)
  const fetchTripsForDay = async () => {
    try {
      const selectedDate = new Date(date);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const { data, error } = await supabase
        .from('trips')
        .select('id, datetime, type')
        .eq('project_id', projectId)
        .gte('datetime', startOfDay.toISOString())
        .lte('datetime', endOfDay.toISOString())
        .order('datetime', { ascending: true });
      
      if (error) {
        console.error('Error fetching trips for day:', error);
        return;
      }
      
      setTripsForDay(data || []);
    } catch (err) {
      console.error('Exception fetching trips for day:', err);
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

  // Fetch trips when date changes
  useEffect(() => {
    fetchTripsForDay();
    
    // When date changes, notify parent component
    if (onDateChange) {
      onDateChange(date);
    }
  }, [date, projectId, onDateChange]);

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
        // Don't do anything if the button is disabled
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
    fetchTripsForDay();
  };

  const handleTripDrawerClose = () => {
    setIsTripDrawerOpen(false);
    setSelectedTripId(null);
    // Refresh data when trip drawer is closed (in case changes were made)
    fetchNodesAndTracks();
    fetchTripsForDay();
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
    const dayName = days[date.getDay()];
    return `${dayName}, ${formatDate(date)}`;
  };

  // Check if today is outside the project date range
  const isTodayOutsideProjectRange = () => {
    if (!project?.start_date || !project?.end_date) return false;
    
    const today = new Date();
    const projectStart = new Date(project.start_date);
    const projectEnd = new Date(project.end_date);
    
    return today < projectStart || today > projectEnd;
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
              className={`px-3 py-1 ${isTodayOutsideProjectRange() ? 'bg-gray-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark'} text-white rounded ml-2`}
              disabled={isTodayOutsideProjectRange()}
              title={isTodayOutsideProjectRange() ? "Heute ist außerhalb des Projektzeitraums" : "Zum heutigen Tag"}
            >
              Heute
            </button>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="relative h-24 px-12">
          {/* Start and end date display */}
          <div className="flex justify-between w-full text-xs text-gray-500 absolute top-3 inset-x-12">
            <span className="font-bold bg-white px-1 py-0.5 rounded -ml-2">{formatDate(startDate)}</span>
            <span className="font-bold bg-white px-1 py-0.5 rounded -mr-2">{formatDate(endDate)}</span>
          </div>
          
          {/* Week markers */}
          <div className="absolute inset-x-12 top-10 bottom-7 z-0">
            {generateWeekMarkers()}
          </div>
          
          {/* Hour markers - Removed from this section */}
          
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
        
        {/* Hour Slider */}
        <div className="mt-2 px-12">
          <div className="flex items-center mb-1">
            <h2 className="text-sm font-medium text-gray-700">Tageszeit</h2>
            <div className="ml-auto text-sm bg-gray-50 px-2 py-1 rounded-md border border-gray-200 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-gray-700">{formatDateTime(getSelectedDateTime())}</span>
            </div>
          </div>
          <HourSlider 
            value={selectedHour}
            onChange={setSelectedHour}
            tripsForDay={tripsForDay}
          />
        </div>
      </div>

      {/* Track Visualization */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4">Gleisbelegung</h2>
        
        <div className="space-y-8">
          {nodes.map(node => (
            <div key={node.id} className="mb-8">
              <h3 className="text-md font-semibold mb-3">{node.name}</h3>
              
              {node.tracks && node.tracks.length > 0 ? (
                <div className="space-y-4">
                  {node.tracks.map((track: any) => (
                    <TimelineTrack
                      key={track.id}
                      track={track}
                      nodeName={node.name}
                      date={getSelectedDateTime()}
                      onWagonSelect={handleWagonSelect}
                      onRefresh={handleRefresh}
                      projectId={projectId}
                      selectedDateTime={new Date(getSelectedDateTime())}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded text-gray-500 text-center">
                  Keine Gleise für diesen Knoten definiert.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Daily Trips */}
      <div className="mb-8">
        <DailyTrips 
          date={date} 
          onTripSelect={handleTripSelect}
          projectId={projectId}
        />
      </div>

      {/* Trip Drawer */}
      {isTripDrawerOpen && selectedTripId && (
        <TripDrawer
          tripId={selectedTripId}
          isOpen={isTripDrawerOpen}
          onClose={handleTripDrawerClose}
          onTripUpdated={handleRefresh}
          project={project}
        />
      )}

      {/* Wagon Drawer */}
      {isWagonDrawerOpen && selectedWagonId && (
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
