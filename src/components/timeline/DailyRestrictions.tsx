'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { formatDate, formatTime } from '@/lib/utils';
import { getStartOfDay, getEndOfDay } from '@/lib/utils';

interface DailyRestrictionsProps {
  projectId: string;
  date: string;
}

interface RestrictionDisplay {
  id: string;
  start_datetime: string;
  end_datetime: string;
  repetition_pattern: string;
  restriction_types: string[];
  comment?: string;
  tracks: {
    id: string;
    name: string;
    node_name: string;
  }[];
}

const DailyRestrictions: React.FC<DailyRestrictionsProps> = ({ projectId, date }) => {
  const { supabase } = useSupabase();
  const [restrictions, setRestrictions] = useState<RestrictionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyRestrictions = async () => {
      setLoading(true);
      try {
        const dateObj = new Date(date);
        
        // Get start and end of the selected day
        const dayStart = getStartOfDay(dateObj).toISOString();
        const dayEnd = getEndOfDay(dateObj).toISOString();
        
        // Fetch one-time restrictions that overlap with the selected day
        const { data: onceData, error: onceError } = await supabase
          .from('restrictions')
          .select(`
            id, 
            start_datetime, 
            end_datetime, 
            repetition_pattern, 
            restriction_types,
            comment
          `)
          .eq('project_id', projectId)
          .eq('repetition_pattern', 'once')
          .or(`and(start_datetime.lte.${dayEnd},end_datetime.gte.${dayStart})`)
          .order('start_datetime');
        
        if (onceError) throw onceError;
        
        // Fetch daily restrictions that are active on the selected day
        const { data: dailyData, error: dailyError } = await supabase
          .from('restrictions')
          .select(`
            id, 
            start_datetime, 
            end_datetime, 
            repetition_pattern, 
            restriction_types,
            comment
          `)
          .eq('project_id', projectId)
          .eq('repetition_pattern', 'daily')
          .lte('start_datetime', dayEnd)
          .gte('end_datetime', dayStart)
          .order('start_datetime');
        
        if (dailyError) throw dailyError;
        
        // Combine all restrictions
        const allRestrictions = [
          ...(onceData || []),
          ...(dailyData || [])
        ];
        
        // If there are restrictions, fetch their associated tracks
        if (allRestrictions.length > 0) {
          const restrictionIds = allRestrictions.map(r => r.id);
          
          const { data: tracksData, error: tracksError } = await supabase
            .from('restriction_tracks')
            .select(`
              restriction_id,
              track_id,
              tracks(
                id,
                name,
                node_id,
                nodes(name)
              )
            `)
            .in('restriction_id', restrictionIds);
          
          if (tracksError) throw tracksError;
          
          // Group tracks by restriction
          const tracksByRestriction: Record<string, any[]> = {};
          tracksData?.forEach(rt => {
            if (!tracksByRestriction[rt.restriction_id]) {
              tracksByRestriction[rt.restriction_id] = [];
            }
            
            const track = rt.tracks as any;
            tracksByRestriction[rt.restriction_id].push({
              id: track.id,
              name: track.name,
              node_name: track.nodes?.name || 'Unknown'
            });
          });
          
          // Create final restriction display objects
          const restrictionsWithTracks: RestrictionDisplay[] = allRestrictions.map(r => ({
            ...r,
            tracks: tracksByRestriction[r.id] || []
          }));
          
          setRestrictions(restrictionsWithTracks);
        } else {
          setRestrictions([]);
        }
        
        setError(null);
      } catch (err: any) {
        console.error('Error fetching daily restrictions:', err);
        setError(err.message || 'Fehler beim Laden der Einschränkungen');
      } finally {
        setLoading(false);
      }
    };
    
    if (projectId && date) {
      fetchDailyRestrictions();
    }
  }, [projectId, date, supabase]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="h-24 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
        {error}
      </div>
    );
  }

  if (restrictions.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-2">
        Keine Einschränkungen für diesen Tag.
      </div>
    );
  }

  // Helper function to format restriction types
  const formatRestrictionType = (type: string): string => {
    switch (type) {
      case 'no_entry':
        return 'Keine Einfahrt möglich';
      case 'no_exit':
        return 'Keine Ausfahrt möglich';
      default:
        return type;
    }
  };

  // Helper function to format time period for display
  const formatTimePeriod = (restriction: RestrictionDisplay): string => {
    if (restriction.repetition_pattern === 'once') {
      // For "once" restrictions, show date range
      return `${formatDate(restriction.start_datetime)} - ${formatDate(restriction.end_datetime)}`;
    } else if (restriction.repetition_pattern === 'daily') {
      // For "daily" restrictions, show time window
      return `${formatTime(restriction.start_datetime)} - ${formatTime(restriction.end_datetime)}`;
    }
    return '';
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Einschränkungen:</h3>
      
      <div className="space-y-2">
        {restrictions.map(restriction => (
          <div 
            key={restriction.id} 
            className="bg-red-50 border border-red-200 p-3 rounded text-sm"
          >
            <div className="flex space-x-2 mb-1">
              {Array.isArray(restriction.restriction_types) 
                ? restriction.restriction_types.map(type => (
                    <span 
                      key={type} 
                      className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded"
                    >
                      {formatRestrictionType(type)}
                    </span>
                  ))
                : restriction.restriction_types 
                    ? (
                        <span 
                          key={restriction.restriction_types} 
                          className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded"
                        >
                          {formatRestrictionType(restriction.restriction_types)}
                        </span>
                      )
                    : null
              }
              
              <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded">
                {restriction.repetition_pattern === 'once' ? 'Einmalig' : 'Täglich'} {formatTimePeriod(restriction)}
              </span>
            </div>
            
            {restriction.comment && (
              <div className="text-gray-700 mb-2">{restriction.comment}</div>
            )}
            
            <div className="mt-1">
              <div className="text-xs font-medium text-gray-500 mb-1">Betroffene Gleise:</div>
              <div className="flex flex-wrap gap-1">
                {restriction.tracks.map(track => (
                  <span 
                    key={track.id}
                    className="px-1.5 py-0.5 bg-gray-100 text-gray-800 text-xs rounded whitespace-nowrap"
                  >
                    {track.node_name} - {track.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DailyRestrictions; 