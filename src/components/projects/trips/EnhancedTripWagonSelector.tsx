'use client';

import React, { useState, useEffect } from 'react';
import { getEnhancedTrackOccupancy, WagonOnTrack } from '@/lib/trackUtils';
import { WagonType } from '@/lib/supabase';

interface EnhancedWagonSelectorProps {
  trackId: string;
  date: string;
  selectedWagonIds: string[];
  onWagonSelect: (wagonId: string, selected: boolean) => void;
  wagonTypes: WagonType[];
}

const EnhancedTripWagonSelector: React.FC<EnhancedWagonSelectorProps> = ({
  trackId,
  date,
  selectedWagonIds,
  onWagonSelect,
  wagonTypes
}) => {
  const [loading, setLoading] = useState(true);
  const [wagons, setWagons] = useState<WagonOnTrack[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWagons = async () => {
      if (!trackId) {
        setWagons([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await getEnhancedTrackOccupancy(trackId, date);
        
        if (result.success) {
          setWagons(result.wagons);
          setError(null);
        } else {
          setError(result.errorMessage || 'Failed to load wagons');
          setWagons([]);
        }
      } catch (err: any) {
        console.error('Error fetching wagons:', err);
        setError(err.message || 'An error occurred');
        setWagons([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWagons();
  }, [trackId, date]);

  const getWagonTypeName = (typeId: string): string => {
    const wagonType = wagonTypes.find(type => type.id === typeId);
    return wagonType?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 my-4">
        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 rounded-md my-4">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (wagons.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-md my-4 text-center">
        <p className="text-gray-500">Keine Waggons auf diesem Gleis.</p>
      </div>
    );
  }

  // Group wagons by type for better organization
  const wagonsByType: { [key: string]: WagonOnTrack[] } = {};
  wagons.forEach(wagon => {
    const typeName = getWagonTypeName(wagon.type_id);
    if (!wagonsByType[typeName]) {
      wagonsByType[typeName] = [];
    }
    wagonsByType[typeName].push(wagon);
  });

  return (
    <div className="my-4">
      <h3 className="font-medium mb-3">Waggons auf diesem Gleis ({wagons.length})</h3>
      
      <div className="space-y-4">
        {Object.entries(wagonsByType).map(([typeName, typeWagons]) => (
          <div key={typeName} className="border rounded-md overflow-hidden">
            <div className="bg-gray-100 px-3 py-2 font-medium text-sm">
              {typeName} ({typeWagons.length})
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {typeWagons.map(wagon => (
                <div
                  key={wagon.id}
                  className={`border rounded-md p-2 cursor-pointer transition-colors ${
                    selectedWagonIds.includes(wagon.id)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                  onClick={() => onWagonSelect(
                    wagon.id, 
                    !selectedWagonIds.includes(wagon.id)
                  )}
                >
                  <div className="font-medium text-sm">
                    {wagon.number || `Waggon #${wagon.id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs opacity-80">
                    {wagon.length}m {wagon.content ? `- ${wagon.content}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EnhancedTripWagonSelector; 