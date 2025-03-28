'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track } from '@/lib/supabase';
import ProjectModal from '@/components/projects/ProjectModal';
import DeleteConfirmationModal from '@/components/projects/DeleteConfirmationModal';
import ProjectUserList from '@/components/projects/users/ProjectUserList';
import NodeList from '@/components/projects/nodes/NodeList';
import TripList from '@/components/projects/trips/TripList';
import RestrictionList from '@/components/projects/restrictions/RestrictionList';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { supabase, user } = useSupabase();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    fetchProject();
  }, [params.id, supabase]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.id)
        .single();
      
      if (error) throw error;
      setProject(data);
      
      // Fetch nodes
      const { data: nodesData, error: nodesError } = await supabase
        .from('nodes')
        .select('*')
        .eq('project_id', params.id)
        .order('name');
      
      if (nodesError) throw nodesError;
      setNodes(nodesData || []);
      
      // Fetch tracks if we have nodes
      if (nodesData && nodesData.length > 0) {
        const nodeIds = nodesData.map(node => node.id);
        const { data: tracksData, error: tracksError } = await supabase
          .from('tracks')
          .select('*')
          .in('node_id', nodeIds)
          .order('name');
        
        if (tracksError) throw tracksError;
        setTracks(tracksData || []);
      }
    } catch (error) {
      console.error('Error loading project:', error);
      showNotification('Fehler beim Laden des Projekts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleOpenDeleteModal = () => {
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
  };

  const handleProjectSuccess = () => {
    fetchProject();
    showNotification('Projekt erfolgreich aktualisiert', 'success');
  };

  const handleDeleteSuccess = () => {
    router.push('/projects');
  };

  const navigateToTimelineView = () => {
    router.push(`/projects/${params.id}/timeline`);
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Projektdaten...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg p-8 text-center border border-gray-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Projekt nicht gefunden</h2>
          <p className="text-gray-600 mb-6">Das angeforderte Projekt konnte nicht gefunden werden.</p>
          <button
            onClick={() => router.push('/projects')}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Zurück zur Projektübersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.push('/projects')}
          className="text-primary hover:underline mb-4 flex items-center"
        >
          <span>← Zurück zur Projektübersicht</span>
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div 
          className={`mb-6 p-4 rounded-md ${
            notification.type === 'success' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Project header */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm mb-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center">
            <div 
              className="w-12 h-12 rounded-full mr-4" 
              style={{ backgroundColor: project.color }}
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              {(project.start_date || project.end_date) && (
                <div className="mt-2 text-gray-600">
                  <p><span className="font-medium">Zeitfenster:</span> {formatDateTime(project.start_date)} - {formatDateTime(project.end_date)}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
            <button
              onClick={navigateToTimelineView}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center"
            >
              <span className="mr-2">Zeitachse</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={handleOpenModal}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Bearbeiten
            </button>
            <button
              onClick={handleOpenDeleteModal}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Löschen
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          <p>Erstellt am: {new Date(project.created_at).toLocaleDateString('de-DE')}</p>
          {project.created_at !== project.updated_at && (
            <p>Aktualisiert am: {new Date(project.updated_at).toLocaleDateString('de-DE')}</p>
          )}
        </div>
      </div>

      {/* Project users management */}
      <ProjectUserList project={project} />

      {/* Restrictions management */}
      <div className="mb-6">
        <RestrictionList 
          projectId={project.id}
          nodes={nodes}
          tracks={tracks}
        />
      </div>

      {/* Nodes and tracks management */}
      <NodeList project={project} />

      {/* Trips management */}
      <TripList project={project} />
      
      {/* Project Modal */}
      <ProjectModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        project={project}
        onSuccess={handleProjectSuccess}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        project={project}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
} 