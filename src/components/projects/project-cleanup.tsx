'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/confirm-dialog';

interface ProjectCleanupProps {
  projectId: string;
  projectName: string;
  onSuccess?: () => void;
}

export function ProjectCleanup({ projectId, projectName, onSuccess }: ProjectCleanupProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { supabase } = useSupabase();
  const router = useRouter();

  const handleCleanData = async () => {
    try {
      setIsLoading(true);
      
      // Execute the SQL cleanup using a direct query
      const { error } = await supabase.rpc('clean_project_data', {
        target_project_id: projectId
      });
      
      if (error) throw error;
      
      toast({
        title: 'Projektdaten bereinigt',
        description: `Alle Waggons, Trips und Restriktionen für "${projectName}" wurden entfernt. Die Projektstruktur bleibt erhalten.`,
        variant: 'default',
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) onSuccess();
      
      // Refresh the page data
      router.refresh();
    } catch (error: any) {
      console.error('Fehler beim Bereinigen der Projektdaten:', error);
      toast({
        title: 'Fehler',
        description: error.message || 'Ein Fehler ist beim Bereinigen der Projektdaten aufgetreten',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsDialogOpen(false);
    }
  };

  return (
    <>
      <Button 
        variant="destructive" 
        onClick={() => setIsDialogOpen(true)}
        className="mt-4"
      >
        Projektdaten bereinigen
      </Button>
      
      <ConfirmDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Projektdaten bereinigen"
        description={
          <>
            <p>Dies entfernt dauerhaft alle Waggons, Trips und Restriktionen für "{projectName}".</p>
            <p className="mt-2">Die Projektstruktur (Knoten und Gleise) bleibt erhalten.</p>
            <p className="mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          </>
        }
        confirmText={isLoading ? "Bereinige..." : "Daten bereinigen"}
        cancelText="Abbrechen"
        onConfirm={handleCleanData}
        variant="destructive"
      />
    </>
  );
} 