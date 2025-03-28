import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project } from '@/lib/supabase';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project; // If provided, we're editing an existing project
  onSuccess: () => void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  project,
  onSuccess
}) => {
  const { supabase } = useSupabase();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6'); // Default color
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  // If project is provided, populate the form for editing
  useEffect(() => {
    if (project) {
      setName(project.name);
      setColor(project.color);
      setStartDate(formatDateForInput(project.start_date));
      setEndDate(formatDateForInput(project.end_date));
    } else {
      // Reset form for new project
      setName('');
      setColor('#3B82F6');
      setStartDate('');
      setEndDate('');
    }
    setError(null);
  }, [project, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!name.trim()) {
        throw new Error('Projektname ist erforderlich');
      }

      if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
        throw new Error('Das Enddatum muss nach dem Startdatum liegen');
      }

      const projectData = { 
        name, 
        color,
        start_date: startDate ? parseInputDate(startDate) : null,
        end_date: endDate ? parseInputDate(endDate) : null
      };

      if (project) {
        // Update existing project
        const { error: updateError } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', project.id);

        if (updateError) throw updateError;
      } else {
        // Create new project
        const { error: insertError } = await supabase
          .from('projects')
          .insert(projectData);

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
            {project ? 'Projekt bearbeiten' : 'Neues Projekt'}
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
              Projektname
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
            <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
              Farbe
            </label>
            <div className="flex items-center space-x-3">
              <input
                id="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-10 border border-gray-300 rounded"
              />
              <span className="text-sm text-gray-500">{color}</span>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Startdatum und -zeit
            </label>
            <input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: TT.MM.JJJJ hh:mm
            </p>
          </div>

          <div className="mb-6">
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Enddatum und -zeit
            </label>
            <input
              id="endDate"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: TT.MM.JJJJ hh:mm
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
              {loading ? 'Speichern...' : project ? 'Aktualisieren' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectModal; 