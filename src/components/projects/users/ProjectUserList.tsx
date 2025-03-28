import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, ProjectUser } from '@/lib/supabase';
import ProjectUserModal from './ProjectUserModal';

type ProjectUserWithEmail = ProjectUser & { user_email: string };

interface ProjectUserListProps {
  project: Project;
}

const ProjectUserList: React.FC<ProjectUserListProps> = ({ project }) => {
  const { supabase, user } = useSupabase();
  const [projectUsers, setProjectUsers] = useState<ProjectUserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProjectUser, setCurrentProjectUser] = useState<ProjectUser | undefined>(undefined);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const fetchProjectUsers = async () => {
    try {
      setLoading(true);
      // Join project_users with users to get emails
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          *,
          user_email:users(email)
        `)
        .eq('project_id', project.id)
        .order('created_at');
      
      if (error) throw error;

      // Transform the data to include the user email directly
      const formattedData: ProjectUserWithEmail[] = data.map((item: any) => ({
        ...item,
        user_email: item.user_email?.email || 'Unknown'
      }));
      
      setProjectUsers(formattedData || []);
    } catch (error) {
      console.error('Error loading project users:', error);
      showNotification('Fehler beim Laden der Benutzer', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectUsers();
  }, [project.id, supabase]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleOpenModal = (projectUser?: ProjectUser) => {
    setCurrentProjectUser(projectUser);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentProjectUser(undefined);
  };

  const handleUserSuccess = () => {
    fetchProjectUsers();
    showNotification(
      currentProjectUser 
        ? 'Benutzerrechte erfolgreich aktualisiert' 
        : 'Benutzer erfolgreich hinzugefügt',
      'success'
    );
  };

  const handleRemoveUser = async (projectUser: ProjectUserWithEmail) => {
    if (!confirm(`Möchten Sie ${projectUser.user_email} wirklich aus diesem Projekt entfernen?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('project_users')
        .delete()
        .eq('id', projectUser.id);
      
      if (error) throw error;
      
      fetchProjectUsers();
      showNotification('Benutzer erfolgreich entfernt', 'success');
    } catch (error) {
      console.error('Error removing user:', error);
      showNotification('Fehler beim Entfernen des Benutzers', 'error');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'editor': return 'Bearbeiter';
      case 'viewer': return 'Betrachter';
      default: return role;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mt-6">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Projektbenutzer</h2>
        <button
          onClick={() => handleOpenModal()}
          className="px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark"
        >
          Benutzer hinzufügen
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div 
          className={`m-4 p-3 rounded-md ${
            notification.type === 'success' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}
        >
          {notification.message}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-gray-500">
          Lade Benutzer...
        </div>
      ) : projectUsers.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          Keine Benutzer diesem Projekt zugewiesen.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Benutzer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rolle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hinzugefügt am
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {projectUsers.map((projectUser) => (
                <tr key={projectUser.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {projectUser.user_email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${projectUser.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                        projectUser.role === 'editor' ? 'bg-blue-100 text-blue-800' : 
                        'bg-green-100 text-green-800'}`}>
                      {getRoleName(projectUser.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(projectUser.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(projectUser)}
                      className="text-primary hover:text-primary-dark mr-3"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => handleRemoveUser(projectUser)}
                      className="text-danger hover:text-danger-dark"
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Project User Modal */}
      <ProjectUserModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        project={project}
        projectUser={currentProjectUser}
        onSuccess={handleUserSuccess}
      />
    </div>
  );
};

export default ProjectUserList; 