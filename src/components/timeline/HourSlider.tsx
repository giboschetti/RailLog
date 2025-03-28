'use client';

import React, { useEffect, useMemo } from 'react';
import { formatTime } from '@/lib/utils';

interface TripForMarker {
  id: string;
  datetime: string;
  type: string;
}

interface HourSliderProps {
  value: number;
  onChange: (hour: number) => void;
  tripsForDay?: TripForMarker[];
  className?: string;
}

const HourSlider: React.FC<HourSliderProps> = ({
  value,
  onChange,
  tripsForDay = [],
  className = '',
}) => {
  // Group trips by hour for markers
  const tripHours = useMemo(() => {
    return tripsForDay.reduce((hours, trip) => {
      const tripDate = new Date(trip.datetime);
      const hour = tripDate.getHours();
      if (!hours.includes(hour)) hours.push(hour);
      return hours;
    }, [] as number[]);
  }, [tripsForDay]);

  // Set initial hour to current time or 8:00 AM during working hours
  useEffect(() => {
    // Only set initial time if no value has been set yet (value === 0)
    if (value === 0) {
      const now = new Date();
      const hour = now.getHours();
      
      // If within working hours, use current hour, otherwise default to 8 AM
      const initialHour = (hour >= 8 && hour <= 18) ? hour : 8;
      onChange(initialHour);
    }
  }, [value, onChange]);

  // Generate hour markers for better time resolution
  const hourMarkers = [];
  for (let hour = 0; hour <= 24; hour += 6) { // Every 6 hours
    hourMarkers.push(
      <div 
        key={hour}
        className="absolute h-4 w-px bg-gray-300 top-2"
        style={{ left: `${(hour / 24) * 100}%` }}
      ></div>
    );
  }

  return (
    <div className={`mt-2 mb-4 ${className}`}>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        {[0, 6, 12, 18, 24].map(hour => (
          <span key={hour}>{formatTime(new Date(new Date().setHours(hour, 0, 0, 0)))}</span>
        ))}
      </div>
      
      <div className="relative h-12">
        {/* Base slider track */}
        <div className="absolute w-full h-2 bg-gray-200 rounded-full top-4"></div>
        
        {/* Hour markers */}
        {hourMarkers}
        
        {/* Trip hour markers - more subtle styling */}
        {tripHours.map(hour => (
          <div 
            key={hour}
            className="absolute w-1 h-3 bg-gray-400 rounded-full top-3.5 z-10 opacity-60"
            style={{ left: `${(hour / 24) * 100}%` }}
            title={`Fahrt um ${hour}:00 Uhr`}
          ></div>
        ))}
        
        {/* Interactive slider */}
        <input
          type="range"
          min={0}
          max={24}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute w-full top-3 h-4 opacity-0 cursor-pointer z-20"
        />
        
        {/* Slider track fill */}
        <div 
          className="absolute h-2 bg-primary rounded-full top-4"
          style={{ width: `${(value / 24) * 100}%` }}
        ></div>
        
        {/* Slider thumb */}
        <div 
          className="absolute w-6 h-6 bg-primary border-2 border-white rounded-full shadow-md top-2 z-10"
          style={{ left: `calc(${(value / 24) * 100}% - 12px)` }}
        >
          <span className="absolute -bottom-7 left-1/2 transform -translate-x-1/2 text-xs font-medium bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100">
            {formatTime(new Date(new Date().setHours(value, 0, 0, 0)))}
          </span>
        </div>
      </div>
    </div>
  );
};

export default HourSlider; 