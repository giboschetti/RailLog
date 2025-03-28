import { Project } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onEdit, onDelete }) => {
  const router = useRouter();
  
  // Format the date to a readable format
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Format the date and time to a readable format
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return `${date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })} ${date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  const handleViewDetails = () => {
    router.push(`/projects/${project.id}`);
  };

  const handleOpenTimeline = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/projects/${project.id}/timeline`);
  };

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center mb-4 cursor-pointer" onClick={handleViewDetails}>
        <div 
          className="w-8 h-8 rounded-full mr-3" 
          style={{ backgroundColor: project.color }}
        />
        <h2 className="text-xl font-semibold">{project.name}</h2>
      </div>
      
      <div className="text-sm text-gray-600 mb-4">
        {(project.start_date || project.end_date) && (
          <div className="mb-3 p-2 bg-gray-50 rounded">
            <p className="font-medium mb-1">Zeitfenster:</p>
            <p>Von: {formatDateTime(project.start_date)}</p>
            <p>Bis: {formatDateTime(project.end_date)}</p>
          </div>
        )}
        <p>Erstellt am: {formatDate(project.created_at)}</p>
        {project.created_at !== project.updated_at && (
          <p>Aktualisiert am: {formatDate(project.updated_at)}</p>
        )}
      </div>
      
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          onClick={handleOpenTimeline}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center"
        >
          <span className="mr-1">Zeitachse</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={handleViewDetails}
          className="text-sm text-primary hover:underline"
        >
          Details
        </button>
        <button
          onClick={() => onEdit(project)}
          className="text-sm text-primary hover:underline"
        >
          Bearbeiten
        </button>
        <button
          onClick={() => onDelete(project)}
          className="text-sm text-danger hover:underline"
        >
          Löschen
        </button>
      </div>
    </div>
  );
};

export default ProjectCard; 