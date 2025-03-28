'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Restriction, Track, Node } from '@/lib/supabase';
import { formatDate, formatTime } from '@/lib/utils';
import RestrictionModal from './RestrictionModal';
import { toast } from '@/components/ui/use-toast';

interface RestrictionListProps {
  projectId: string;
  nodes: Node[];
  tracks: Track[];
}

const RestrictionList: React.FC<RestrictionListProps> = ({ projectId, nodes, tracks }) => {
  const { supabase } = useSupabase();
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restrictionTracks, setRestrictionTracks] = useState<Record<string, string[]>>({});
  const [editRestriction, setEditRestriction] = useState<Restriction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [project, setProject] = useState<any>(null);

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single();
        
        if (error) throw error;
        setProject(data);
      } catch (err: any) {
        console.error('Error fetching project:', err);
      }
    };
    
    fetchProject();
  }, [projectId, supabase]);

  // Fetch restrictions
  const fetchRestrictions = async () => {
    setLoading(true);
    try {
      // Fetch restrictions for this project
      const { data, error } = await supabase
        .from('restrictions')
        .select('*')
        .eq('project_id', projectId)
        .order('start_datetime', { ascending: true });
      
      if (error) throw error;
      
      setRestrictions(data || []);
      
      // Fetch track associations for all restrictions
      if (data && data.length > 0) {
        const restrictionIds = data.map(r => r.id);
        const { data: tracksData, error: tracksError } = await supabase
          .from('restriction_tracks')
          .select('restriction_id, track_id')
          .in('restriction_id', restrictionIds);
        
        if (tracksError) throw tracksError;
        
        // Group tracks by restriction
        const tracksByRestriction: Record<string, string[]> = {};
        tracksData?.forEach(rt => {
          if (!tracksByRestriction[rt.restriction_id]) {
            tracksByRestriction[rt.restriction_id] = [];
          }
          tracksByRestriction[rt.restriction_id].push(rt.track_id);
        });
        
        setRestrictionTracks(tracksByRestriction);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Error fetching restrictions:', err);
      setError(err.message || 'Fehler beim Laden der Einschränkungen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchRestrictions();
    }
  }, [projectId, supabase]);

  // Get track name by ID
  const getTrackName = (trackId: string): string => {
    const track = tracks.find(t => t.id === trackId);
    const node = track ? nodes.find(n => n.id === track.node_id) : null;
    return track ? `${node?.name || ''} - ${track.name}` : 'Unbekanntes Gleis';
  };

  // Format restriction type for display
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

  // Format repetition pattern for display
  const formatRepetitionPattern = (pattern: string): string => {
    switch (pattern) {
      case 'once':
        return 'Einmalig (durchgehend)';
      case 'daily':
        return 'Täglich (zu bestimmten Zeiten)';
      case 'weekly':
        return 'Wöchentlich';
      case 'monthly':
        return 'Monatlich';
      default:
        return pattern;
    }
  };

  // Handle edit restriction
  const handleEditRestriction = (restriction: Restriction) => {
    setEditRestriction(restriction);
    setIsModalOpen(true);
  };

  // Handle new restriction
  const handleNewRestriction = () => {
    setEditRestriction(null);
    setIsModalOpen(true);
  };

  // Handle delete restriction
  const handleDeleteRestriction = async (restrictionId: string) => {
    // Confirm deletion
    if (!window.confirm('Sind Sie sicher, dass Sie diese Einschränkung löschen möchten?')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('restrictions')
        .delete()
        .eq('id', restrictionId);
      
      if (error) throw error;
      
      toast({
        title: "Einschränkung gelöscht",
        description: "Die Einschränkung wurde erfolgreich gelöscht",
        variant: "default"
      });
      
      // Refresh the list
      fetchRestrictions();
    } catch (err: any) {
      console.error('Error deleting restriction:', err);
      toast({
        title: "Fehler",
        description: err.message || 'Fehler beim Löschen der Einschränkung',
        variant: "destructive"
      });
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  // Handle restriction save success
  const handleRestrictionSuccess = () => {
    setIsModalOpen(false);
    fetchRestrictions();
  };

  if (loading && restrictions.length === 0) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Einschränkungen</h2>
        <button
          onClick={handleNewRestriction}
          className="px-3 py-1 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Neue Einschränkung
        </button>
      </div>
      
      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {restrictions.length === 0 ? (
        <div className="p-6 text-center text-gray-500 border rounded">
          Keine Einschränkungen gefunden. Erstellen Sie eine neue Einschränkung mit dem Button oben.
        </div>
      ) : (
        <div className="space-y-4">
          {restrictions.map(restriction => {
            const trackIds = restrictionTracks[restriction.id] || [];
            const trackNames = trackIds.map(getTrackName);
            
            return (
              <div key={restriction.id} className="border rounded p-4 hover:bg-gray-50">
                <div className="flex justify-between">
                  <div>
                    <div className="flex space-x-2 mb-2">
                      {Array.isArray(restriction.restriction_types) 
                        ? restriction.restriction_types.map(type => (
                            <span 
                              key={type} 
                              className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded"
                            >
                              {formatRestrictionType(type)}
                            </span>
                          ))
                        : restriction.restriction_types 
                            ? (
                                <span 
                                  key={restriction.restriction_types} 
                                  className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded"
                                >
                                  {formatRestrictionType(restriction.restriction_types)}
                                </span>
                              )
                            : null
                      }
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                        {formatRepetitionPattern(restriction.repetition_pattern)}
                      </span>
                    </div>
                    
                    <div className="text-sm mb-1">
                      <span className="font-medium">Von:</span> {formatDate(restriction.start_datetime)} {formatTime(restriction.start_datetime)}
                    </div>
                    <div className="text-sm mb-3">
                      <span className="font-medium">Bis:</span> {formatDate(restriction.end_datetime)} {formatTime(restriction.end_datetime)}
                    </div>
                    
                    <div className="mb-2">
                      <div className="text-sm font-medium mb-1">Betroffene Gleise:</div>
                      <div className="pl-2 text-sm text-gray-600">
                        {trackNames.length > 0 ? (
                          trackNames.map((name, index) => (
                            <div key={index}>{name}</div>
                          ))
                        ) : (
                          <div>Keine Gleise ausgewählt</div>
                        )}
                      </div>
                    </div>
                    
                    {restriction.comment && (
                      <div className="mt-2 text-sm">
                        <div className="font-medium">Kommentar:</div>
                        <div className="pl-2 text-gray-600">{restriction.comment}</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditRestriction(restriction)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="Bearbeiten"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteRestriction(restriction.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Restriction Modal */}
      {isModalOpen && project && (
        <RestrictionModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          project={project}
          restriction={editRestriction || undefined}
          onSuccess={handleRestrictionSuccess}
          nodes={nodes}
          tracks={tracks}
        />
      )}
    </div>
  );
};

export default RestrictionList; 