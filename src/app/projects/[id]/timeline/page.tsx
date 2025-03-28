'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track, Wagon } from '@/lib/supabase';
import EnhancedTimeline from '@/components/timeline/EnhancedTimeline';
import TripModal from '@/components/projects/trips/TripModal';
import { formatDateTime } from '@/lib/utils';

export default function TimelinePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [wagons, setWagons] = useState<Wagon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString());

  const fetchProjectData = async () => {
    try {
      setLoading(true);
      
      // Fetch project data
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', params.id)
        .single();
      
      if (projectError) throw projectError;
      setProject(projectData);
      
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
        
        // Fetch wagons for these tracks
        const { data: wagonsData, error: wagonsError } = await supabase
          .from('wagons')
          .select('*')
          .eq('project_id', params.id);
        
        if (wagonsError) throw wagonsError;
        setWagons(wagonsData || []);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [params.id, supabase]);

  const handleOpenTripModal = () => {
    setIsTripModalOpen(true);
  };

  const handleCloseTripModal = () => {
    setIsTripModalOpen(false);
  };

  const handleTripSuccess = () => {
    // Refresh the page or data after trip is saved
    setIsTripModalOpen(false);
    // Force a reload of the page data to show the new wagons and trips
    fetchProjectData();
    // Increment the refresh key to trigger EnhancedTimeline refresh
    setRefreshKey(prev => prev + 1);
  };

  // Handle date change from the timeline
  const handleDateChange = (date: string) => {
    setCurrentDate(date);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Zeitachsendaten...</p>
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
          onClick={() => router.push(`/projects/${params.id}`)}
          className="text-primary hover:underline mb-4 flex items-center"
        >
          <span>← Zurück zum Projekt</span>
        </button>
      </div>

      {/* Project header */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div 
              className="w-10 h-10 rounded-full mr-3" 
              style={{ backgroundColor: project.color }}
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {(project.start_date || project.end_date) && (
                <div className="text-sm text-gray-600">
                  <span>Zeitraum: {project.start_date ? formatDateTime(project.start_date) : '-'} - {project.end_date ? formatDateTime(project.end_date) : '-'}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => router.push(`/projects/${params.id}/restrictions`)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Einschränkungen
            </button>
            <button
              onClick={handleOpenTripModal}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Neue Fahrt
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Timeline */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <EnhancedTimeline 
          projectId={params.id} 
          refreshKey={refreshKey} 
          onDateChange={handleDateChange}
        />
      </div>

      {/* Trip Modal */}
      {isTripModalOpen && project && (
        <TripModal
          isOpen={isTripModalOpen}
          onClose={handleCloseTripModal}
          onTripSubmitted={handleTripSuccess}
          project={project}
          nodes={nodes}
          tracks={tracks}
          wagons={wagons}
          initialDateTime={currentDate}
        />
      )}
    </div>
  );
} 