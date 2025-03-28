'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project } from '@/lib/supabase';
import ProjectModal from '@/components/projects/ProjectModal';
import DeleteConfirmationModal from '@/components/projects/DeleteConfirmationModal';
import ProjectCard from '@/components/projects/ProjectCard';

export default function ProjectsPage() {
  const { supabase, user } = useSupabase();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | undefined>(undefined);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
      showNotification('Fehler beim Laden der Projekte', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [supabase]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleOpenModal = (project?: Project) => {
    setCurrentProject(project);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentProject(undefined);
  };

  const handleOpenDeleteModal = (project: Project) => {
    setCurrentProject(project);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCurrentProject(undefined);
  };

  const handleProjectSuccess = () => {
    fetchProjects();
    showNotification(
      currentProject 
        ? 'Projekt erfolgreich aktualisiert' 
        : 'Projekt erfolgreich erstellt',
      'success'
    );
  };

  const handleDeleteSuccess = () => {
    fetchProjects();
    showNotification('Projekt erfolgreich gelöscht', 'success');
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-primary">Projekte</h1>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Neues Projekt
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

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Projekte...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center border border-gray-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Keine Projekte vorhanden</h2>
          <p className="text-gray-600 mb-6">Erstellen Sie Ihr erstes Projekt, um loszulegen.</p>
          <button
            onClick={() => handleOpenModal()}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Projekt erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleOpenModal}
              onDelete={handleOpenDeleteModal}
            />
          ))}
        </div>
      )}

      {/* Project Modal */}
      <ProjectModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        project={currentProject}
        onSuccess={handleProjectSuccess}
      />

      {/* Delete Confirmation Modal */}
      {currentProject && (
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          project={currentProject}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
} 