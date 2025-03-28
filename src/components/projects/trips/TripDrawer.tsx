import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Trip, Project, Node, Track, Wagon } from '@/lib/supabase';
import { X as XIcon, Edit as EditIcon, Trash as TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import TripModal from './TripModal';
import { useToast } from '@/components/ui/use-toast';

interface TripDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  onTripUpdated: () => void;
  project: Project;
}

const TripDrawer: React.FC<TripDrawerProps> = ({
  isOpen,
  onClose,
  tripId,
  onTripUpdated,
  project
}) => {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [wagons, setWagons] = useState<Wagon[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sourceNodeName, setSourceNodeName] = useState<string | null>(null);
  const [destNodeName, setDestNodeName] = useState<string | null>(null);
  const [sourceTrackName, setSourceTrackName] = useState<string | null>(null);
  const [destTrackName, setDestTrackName] = useState<string | null>(null);
  const [tripWagons, setTripWagons] = useState<any[]>([]);

  // Fetch trip details when the drawer opens
  useEffect(() => {
    if (isOpen && tripId) {
      fetchTripDetails();
      fetchProjectData();
    }
  }, [isOpen, tripId]);

  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch trip with track and wagon information
      const { data, error } = await supabase
        .from('trips')
        .select(`
          *,
          source_track:tracks!source_track_id(
            id, name, 
            node:nodes!inner(id, name)
          ),
          dest_track:tracks!dest_track_id(
            id, name, 
            node:nodes!inner(id, name)
          ),
          trip_wagons(
            id,
            wagon:wagons(
              id, number, length, content, type_id, construction_site_id,
              wagon_type:wagon_types(id, name, default_length)
            )
          )
        `)
        .eq('id', tripId)
        .single();

      if (error) throw error;

      if (data) {
        setTrip(data);
        
        // Extract track and node names
        if (data.source_track) {
          setSourceTrackName(data.source_track.name);
          if (data.source_track.node) {
            setSourceNodeName(data.source_track.node.name);
          }
        }

        if (data.dest_track) {
          setDestTrackName(data.dest_track.name);
          if (data.dest_track.node) {
            setDestNodeName(data.dest_track.node.name);
          }
        }

        // Extract wagons
        const wagons = data.trip_wagons
          .filter(tw => tw.wagon)
          .map(tw => tw.wagon);
        setTripWagons(wagons);
      }
    } catch (err: any) {
      console.error('Error fetching trip details:', err);
      setError(err.message || 'Fehler beim Laden der Fahrtdetails');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectData = async () => {
    try {
      // Fetch nodes for this project
      const { data: nodesData, error: nodesError } = await supabase
        .from('nodes')
        .select('*')
        .eq('project_id', project.id);

      if (nodesError) throw nodesError;
      setNodes(nodesData || []);

      // Fetch tracks for this project's nodes
      if (nodesData && nodesData.length > 0) {
        const nodeIds = nodesData.map(node => node.id);
        
        const { data: tracksData, error: tracksError } = await supabase
          .from('tracks')
          .select('*')
          .in('node_id', nodeIds);

        if (tracksError) throw tracksError;
        setTracks(tracksData || []);
      }

      // Fetch wagons for this project
      const { data: wagonsData, error: wagonsError } = await supabase
        .from('wagons')
        .select('*, wagon_types(*)')
        .eq('project_id', project.id);

      if (wagonsError) throw wagonsError;
      setWagons(wagonsData || []);
    } catch (err: any) {
      console.error('Error fetching project data:', err);
    }
  };

  const handleEditTrip = () => {
    setIsEditModalOpen(true);
  };

  const handleTripUpdated = () => {
    fetchTripDetails();
    onTripUpdated();
    setIsEditModalOpen(false);
  };

  const handleDeleteTrip = async () => {
    if (!trip) return;
    
    try {
      setIsDeleting(true);

      // Delete trip wagons first
      const { error: tripWagonsError } = await supabase
        .from('trip_wagons')
        .delete()
        .eq('trip_id', trip.id);

      if (tripWagonsError) throw tripWagonsError;

      // Then delete the trip
      const { error: tripError } = await supabase
        .from('trips')
        .delete()
        .eq('id', trip.id);

      if (tripError) throw tripError;

      toast({
        title: "Fahrt gelöscht",
        description: "Die Fahrt wurde erfolgreich gelöscht",
        variant: "default"
      });

      onTripUpdated();
      onClose();
    } catch (err: any) {
      console.error('Error deleting trip:', err);
      toast({
        title: "Fehler",
        description: err.message || 'Fehler beim Löschen der Fahrt',
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getTripTypeLabel = (type: string) => {
    switch (type) {
      case 'delivery': return 'Lieferung';
      case 'departure': return 'Abfahrt';
      case 'internal': return 'Interne Bewegung';
      default: return type;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out overflow-auto">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Fahrtdetails</h3>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100"
        >
          <XIcon size={20} />
        </button>
      </div>

      {loading ? (
        <div className="p-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-500">Lade Fahrtdetails...</p>
        </div>
      ) : error ? (
        <div className="p-4 text-center text-red-500">
          <p>{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={fetchTripDetails}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : trip ? (
        <div className="p-4 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{getTripTypeLabel(trip.type)}</h2>
              <p className="text-gray-600">{formatDateTime(trip.datetime)}</p>
              <span className={`text-xs px-2 py-1 rounded mt-2 inline-block ${
                trip.is_planned 
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {trip.is_planned ? 'Geplant' : 'Ausgeführt'}
              </span>
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditTrip}
                disabled={isDeleting}
              >
                <EditIcon size={16} className="mr-1" /> Bearbeiten
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteTrip}
                disabled={isDeleting}
              >
                <TrashIcon size={16} className="mr-1" /> {isDeleting ? 'Löschen...' : 'Löschen'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Details</h3>
            {trip.transport_plan_number && (
              <div className="text-sm">
                <span className="font-medium">Transportplan:</span> {trip.transport_plan_number}
              </div>
            )}
            {trip.type !== 'delivery' && sourceTrackName && (
              <div className="text-sm">
                <span className="font-medium">Von:</span> {trip.type === 'internal' && sourceNodeName ? (
                  <span>{sourceNodeName}, Gleis {sourceTrackName}</span>
                ) : (
                  sourceTrackName
                )}
              </div>
            )}
            {trip.type !== 'departure' && destTrackName && (
              <div className="text-sm">
                <span className="font-medium">Nach:</span> {trip.type === 'internal' && destNodeName ? (
                  <span>{destNodeName}, Gleis {destTrackName}</span>
                ) : (
                  destTrackName
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Waggons</h3>
            {tripWagons.length === 0 ? (
              <p className="text-sm text-gray-500">Keine Waggons für diese Fahrt</p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">
                  Gesamt: {tripWagons.length} Waggons, {
                    tripWagons.reduce((sum, w) => sum + (w.length || 0), 0)
                  }m Gesamtlänge
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Typ
                        </th>
                        <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nummer
                        </th>
                        <th scope="col" className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Länge
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tripWagons.map(wagon => (
                        <tr key={wagon.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2 whitespace-nowrap text-sm">
                            {wagon.wagon_type?.name || 'Unbekannt'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-sm">
                            {wagon.number || '-'}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-sm">
                            {wagon.length} m
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500">
          <p>Keine Fahrdetails gefunden</p>
        </div>
      )}

      {/* Edit Trip Modal */}
      {isEditModalOpen && trip && (
        <TripModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleTripUpdated}
          project={project}
          nodes={nodes}
          tracks={tracks}
          wagons={wagons}
          trip={trip}
        />
      )}
    </div>
  );
};

export default TripDrawer; 