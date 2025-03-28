'use client';

import TimelineContainer from '@/components/timeline/TimelineContainer';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Node } from '@/lib/supabase';

export default function TimelinePage() {
  const { supabase } = useSupabase();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch logistics nodes
        const { data: nodesData, error: nodesError } = await supabase
          .from('nodes')
          .select('*');
        
        if (nodesError) throw nodesError;
        setNodes(nodesData || []);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-primary mb-6">Zeitachse</h1>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Daten...</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="flex items-center mb-4">
              <h2 className="text-xl font-bold">Logistikknoten</h2>
              <div className="ml-auto">
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Alle Knoten</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <TimelineContainer>
            <div className="text-center text-gray-500 py-12">
              {nodes.length === 0 ? (
                <p>
                  Keine Logistikknoten vorhanden. Erstellen Sie zuerst Knoten und Gleise.
                </p>
              ) : (
                <p>
                  Wählen Sie einen Logistikknoten aus, um die Gleise und Waggons anzuzeigen.
                </p>
              )}
            </div>
          </TimelineContainer>
        </>
      )}
    </div>
  );
} 