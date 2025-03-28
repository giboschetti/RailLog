'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Track, Node, Restriction, RestrictionType, RepetitionPattern } from '@/lib/supabase';
import { toast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/utils';
import { expandRestriction } from '@/lib/trackUtils';
import { checkDailyRestrictionsTable } from '@/lib/utils';

interface RestrictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  restriction?: Restriction; // If provided, we're editing an existing restriction
  onSuccess: () => void;
  nodes: Node[];
  tracks: Track[];
}

const RestrictionModal: React.FC<RestrictionModalProps> = ({
  isOpen,
  onClose,
  project,
  restriction,
  onSuccess,
  nodes,
  tracks
}) => {
  const { supabase } = useSupabase();
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [repetitionPattern, setRepetitionPattern] = useState<RepetitionPattern>('once');
  const [restrictionTypes, setRestrictionTypes] = useState<RestrictionType[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to format date for input field
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().substring(0, 16); // Format: YYYY-MM-DDThh:mm
  };

  // If restriction is provided, populate the form for editing
  useEffect(() => {
    if (restriction) {
      setStartDateTime(formatDateForInput(restriction.start_datetime));
      setEndDateTime(formatDateForInput(restriction.end_datetime));
      setRepetitionPattern(restriction.repetition_pattern);
      setRestrictionTypes(restriction.restriction_types);
      setComment(restriction.comment || '');
      
      // Fetch tracks for this restriction
      const fetchRestrictionTracks = async () => {
        try {
          const { data, error } = await supabase
            .from('restriction_tracks')
            .select('track_id')
            .eq('restriction_id', restriction.id);
          
          if (error) throw error;
          
          if (data) {
            setSelectedTrackIds(data.map(rt => rt.track_id));
          }
        } catch (error) {
          console.error('Error fetching restriction tracks:', error);
        }
      };
      
      fetchRestrictionTracks();
    } else {
      // Reset form for new restriction
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      setStartDateTime(formatDateForInput(now.toISOString()));
      setEndDateTime(formatDateForInput(tomorrow.toISOString()));
      setRepetitionPattern('once');
      setRestrictionTypes([]);
      setSelectedTrackIds([]);
      setComment('');
    }
    setError(null);
  }, [restriction, isOpen, supabase]);

  // Get tracks grouped by node
  const getTracksByNode = () => {
    const tracksByNode: Record<string, Track[]> = {};
    
    nodes.forEach(node => {
      tracksByNode[node.id] = tracks.filter(track => track.node_id === node.id);
    });
    
    return tracksByNode;
  };

  // Toggle restriction type selection
  const toggleRestrictionType = (type: RestrictionType) => {
    setRestrictionTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  // Toggle track selection
  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds(prev => {
      if (prev.includes(trackId)) {
        return prev.filter(id => id !== trackId);
      } else {
        return [...prev, trackId];
      }
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Validate form
    if (restrictionTypes.length === 0) {
      setError('Bitte wählen Sie mindestens einen Einschränkungstyp aus.');
      setLoading(false);
      return;
    }
    
    if (selectedTrackIds.length === 0) {
      setError('Bitte wählen Sie mindestens ein Gleis aus.');
      setLoading(false);
      return;
    }
    
    if (!startDateTime || !endDateTime) {
      setError('Bitte geben Sie Start- und Enddatum an.');
      setLoading(false);
      return;
    }
    
    try {
      // Prepare restriction data
      const restrictionData = {
        id: restriction?.id || crypto.randomUUID(),
        project_id: project.id,
        start_datetime: new Date(startDateTime).toISOString(),
        end_datetime: new Date(endDateTime).toISOString(),
        repetition_pattern: repetitionPattern,
        restriction_types: restrictionTypes,
        comment: comment || null,
      };
      
      // Insert or update the restriction
      let operation;
      if (restriction) {
        operation = supabase
          .from('restrictions')
          .update(restrictionData)
          .eq('id', restriction.id);
      } else {
        operation = supabase
          .from('restrictions')
          .insert(restrictionData);
      }
      
      const { error: restrictionError } = await operation;
      
      if (restrictionError) throw restrictionError;
      
      // If editing, remove all existing track associations
      if (restriction) {
        const { error: deleteError } = await supabase
          .from('restriction_tracks')
          .delete()
          .eq('restriction_id', restriction.id);
        
        if (deleteError) throw deleteError;
        
        // Also delete any expanded daily restrictions for this restriction
        const { error: deleteDailyError } = await supabase
          .from('daily_restrictions')
          .delete()
          .eq('original_restriction_id', restriction.id);
          
        if (deleteDailyError) throw deleteDailyError;
      }
      
      // Insert track associations
      const trackAssociations = selectedTrackIds.map(trackId => ({
        restriction_id: restrictionData.id,
        track_id: trackId
      }));
      
      const { error: tracksError } = await supabase
        .from('restriction_tracks')
        .insert(trackAssociations);
      
      if (tracksError) throw tracksError;
      
      // Check the daily_restrictions table before expanding
      console.log('Checking daily_restrictions table before expansion...');
      const tableCheck = await checkDailyRestrictionsTable(supabase);
      console.log('Table check result:', tableCheck);
      
      // Now expand the restriction into daily records
      let expansionSuccess = false;
      
      for (const restrictionType of restrictionTypes) {
        try {
          const expansionResult = await expandRestriction(
            restrictionData.id,
            project.id,
            restrictionData.start_datetime,
            restrictionData.end_datetime,
            restrictionData.repetition_pattern,
            restrictionType,
            selectedTrackIds,
            restrictionData.comment || undefined,
            supabase
          );
          
          if (expansionResult.success) {
            expansionSuccess = true;
          } else {
            console.error('Error expanding restriction:', expansionResult.error);
          }
        } catch (expansionError) {
          console.error('Exception during restriction expansion:', expansionError);
          // Continue with other restriction types even if one fails
        }
      }
      
      // Show different toast messages based on expansion success
      if (expansionSuccess) {
        toast({
          title: restriction ? "Einschränkung aktualisiert" : "Einschränkung erstellt",
          description: restriction 
            ? "Die Einschränkung wurde erfolgreich aktualisiert"
            : "Eine neue Einschränkung wurde erfolgreich erstellt",
          variant: "default"
        });
      } else {
        toast({
          title: restriction ? "Einschränkung aktualisiert" : "Einschränkung erstellt",
          description: "Die Einschränkung wurde gespeichert, aber es gab Probleme bei der Erweiterung in tägliche Einschränkungen. Bitte kontaktieren Sie den Administrator.",
          variant: "destructive"
        });
      }
      
      onSuccess();
    } catch (err: any) {
      console.error('Error saving restriction:', err);
      setError(err.message || 'Fehler beim Speichern der Einschränkung');
      toast({
        title: "Fehler",
        description: err.message || 'Fehler beim Speichern der Einschränkung',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-auto">
        <h2 className="text-2xl font-bold mb-4">
          {restriction ? 'Einschränkung bearbeiten' : 'Neue Einschränkung'}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Date and time fields */}
            <div>
              <label className="block text-sm font-medium mb-1">Von</label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Bis</label>
              <input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="w-full p-2 border rounded"
                required
              />
            </div>
          </div>
          
          {/* Repetition Pattern */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Wiederholungsmuster</label>
            <div className="grid grid-cols-2 gap-2">
              <div 
                className={`p-3 border rounded cursor-pointer ${
                  repetitionPattern === 'once' ? 'bg-primary text-white' : 'bg-white'
                }`}
                onClick={() => setRepetitionPattern('once')}
              >
                Einmalig (durchgehend)
              </div>
              <div 
                className={`p-3 border rounded cursor-pointer ${
                  repetitionPattern === 'daily' ? 'bg-primary text-white' : 'bg-white'
                }`}
                onClick={() => setRepetitionPattern('daily')}
              >
                Täglich (zu angegebenen Zeiten)
              </div>
            </div>
            
            <div className="mt-2 text-sm text-gray-600">
              {repetitionPattern === 'once' ? (
                "Diese Einschränkung gilt durchgehend vom Startdatum bis zum Enddatum."
              ) : (
                "Diese Einschränkung gilt täglich vom Startdatum bis zum Enddatum, jeweils zu den angegebenen Uhrzeiten."
              )}
            </div>
          </div>
          
          {/* Restriction Types */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Art der Einschränkung</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={restrictionTypes.includes('no_entry')}
                  onChange={() => toggleRestrictionType('no_entry')}
                  className="mr-2"
                />
                <div>
                  <div className="font-medium">Keine Einfahrt</div>
                  <div className="text-xs text-gray-600">Waggons können nicht auf das Gleis gefahren werden</div>
                </div>
              </label>
              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={restrictionTypes.includes('no_exit')}
                  onChange={() => toggleRestrictionType('no_exit')}
                  className="mr-2"
                />
                <div>
                  <div className="font-medium">Keine Ausfahrt</div>
                  <div className="text-xs text-gray-600">Waggons können nicht vom Gleis weggefahren werden</div>
                </div>
              </label>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Wählen Sie die Arten von Einschränkungen aus, die für die ausgewählten Gleise gelten sollen.
            </div>
          </div>
          
          {/* Track selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Betroffene Gleise</label>
            <div className="border rounded p-3 max-h-60 overflow-y-auto">
              {nodes.map(node => (
                <div key={node.id} className="mb-3">
                  <h3 className="font-medium text-sm mb-1">{node.name}</h3>
                  <div className="pl-4 space-y-1">
                    {tracks
                      .filter(track => track.node_id === node.id)
                      .map(track => (
                        <label key={track.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedTrackIds.includes(track.id)}
                            onChange={() => toggleTrackSelection(track.id)}
                            className="mr-2"
                          />
                          <span>{track.name}</span>
                        </label>
                      ))
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Comment */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Kommentar (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
            />
          </div>
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
              disabled={loading}
            >
              Abbrechen
            </button>
            
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
              disabled={loading}
            >
              {loading ? 'Speichern...' : (restriction ? 'Aktualisieren' : 'Erstellen')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RestrictionModal; 