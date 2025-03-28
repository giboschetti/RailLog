import { useState } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project } from '@/lib/supabase';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSuccess: () => void;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  project,
  onSuccess
}) => {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      // First check if there are any nodes associated with this project
      const { data: nodes, error: nodesError } = await supabase
        .from('nodes')
        .select('id')
        .eq('project_id', project.id);

      if (nodesError) throw nodesError;

      if (nodes && nodes.length > 0) {
        throw new Error(
          `Dieses Projekt hat ${nodes.length} verbundene Logistikknoten. Bitte löschen Sie zuerst die Knoten.`
        );
      }

      // If no nodes, delete the project
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (deleteError) throw deleteError;

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
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Projekt löschen</h2>
          <p className="mb-6">
            Sind Sie sicher, dass Sie das Projekt <strong>"{project.name}"</strong> löschen möchten?
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>

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
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 bg-danger text-white rounded hover:bg-danger-dark"
              disabled={loading}
            >
              {loading ? 'Löschen...' : 'Löschen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal; 