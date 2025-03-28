'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track, Trip } from '@/lib/supabase';
import Container from '@/components/ui/container';
import Header from '@/components/dashboard/header';
import PageLoading from '@/components/ui/page-loading';
import { toast } from '@/components/ui/use-toast';

export default function ProjectPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const { supabase } = useSupabase();
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjectData = async () => {
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

        // Fetch nodes count
        const { data: nodesData, error: nodesError } = await supabase
          .from('nodes')
          .select('*')
          .eq('project_id', projectId);

        if (nodesError) throw nodesError;
        setNodes(nodesData as Node[]);

        // Fetch tracks count
        const { data: tracksData, error: tracksError } = await supabase
          .from('tracks')
          .select(`
            *,
            nodes!inner(project_id)
          `)
          .eq('nodes.project_id', projectId);

        if (tracksError) throw tracksError;
        setTracks(tracksData as Track[]);

        // Fetch upcoming trips
        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('*')
          .eq('project_id', projectId)
          .gt('datetime', new Date().toISOString())
          .order('datetime', { ascending: true })
          .limit(5);

        if (tripsError) throw tripsError;
        setTrips(tripsData as Trip[]);
      } catch (error: any) {
        console.error('Error loading project data:', error);
        toast({
          title: 'Fehler',
          description: 'Die Projektdaten konnten nicht geladen werden.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchProjectData();
    }
  }, [projectId, supabase]);

  // Format date and time
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get trip type translation
  const getTripTypeTranslation = (type: string) => {
    const translations: Record<string, string> = {
      'delivery': 'Lieferung',
      'departure': 'Abfahrt',
      'internal': 'Interne Bewegung'
    };
    return translations[type] || type;
  };

  if (loading) return <PageLoading />;

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={project?.name || 'Projektübersicht'} />
      <Container className="flex-1 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">{project?.name}</h1>
          {project?.start_date && project?.end_date && (
            <p className="text-gray-500">
              Projektzeitraum: {formatDateTime(project.start_date)} bis {formatDateTime(project.end_date)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-3">Logistikknoten</h2>
            <p className="text-3xl font-bold text-primary">{nodes.length}</p>
            <p className="text-gray-500 mt-1">Knoten gesamt</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-3">Gleise</h2>
            <p className="text-3xl font-bold text-primary">{tracks.length}</p>
            <p className="text-gray-500 mt-1">Gleise gesamt</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-3">Nächste Fahrt</h2>
            {trips.length > 0 ? (
              <>
                <p className="text-xl font-semibold">{getTripTypeTranslation(trips[0].type)}</p>
                <p className="text-gray-500 mt-1">{formatDateTime(trips[0].datetime)}</p>
              </>
            ) : (
              <p className="text-gray-500">Keine anstehenden Fahrten</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Anstehende Fahrten</h2>
          
          {trips.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Typ
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Datum & Zeit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quelle
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ziel
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {trips.map((trip) => (
                    <tr key={trip.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{getTripTypeTranslation(trip.type)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{formatDateTime(trip.datetime)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {trip.source_track_id ? 'Gleis auflösen' : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {trip.dest_track_id ? 'Gleis auflösen' : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          trip.has_conflicts 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {trip.has_conflicts ? 'Mit Konflikten' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Keine anstehenden Fahrten gefunden</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Zeitlinie</h2>
            <p className="text-gray-500 mb-4">
              Visualisieren Sie die Gleisbelegung über einen Zeitraum hinweg.
            </p>
            <a 
              href={`/dashboard/projects/${projectId}/timeline`}
              className="inline-block px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Zur Zeitlinie
            </a>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Fahrten</h2>
            <p className="text-gray-500 mb-4">
              Verwalten Sie alle Lieferungen, Abfahrten und internen Bewegungen.
            </p>
            <a 
              href={`/dashboard/projects/${projectId}/trips`}
              className="inline-block px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              Zu den Fahrten
            </a>
          </div>
        </div>
      </Container>
    </div>
  );
} 