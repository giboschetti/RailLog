import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, ProjectUser, ProjectUserRole, User } from '@/lib/supabase';

interface ProjectUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  projectUser?: ProjectUser; // If provided, we're editing an existing project user
  onSuccess: () => void;
}

const ProjectUserModal: React.FC<ProjectUserModalProps> = ({
  isOpen,
  onClose,
  project,
  projectUser,
  onSuccess
}) => {
  const { supabase } = useSupabase();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [role, setRole] = useState<ProjectUserRole>('viewer');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('email');
        
        if (error) throw error;
        setUsers(data || []);
      } catch (err: any) {
        console.error('Error loading users:', err);
        setError('Fehler beim Laden der Benutzer');
      } finally {
        setLoadingUsers(false);
      }
    };

    if (isOpen) {
      fetchUsers();
    }
  }, [supabase, isOpen]);

  // If editing an existing project user, populate the form
  useEffect(() => {
    if (projectUser) {
      setSelectedUserId(projectUser.user_id);
      setRole(projectUser.role);
    } else {
      // Reset form for new project user
      setSelectedUserId('');
      setRole('viewer');
    }
    setError(null);
  }, [projectUser, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!selectedUserId) {
        throw new Error('Bitte wählen Sie einen Benutzer aus');
      }

      const projectUserData = {
        project_id: project.id,
        user_id: selectedUserId,
        role,
      };

      if (projectUser) {
        // Update existing project user
        const { error: updateError } = await supabase
          .from('project_users')
          .update(projectUserData)
          .eq('id', projectUser.id);

        if (updateError) throw updateError;
      } else {
        // Check if user is already assigned to this project
        const { data: existingUser, error: checkError } = await supabase
          .from('project_users')
          .select('*')
          .eq('project_id', project.id)
          .eq('user_id', selectedUserId)
          .single();
          
        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }
        
        if (existingUser) {
          throw new Error('Dieser Benutzer ist bereits dem Projekt zugewiesen');
        }

        // Create new project user
        const { error: insertError } = await supabase
          .from('project_users')
          .insert(projectUserData);

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
            {projectUser ? 'Benutzerrechte bearbeiten' : 'Benutzer hinzufügen'}
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
            <label htmlFor="user" className="block text-sm font-medium text-gray-700 mb-1">
              Benutzer
            </label>
            <select
              id="user"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={!!projectUser || loadingUsers}
            >
              <option value="">Benutzer auswählen</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
            {loadingUsers && <p className="text-sm text-gray-500 mt-1">Lade Benutzer...</p>}
          </div>

          <div className="mb-6">
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Rolle
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as ProjectUserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="admin">Administrator</option>
              <option value="editor">Bearbeiter</option>
              <option value="viewer">Betrachter</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              • Administrator: Kann alles bearbeiten und Benutzer verwalten
              <br />
              • Bearbeiter: Kann Projektdaten bearbeiten
              <br />
              • Betrachter: Kann Projektdaten nur ansehen
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
              {loading ? 'Speichern...' : projectUser ? 'Aktualisieren' : 'Hinzufügen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectUserModal; 