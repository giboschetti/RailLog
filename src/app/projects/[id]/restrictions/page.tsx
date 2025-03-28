'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track } from '@/lib/supabase';
import RestrictionList from '@/components/projects/restrictions/RestrictionList';
import { formatDateTime } from '@/lib/utils';

export default function RestrictionsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
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
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [params.id, supabase]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Daten...</p>
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
        <div className="flex items-center">
          <div 
            className="w-12 h-12 rounded-full mr-4" 
            style={{ backgroundColor: project.color }}
          />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            {(project.start_date || project.end_date) && (
              <div className="mt-2 text-gray-600">
                <p>
                  <span className="font-medium">Zeitfenster:</span>{' '}
                  {project.start_date ? formatDateTime(project.start_date) : '-'} - {project.end_date ? formatDateTime(project.end_date) : '-'}
                </p>
              </div>
            )}
          </div>
          <div className="ml-auto">
            <button
              onClick={() => router.push(`/projects/${params.id}/timeline`)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Zur Zeitachse
            </button>
          </div>
        </div>
      </div>

      {/* Restrictions List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">Einschränkungen</h2>
          <RestrictionList 
            projectId={params.id}
            nodes={nodes}
            tracks={tracks}
          />
        </div>
      </div>
    </div>
  );
} 