import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/components/ui/use-toast';

interface NodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  node?: Node; // If provided, we're editing an existing node
  onSuccess: () => void;
}

const NodeModal: React.FC<NodeModalProps> = ({
  isOpen,
  onClose,
  project,
  node,
  onSuccess
}) => {
  const { supabase } = useSupabase();
  const [name, setName] = useState('');
  const [type, setType] = useState<'station' | 'site'>('station');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationPlanFile, setStationPlanFile] = useState<File | null>(null);
  const [stationPlanUrl, setStationPlanUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If node is provided, populate the form for editing
  useEffect(() => {
    if (node) {
      setName(node.name);
      setType(node.type || 'station');
      setStationPlanUrl(node.station_plan || null);
    } else {
      // Reset form for new node
      setName('');
      setType('station');
      setStationPlanFile(null);
      setStationPlanUrl(null);
    }
    setError(null);
  }, [node, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check if it's a PDF file
      if (file.type !== 'application/pdf') {
        toast({
          title: "Fehler",
          description: "Bitte nur PDF-Dateien hochladen",
          variant: "destructive"
        });
        return;
      }
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Fehler",
          description: "Die Datei ist zu groß (max. 10MB)",
          variant: "destructive"
        });
        return;
      }
      
      setStationPlanFile(file);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `stationplans/${uuidv4()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, file);
    
    if (uploadError) {
      throw uploadError;
    }
    
    const { data } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!name.trim()) {
        throw new Error('Knotenname ist erforderlich');
      }

      let finalStationPlanUrl = stationPlanUrl;

      // Upload new file if one was selected
      if (stationPlanFile) {
        finalStationPlanUrl = await uploadFile(stationPlanFile);
      }

      const nodeData = {
        name,
        type,
        project_id: project.id,
        station_plan: finalStationPlanUrl
      };

      if (node) {
        // Update existing node
        const { error: updateError } = await supabase
          .from('nodes')
          .update(nodeData)
          .eq('id', node.id);

        if (updateError) throw updateError;
      } else {
        // Create new node
        const { error: insertError } = await supabase
          .from('nodes')
          .insert(nodeData);

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
            {node ? 'Logistikknoten bearbeiten' : 'Neuer Logistikknoten'}
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
              Knotenname
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
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Knotentyp
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as 'station' | 'site')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="station">Bahnhof</option>
              <option value="site">Baustelle</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="stationPlan" className="block text-sm font-medium text-gray-700 mb-1">
              Stationsplan (PDF)
            </label>
            <input
              id="stationPlan"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              ref={fileInputRef}
            />
            {stationPlanUrl && (
              <div className="mt-2">
                <a
                  href={stationPlanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Aktueller Stationsplan anzeigen
                </a>
              </div>
            )}
            {stationPlanFile && (
              <div className="mt-2 text-sm text-gray-600">
                Neue Datei ausgewählt: {stationPlanFile.name}
              </div>
            )}
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
              {loading ? 'Speichern...' : node ? 'Aktualisieren' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NodeModal; 