import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { TrackTimeline } from '@/components/projects/timeline/TrackTimeline';

export default async function TracksPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  
  // Fetch project details
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single();
  
  // Fetch tracks for this project
  const { data: tracks } = await supabase
    .from('tracks')
    .select('*')
    .eq('nodes.project_id', params.id)
    .order('name', { ascending: true });
  
  // Fetch wagons currently on these tracks
  const { data: wagons } = await supabase
    .from('wagons')
    .select('*')
    .eq('project_id', params.id);
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">
        Tracks - {project?.name || 'Loading...'}
      </h1>
      
      <div className="grid grid-cols-1 gap-6 mb-8">
        {/* Track Timeline with Drag and Drop support */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Track Timeline</h2>
          </div>
          
          <TrackTimelineClient 
            tracks={tracks || []} 
            wagons={wagons || []}
            projectId={params.id}
          />
          
          <div className="mt-6 bg-blue-50 p-4 rounded-md border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">
              Internal Trip Creation with Drag and Drop
            </h3>
            <p className="text-blue-700 mb-3">
              You can now create internal trips by dragging wagons between tracks:
            </p>
            <ul className="list-disc pl-5 text-blue-600 space-y-1">
              <li>Drag a wagon from its source track</li>
              <li>Drop it on the drop zone next to the destination track</li>
              <li>Confirm the trip details in the dialog</li>
              <li>System will validate capacity and create an internal trip</li>
              <li>Any capacity issues or restrictions will be shown as warnings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Client component for hydration
'use client';

function TrackTimelineClient({ 
  tracks, 
  wagons, 
  projectId 
}: { 
  tracks: any[]; 
  wagons: any[];
  projectId: string;
}) {
  return (
    <TrackTimeline 
      tracks={tracks}
      wagons={wagons}
      projectId={projectId}
    />
  );
} 