import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track, Trip, Wagon } from '@/lib/supabase';
import TripModal from './TripModal';

interface TripListProps {
  project: Project;
}

type TripWithDetails = Trip & {
  source_track_name?: string;
  source_node_name?: string;
  dest_track_name?: string;
  dest_node_name?: string;
  wagon_count: number;
};

const TripList: React.FC<TripListProps> = ({ project }) => {
  const { supabase } = useSupabase();
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [wagons, setWagons] = useState<Wagon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Trip | undefined>(undefined);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Fetch trips, nodes, tracks, and wagons for the project
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch nodes
      const { data: nodesData, error: nodesError } = await supabase
        .from('nodes')
        .select('*')
        .eq('project_id', project.id)
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
        
        // Fetch trips for this project's tracks
        if (tracksData && tracksData.length > 0) {
          const trackIds = tracksData.map(track => track.id);
          
          const { data: tripsData, error: tripsError } = await supabase
            .from('trips')
            .select(`
              *,
              trip_wagons:trip_wagons(wagon_id)
            `)
            .or(`source_track_id.in.(${trackIds.join(',')}),dest_track_id.in.(${trackIds.join(',')})`)
            .order('datetime', { ascending: false });
          
          if (tripsError) throw tripsError;
          
          // Enhance trips with track and node names
          const enhancedTrips: TripWithDetails[] = tripsData ? tripsData.map(trip => {
            const sourceTrack = trip.source_track_id ? tracks.find(t => t.id === trip.source_track_id) : null;
            const destTrack = trip.dest_track_id ? tracks.find(t => t.id === trip.dest_track_id) : null;
            
            const sourceNode = sourceTrack ? nodes.find(n => n.id === sourceTrack.node_id) : null;
            const destNode = destTrack ? nodes.find(n => n.id === destTrack.node_id) : null;
            
            return {
              ...trip,
              source_track_name: sourceTrack?.name,
              source_node_name: sourceNode?.name,
              dest_track_name: destTrack?.name,
              dest_node_name: destNode?.name,
              wagon_count: trip.trip_wagons ? trip.trip_wagons.length : 0
            };
          }) : [];
          
          setTrips(enhancedTrips);
        } else {
          setTrips([]);
        }
      }
      
      // Fetch wagons for this project
      const { data: wagonsData, error: wagonsError } = await supabase
        .from('wagons')
        .select('*')
        .eq('project_id', project.id);
      
      if (wagonsError) throw wagonsError;
      setWagons(wagonsData || []);
    } catch (error) {
      console.error('Error loading trip data:', error);
      showNotification('Fehler beim Laden der Daten', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  const handleOpenTripModal = (trip?: Trip) => {
    setCurrentTrip(trip);
    setIsTripModalOpen(true);
  };

  const handleCloseTripModal = () => {
    setIsTripModalOpen(false);
    setCurrentTrip(undefined);
  };

  const handleTripSuccess = () => {
    fetchData();
    showNotification(
      currentTrip 
        ? 'Fahrt erfolgreich aktualisiert' 
        : 'Fahrt erfolgreich erstellt',
      'success'
    );
  };

  const handleDeleteTrip = async (trip: Trip) => {
    if (!confirm(`Möchten Sie diese Fahrt wirklich löschen?`)) {
      return;
    }

    try {
      // Delete trip
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', trip.id);
      
      if (error) throw error;
      
      fetchData();
      showNotification('Fahrt erfolgreich gelöscht', 'success');
    } catch (error) {
      console.error('Error deleting trip:', error);
      showNotification('Fehler beim Löschen der Fahrt', 'error');
    }
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

  // Get trip type display name
  const getTripTypeName = (type: string) => {
    switch (type) {
      case 'delivery': return 'Lieferung';
      case 'departure': return 'Abfahrt';
      case 'internal': return 'Interne Bewegung';
      default: return type;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mt-6">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Fahrten</h2>
        <button
          onClick={() => handleOpenTripModal()}
          className="px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark"
        >
          Neue Fahrt
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
          Lade Fahrten...
        </div>
      ) : tracks.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          Legen Sie zuerst Logistikknoten und Gleise an, um Fahrten erstellen zu können.
        </div>
      ) : trips.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          Keine Fahrten für dieses Projekt angelegt.
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Datum/Zeit
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Von
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nach
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Waggons
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {trips.map((trip) => (
                <tr key={trip.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDateTime(trip.datetime)}</div>
                    {trip.transport_plan_number && (
                      <div className="text-xs text-gray-500">TPL: {trip.transport_plan_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${trip.type === 'delivery' ? 'bg-green-100 text-green-800' : 
                        trip.type === 'departure' ? 'bg-red-100 text-red-800' : 
                        'bg-blue-100 text-blue-800'}`}>
                      {getTripTypeName(trip.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {trip.source_track_name ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">{trip.source_track_name}</div>
                        <div className="text-xs text-gray-500">{trip.source_node_name}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {trip.dest_track_name ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">{trip.dest_track_name}</div>
                        <div className="text-xs text-gray-500">{trip.dest_node_name}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${trip.is_planned ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                      {trip.is_planned ? 'Geplant' : 'Effektiv'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {trip.wagon_count} Waggon{trip.wagon_count !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenTripModal(trip)}
                      className="text-primary hover:text-primary-dark mr-3"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => handleDeleteTrip(trip)}
                      className="text-danger hover:text-danger-dark"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trip Modal */}
      <TripModal 
        isOpen={isTripModalOpen}
        onClose={handleCloseTripModal}
        project={project}
        trip={currentTrip}
        onSuccess={handleTripSuccess}
        nodes={nodes}
        tracks={tracks}
        wagons={wagons}
      />
    </div>
  );
};

export default TripList; 