'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Container from '@/components/ui/container';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Node, Track, Project } from '@/lib/supabase';
import TrackOccupancyTimeline from '@/components/projects/tracks/TrackOccupancyTimeline';
import PageLoading from '@/components/ui/page-loading';
import Header from '@/components/dashboard/header';
import { toast } from '@/components/ui/use-toast';

export default function TimelinePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
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
          .eq('id', projectId)
          .single();

        if (projectError) throw projectError;
        setProject(projectData as Project);

        // Fetch nodes for this project
        const { data: nodesData, error: nodesError } = await supabase
          .from('nodes')
          .select('*')
          .eq('project_id', projectId)
          .order('name');

        if (nodesError) throw nodesError;
        setNodes(nodesData as Node[]);

        // Fetch tracks for this project
        const { data: tracksData, error: tracksError } = await supabase
          .from('tracks')
          .select(`
            *,
            nodes!inner(project_id)
          `)
          .eq('nodes.project_id', projectId)
          .order('name');

        if (tracksError) throw tracksError;
        setTracks(tracksData as Track[]);
      } catch (error: any) {
        console.error('Error loading timeline data:', error);
        toast({
          title: 'Fehler',
          description: 'Die Daten konnten nicht geladen werden.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchData();
    }
  }, [projectId, supabase]);

  if (loading) return <PageLoading />;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={`Zeitlinie: ${project?.name || 'Projekt'}`} />
      <Container className="flex-1 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Gleisbelegung Zeitlinie</h1>
          <p className="text-gray-500">
            Visualisierung der Gleisbelegung über einen Zeitraum. Wählen Sie den Zeitraum und die Knoten, um die Details anzuzeigen.
          </p>
        </div>

        <TrackOccupancyTimeline
          projectId={projectId}
          tracks={tracks}
          nodes={nodes}
        />
      </Container>
    </div>
  );
} 