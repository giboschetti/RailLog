import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Node, Project, Track } from '@/lib/supabase';

interface TrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  node: Node;
  track?: Track; // If provided, we're editing an existing track
  onSuccess: () => void;
}

const TrackModal: React.FC<TrackModalProps> = ({
  isOpen,
  onClose,
  project,
  node,
  track,
  onSuccess
}) => {
  const { supabase } = useSupabase();
  const [name, setName] = useState('');
  const [length, setLength] = useState<number | ''>('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableTo, setAvailableTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to format date for input field
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().substring(0, 16); // Format: YYYY-MM-DDThh:mm
  };

  // Helper function to parse input date to ISO string
  const parseInputDate = (dateString: string) => {
    return dateString ? new Date(dateString).toISOString() : null;
  };

  // If track is provided, populate the form for editing
  useEffect(() => {
    if (track) {
      setName(track.name);
      setLength(track.useful_length || '');
      setAvailableFrom(formatDateForInput(track.available_from));
      setAvailableTo(formatDateForInput(track.available_to));
    } else {
      // Reset form for new track
      setName('');
      setLength('');
      setAvailableFrom(formatDateForInput(project.start_date)); // Default to project start
      setAvailableTo(formatDateForInput(project.end_date));     // Default to project end
    }
    setError(null);
  }, [track, isOpen, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!name.trim()) {
        throw new Error('Gleisname ist erforderlich');
      }

      if (availableFrom && availableTo && new Date(availableFrom) >= new Date(availableTo)) {
        throw new Error('Das Ende der Verfügbarkeit muss nach dem Beginn liegen');
      }

      const trackData = {
        name,
        node_id: node.id,
        useful_length: length === '' ? null : Number(length),
        available_from: availableFrom ? parseInputDate(availableFrom) : null,
        available_to: availableTo ? parseInputDate(availableTo) : null
      };

      if (track) {
        // Update existing track
        const { error: updateError } = await supabase
          .from('tracks')
          .update(trackData)
          .eq('id', track.id);

        if (updateError) throw updateError;
      } else {
        // Create new track
        const { error: insertError } = await supabase
          .from('tracks')
          .insert(trackData);

        if (insertError) throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">
            {track ? 'Gleis bearbeiten' : 'Neues Gleis'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Gleisname
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="length" className="block text-sm font-medium text-gray-700 mb-1">
              Nutzbare Länge (m)
            </label>
            <input
              id="length"
              type="number"
              min="0"
              value={length}
              onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="availableFrom" className="block text-sm font-medium text-gray-700 mb-1">
              Verfügbar von
            </label>
            <input
              id="availableFrom"
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leer lassen, um die gesamte Projektzeit zu verwenden
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="availableTo" className="block text-sm font-medium text-gray-700 mb-1">
              Verfügbar bis
            </label>
            <input
              id="availableTo"
              type="datetime-local"
              value={availableTo}
              onChange={(e) => setAvailableTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leer lassen, um die gesamte Projektzeit zu verwenden
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              disabled={loading}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
              disabled={loading}
            >
              {loading ? 'Speichern...' : track ? 'Aktualisieren' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrackModal; 