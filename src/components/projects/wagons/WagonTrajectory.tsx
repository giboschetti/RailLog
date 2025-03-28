'use client';

import { useEffect, useState } from 'react';
import { FormattedTrajectory, calculateTrajectoryStats, getWagonTrajectory } from '@/lib/trajectoryUtils';
import { Wagon } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, ArrowRight, BarChart2, ClipboardList, Loader2 } from 'lucide-react';

const moveTypeLabels = {
  initial: 'Erstplatzierung',
  delivery: 'Anlieferung',
  departure: 'Abfahrt',
  internal: 'Interne Bewegung',
  manual: 'Manuelle Änderung'
};

interface WagonTrajectoryProps {
  wagonId: string;
  wagon?: Wagon;
}

export function WagonTrajectory({ wagonId, wagon }: WagonTrajectoryProps) {
  const [trajectories, setTrajectories] = useState<FormattedTrajectory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrajectory = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getWagonTrajectory(wagonId);
        setTrajectories(data);
      } catch (err: any) {
        console.error('Error loading trajectory:', err);
        setError(err.message || 'Failed to load trajectory data');
      } finally {
        setLoading(false);
      }
    };

    if (wagonId) {
      fetchTrajectory();
    }
  }, [wagonId]);

  // Calculate statistics
  const stats = calculateTrajectoryStats(trajectories);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Lade Bewegungsdaten...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md text-red-600 text-center">
        <p className="font-medium">Fehler beim Laden der Bewegungsdaten</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (trajectories.length === 0) {
    return (
      <div className="bg-blue-50 p-4 rounded-md text-blue-600 text-center">
        <p className="font-medium">Keine Bewegungsdaten vorhanden</p>
        <p className="text-sm mt-1">
          Für diesen Waggon wurden noch keine Bewegungen aufgezeichnet.
        </p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="timeline" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="timeline" className="flex items-center">
          <ClipboardList className="w-4 h-4 mr-2" />
          Bewegungsverlauf
        </TabsTrigger>
        <TabsTrigger value="stats" className="flex items-center">
          <BarChart2 className="w-4 h-4 mr-2" />
          Statistik
        </TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Kompletter Bewegungsverlauf</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Datum</TableHead>
                    <TableHead className="w-24">Zeit</TableHead>
                    <TableHead className="w-32">Bewegungstyp</TableHead>
                    <TableHead className="w-36">Standort</TableHead>
                    <TableHead className="w-36">Vorheriger Standort</TableHead>
                    <TableHead className="w-24">Verweildauer</TableHead>
                    <TableHead className="w-28">Transport-Nr.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trajectories.map((trajectory, index) => (
                    <TableRow key={trajectory.id} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <TableCell className="font-medium">{trajectory.formattedDate}</TableCell>
                      <TableCell>{trajectory.formattedTime}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs font-medium">
                          {trajectory.moveTypeLabel}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{trajectory.node_name}</div>
                        <div className="text-sm text-gray-500">{trajectory.track_name}</div>
                      </TableCell>
                      <TableCell>
                        {trajectory.previous_node_name ? (
                          <>
                            <div className="font-medium">{trajectory.previous_node_name}</div>
                            <div className="text-sm text-gray-500">{trajectory.previous_track_name}</div>
                          </>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>{trajectory.durationAtLocation}</TableCell>
                      <TableCell>
                        {trajectory.transport_plan_number || (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Bewegungsvisualisierung</h3>
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200"></div>
              {trajectories.map((trajectory, index) => (
                <div key={trajectory.id} className="relative pl-10 pb-8">
                  <div className="absolute left-0 mt-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white">
                    {trajectory.move_type === 'departure' ? <ArrowRight className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  </div>
                  <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 hover:border-primary transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-gray-900">{trajectory.moveTypeLabel}</h4>
                        <p className="text-gray-600 mt-1">
                          {trajectory.formattedDate} {trajectory.formattedTime}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-gray-500">Verweildauer</span>
                        <p className="font-medium">{trajectory.durationAtLocation}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-gray-500">Standort</span>
                        <p className="font-medium">{trajectory.node_name} / {trajectory.track_name}</p>
                      </div>
                      {trajectory.previous_node_name && (
                        <div>
                          <span className="text-sm text-gray-500">Vorheriger Standort</span>
                          <p className="font-medium">{trajectory.previous_node_name} / {trajectory.previous_track_name}</p>
                        </div>
                      )}
                    </div>
                    {trajectory.trip_id && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-500">Transport-Nr.</span>
                        <p className="font-medium">{trajectory.transport_plan_number || 'Keine Transport-Nr.'}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="stats">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Bewegungen</CardTitle>
              <CardDescription>Übersicht der Bewegungshistorie</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Gesamtzahl Bewegungen</dt>
                  <dd className="text-2xl font-bold">{stats.totalMoves}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Anzahl besuchter Standorte</dt>
                  <dd className="text-2xl font-bold">{stats.totalLocations}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Häufigster Standort</dt>
                  <dd className="text-lg font-semibold">{stats.mostFrequentLocation}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zeitliche Analyse</CardTitle>
              <CardDescription>Zeitliche Kennzahlen der Bewegungen</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-gray-500">Erstmals gesehen</dt>
                  <dd className="text-lg font-semibold">{stats.firstSeen}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Letzte Bewegung</dt>
                  <dd className="text-lg font-semibold">{stats.lastMoved}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Durchschnittliche Verweildauer</dt>
                  <dd className="text-2xl font-bold">{stats.averageDuration}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Bewegungstypen</CardTitle>
              <CardDescription>Verteilung nach Art der Bewegung</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(moveTypeLabels).map(([key, label]) => {
                  const count = trajectories.filter(t => t.move_type === key).length;
                  const percentage = stats.totalMoves > 0 
                    ? Math.round((count / stats.totalMoves) * 100) 
                    : 0;
                  
                  return (
                    <div key={key} className="p-3 bg-gray-50 rounded-md">
                      <div className="text-sm font-medium">{label}</div>
                      <div className="mt-1 text-2xl font-bold">{count}</div>
                      <div className="text-xs text-gray-500">{percentage}%</div>
                      <div className="mt-2 h-1 bg-gray-200 rounded overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

export default WagonTrajectory; 