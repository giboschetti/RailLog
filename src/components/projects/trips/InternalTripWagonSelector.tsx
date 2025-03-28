import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Wagon, WagonType } from '@/lib/supabase';
import { Checkbox } from '@/components/ui/checkbox';
import { WagonOnTrack, getEnhancedTrackOccupancy } from '@/lib/trackUtils';
import { Button } from '@/components/ui/button';

interface InternalTripWagonSelectorProps {
  projectId: string;
  sourceTrackId: string;
  datetime: string;
  wagonTypes: WagonType[];
  onWagonsSelected: (wagons: Wagon[]) => void;
}

const InternalTripWagonSelector: React.FC<InternalTripWagonSelectorProps> = ({
  projectId,
  sourceTrackId,
  datetime,
  wagonTypes,
  onWagonsSelected
}) => {
  const [loading, setLoading] = useState(true);
  const [wagons, setWagons] = useState<WagonOnTrack[]>([]);
  const [selectedWagonIds, setSelectedWagonIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { supabase } = useSupabase();
  
  // Fetch wagons currently on the source track
  useEffect(() => {
    const fetchWagons = async () => {
      if (!sourceTrackId) {
        setWagons([]);
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // Use the enhanced track occupancy function to get current wagons
        const result = await getEnhancedTrackOccupancy(sourceTrackId, datetime);
        
        if (result.success) {
          console.log('Wagons found on track:', result.wagons);
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
  }, [sourceTrackId, datetime]);
  
  // Toggle wagon selection
  const toggleWagonSelection = useCallback((wagonId: string) => {
    setSelectedWagonIds(prev => {
      if (prev.includes(wagonId)) {
        return prev.filter(id => id !== wagonId);
      } else {
        return [...prev, wagonId];
      }
    });
  }, []);
  
  // Handle applying the selection
  const handleApplySelection = useCallback(() => {
    // Find the selected wagon objects based on IDs
    const selectedWagons = wagons.filter(wagon => 
      selectedWagonIds.includes(wagon.id)
    );
    
    // Pass only the selected wagons to the parent component
    onWagonsSelected(selectedWagons as unknown as Wagon[]);
  }, [wagons, selectedWagonIds, onWagonsSelected]);
  
  // Get a wagon type name
  const getWagonTypeName = (typeId: string | null | undefined): string => {
    if (!typeId) return 'Unknown';
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
  
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Verfügbare Waggons</h3>
        <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
          {wagons.map(wagon => (
            <div 
              key={wagon.id} 
              className="p-2 flex items-center hover:bg-gray-50"
            >
              <Checkbox 
                id={`wagon-${wagon.id}`}
                checked={selectedWagonIds.includes(wagon.id)}
                onCheckedChange={() => toggleWagonSelection(wagon.id)}
                className="mr-3"
              />
              <div className="flex-1">
                <label 
                  htmlFor={`wagon-${wagon.id}`} 
                  className="text-sm cursor-pointer flex items-center justify-between w-full"
                >
                  <div>
                    <span className="font-medium">
                      {wagon.number || `Waggon ${wagon.id.substring(0, 8)}`}
                    </span>
                    <span className="ml-2 text-gray-500">
                      {getWagonTypeName(wagon.type_id)}
                    </span>
                    {wagon.content && (
                      <span className="ml-2 text-gray-500 italic">
                        ({wagon.content})
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400">{wagon.length}m</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button 
          type="button" 
          onClick={handleApplySelection}
          disabled={selectedWagonIds.length === 0}
        >
          {selectedWagonIds.length} Waggon{selectedWagonIds.length !== 1 ? 's' : ''} auswählen
        </Button>
      </div>
    </div>
  );
};

export default InternalTripWagonSelector; 