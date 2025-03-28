'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Restriction, RestrictionType, Node } from '@/lib/supabase';

export default function RestrictionsPage() {
  const { supabase } = useSupabase();
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch restrictions and nodes in parallel
        const [restrictionsResponse, nodesResponse] = await Promise.all([
          supabase
            .from('restrictions')
            .select('*')
            .order('from_datetime', { ascending: false }),
          supabase
            .from('nodes')
            .select('*')
            .order('name')
        ]);
        
        if (restrictionsResponse.error) throw restrictionsResponse.error;
        if (nodesResponse.error) throw nodesResponse.error;
        
        setRestrictions(restrictionsResponse.data || []);
        setNodes(nodesResponse.data || []);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  // Function to format dates for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Function to get restriction type display text
  const getRestrictionTypeText = (type: RestrictionType) => {
    return type === 'no_entry' ? 'Kein Eingang möglich' : 'Kein Ausgang möglich';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-primary">Restriktionen</h1>
        <button
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Neue Restriktion
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Lade Daten...</p>
        </div>
      ) : restrictions.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center border border-gray-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Keine Restriktionen vorhanden</h2>
          <p className="text-gray-600 mb-6">Erstellen Sie Ihre erste Restriktion.</p>
          <button
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Restriktion erstellen
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-3 px-4 text-left font-medium text-gray-600">Typ</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">Von</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">Bis</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">Wiederholung</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">Kommentar</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {restrictions.map((restriction) => (
                <tr key={restriction.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      restriction.type === 'no_entry' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {getRestrictionTypeText(restriction.type)}
                    </span>
                  </td>
                  <td className="py-3 px-4">{formatDate(restriction.from_datetime)}</td>
                  <td className="py-3 px-4">{formatDate(restriction.to_datetime)}</td>
                  <td className="py-3 px-4">
                    {restriction.recurrence !== 'none' ? restriction.recurrence : '-'}
                  </td>
                  <td className="py-3 px-4">
                    {restriction.comment || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <button className="text-primary hover:underline mr-3">
                      Details
                    </button>
                    <button className="text-gray-500 hover:text-gray-700">
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 