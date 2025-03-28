import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track } from '@/lib/supabase';
import NodeModal from './NodeModal';
import TrackModal from '../tracks/TrackModal';

interface NodeListProps {
  project: Project;
}

const NodeList: React.FC<NodeListProps> = ({ project }) => {
  const { supabase } = useSupabase();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<Node | undefined>(undefined);
  const [currentTrack, setCurrentTrack] = useState<Track | undefined>(undefined);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Fetch nodes and tracks for the project
  const fetchNodesAndTracks = async () => {
    try {
      setLoading(true);
      
      // Fetch all nodes for this project
      const { data: nodesData, error: nodesError } = await supabase
        .from('nodes')
        .select('*')
        .eq('project_id', project.id)
        .order('name');
      
      if (nodesError) throw nodesError;
      setNodes(nodesData || []);
      
      // Initialize expanded state
      const initialExpandedState: Record<string, boolean> = {};
      nodesData?.forEach(node => {
        initialExpandedState[node.id] = expandedNodes[node.id] || false;
      });
      setExpandedNodes(initialExpandedState);
      
      // Fetch all tracks related to these nodes
      if (nodesData && nodesData.length > 0) {
        const nodeIds = nodesData.map(node => node.id);
        const { data: tracksData, error: tracksError } = await supabase
          .from('tracks')
          .select('*')
          .in('node_id', nodeIds)
          .order('name');
        
        if (tracksError) throw tracksError;
        setTracks(tracksData || []);
      } else {
        setTracks([]);
      }
    } catch (error) {
      console.error('Error loading nodes and tracks:', error);
      showNotification('Fehler beim Laden der Daten', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodesAndTracks();
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

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleOpenNodeModal = (node?: Node) => {
    setCurrentNode(node);
    setIsNodeModalOpen(true);
  };

  const handleCloseNodeModal = () => {
    setIsNodeModalOpen(false);
    setCurrentNode(undefined);
  };

  const handleOpenTrackModal = (node: Node, track?: Track) => {
    setCurrentNode(node);
    setCurrentTrack(track);
    setIsTrackModalOpen(true);
  };

  const handleCloseTrackModal = () => {
    setIsTrackModalOpen(false);
    setCurrentTrack(undefined);
  };

  const handleNodeSuccess = () => {
    fetchNodesAndTracks();
    showNotification(
      currentNode 
        ? 'Knoten erfolgreich aktualisiert' 
        : 'Knoten erfolgreich erstellt',
      'success'
    );
  };

  const handleTrackSuccess = () => {
    fetchNodesAndTracks();
    showNotification(
      currentTrack 
        ? 'Gleis erfolgreich aktualisiert' 
        : 'Gleis erfolgreich erstellt',
      'success'
    );
  };

  const handleDeleteNode = async (node: Node) => {
    // Check if there are any tracks for this node
    const nodeTracks = tracks.filter(track => track.node_id === node.id);
    
    if (nodeTracks.length > 0) {
      if (!confirm(`Dieser Knoten enthält ${nodeTracks.length} Gleise. Möchten Sie den Knoten und alle zugehörigen Gleise wirklich löschen?`)) {
        return;
      }
    } else {
      if (!confirm(`Möchten Sie den Knoten "${node.name}" wirklich löschen?`)) {
        return;
      }
    }

    try {
      // Delete all tracks for this node first (cascade delete might not be set up)
      if (nodeTracks.length > 0) {
        const { error: tracksError } = await supabase
          .from('tracks')
          .delete()
          .eq('node_id', node.id);
        
        if (tracksError) throw tracksError;
      }
      
      // Then delete the node
      const { error: nodeError } = await supabase
        .from('nodes')
        .delete()
        .eq('id', node.id);
      
      if (nodeError) throw nodeError;
      
      fetchNodesAndTracks();
      showNotification('Knoten erfolgreich gelöscht', 'success');
    } catch (error) {
      console.error('Error deleting node:', error);
      showNotification('Fehler beim Löschen des Knotens', 'error');
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    if (!confirm(`Möchten Sie das Gleis "${track.name}" wirklich löschen?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tracks')
        .delete()
        .eq('id', track.id);
      
      if (error) throw error;
      
      fetchNodesAndTracks();
      showNotification('Gleis erfolgreich gelöscht', 'success');
    } catch (error) {
      console.error('Error deleting track:', error);
      showNotification('Fehler beim Löschen des Gleises', 'error');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  };

  // Format the date and time to a readable format
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Immer verfügbar';
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

  // Get tracks for a specific node
  const getTracksForNode = (nodeId: string) => {
    return tracks.filter(track => track.node_id === nodeId);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm mt-6">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Logistikknoten und Gleise</h2>
        <button
          onClick={() => handleOpenNodeModal()}
          className="px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark"
        >
          Neuer Knoten
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
          Lade Knoten und Gleise...
        </div>
      ) : nodes.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          Keine Logistikknoten für dieses Projekt angelegt.
        </div>
      ) : (
        <div className="p-4">
          {nodes.map((node) => (
            <div key={node.id} className="mb-4 border border-gray-200 rounded">
              <div 
                className="flex justify-between items-center p-3 bg-gray-50 cursor-pointer"
                onClick={() => toggleNodeExpanded(node.id)}
              >
                <div className="flex items-center">
                  <span className="mr-2">
                    {expandedNodes[node.id] ? '▼' : '►'}
                  </span>
                  <h3 className="font-medium">{node.name}</h3>
                  <span className="ml-2 text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full">
                    {node.type === 'station' ? 'Bahnhof' : 'Baustelle'}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenNodeModal(node);
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node);
                    }}
                    className="text-sm text-danger hover:underline"
                  >
                    Löschen
                  </button>
                </div>
              </div>
              
              {expandedNodes[node.id] && (
                <div className="p-3 border-t border-gray-200">
                  <div className="flex justify-between mb-3">
                    <div className="text-sm text-gray-500">
                      {getTracksForNode(node.id).length} Gleise
                    </div>
                    <button
                      onClick={() => handleOpenTrackModal(node)}
                      className="text-sm text-primary hover:underline"
                    >
                      Neues Gleis hinzufügen
                    </button>
                  </div>
                  
                  {getTracksForNode(node.id).length === 0 ? (
                    <div className="text-center text-gray-500 py-3">
                      Keine Gleise für diesen Knoten angelegt.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Länge
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Verfügbar von
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Verfügbar bis
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Aktionen
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {getTracksForNode(node.id).map((track) => (
                            <tr key={track.id}>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {track.name}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {track.useful_length ? `${track.useful_length} m` : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {formatDateTime(track.available_from)}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="text-sm text-gray-500">
                                  {formatDateTime(track.available_to)}
                                </div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => handleOpenTrackModal(node, track)}
                                  className="text-primary hover:text-primary-dark mr-3"
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  onClick={() => handleDeleteTrack(track)}
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Node Modal */}
      <NodeModal 
        isOpen={isNodeModalOpen}
        onClose={handleCloseNodeModal}
        project={project}
        node={currentNode}
        onSuccess={handleNodeSuccess}
      />

      {/* Track Modal */}
      {currentNode && (
        <TrackModal
          isOpen={isTrackModalOpen}
          onClose={handleCloseTrackModal}
          project={project}
          node={currentNode}
          track={currentTrack}
          onSuccess={handleTrackSuccess}
        />
      )}
    </div>
  );
};

export default NodeList; 