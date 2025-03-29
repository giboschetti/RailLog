import { useState, useEffect } from 'react';
import { WagonGroup, WagonType, Wagon, Node } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { v4 as uuidv4 } from 'uuid';

// Simple icon components instead of importing from libraries
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 mr-1">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

// Separate component for the dialog to avoid state sharing issues
const WagonNumberDialog = ({ 
  isOpen, 
  onClose, 
  group, 
  wagonTypes, 
  constructionSites, 
  onSave 
}: {
  isOpen: boolean;
  onClose: () => void;
  group: WagonGroup | null;
  wagonTypes: WagonType[];
  constructionSites: Node[];
  onSave: (groupId: string, wagonNumbers: string[], constructionSiteId?: string) => void;
}) => {
  const [wagonNumbers, setWagonNumbers] = useState<string[]>([]);
  const [numberInput, setNumberInput] = useState('');
  const [selectedConstructionSiteId, setSelectedConstructionSiteId] = useState<string>('');

  // Initialize the wagonNumbers when the dialog opens or the group changes
  useEffect(() => {
    if (!isOpen || !group) return;
    
    console.log('WagonNumberDialog: Initializing for group:', group.id);
    
    // Initialize with existing wagon numbers if any, or create empty slots
    let existingNumbers: string[] = [];
    
    if (group.wagons && group.wagons.length > 0) {
      existingNumbers = group.wagons.map(wagon => {
        // Try to get the number property, which might not exist
        const wagonAny = wagon as any;
        return wagonAny.number || '';
      });
      
      // Get the construction site ID from the first wagon
      if (group.wagons[0]?.construction_site_id) {
        setSelectedConstructionSiteId(group.wagons[0].construction_site_id);
      } else {
        setSelectedConstructionSiteId('');
      }
    } else {
      setSelectedConstructionSiteId('');
      
      // If there are no wagons defined but we have a quantity, create empty strings
      if (group.quantity) {
        existingNumbers = Array(group.quantity).fill('');
      }
    }
    
    // If we have fewer existing numbers than the quantity, add empty strings
    if (existingNumbers.length < group.quantity) {
      existingNumbers = [
        ...existingNumbers, 
        ...Array(group.quantity - existingNumbers.length).fill('')
      ];
    }
    
    // Set the wagon numbers
    setWagonNumbers(existingNumbers);
    setNumberInput('');
    
    console.log('WagonNumberDialog: Initialized with', existingNumbers.length, 'numbers');
  }, [isOpen, group]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setWagonNumbers([]);
      setNumberInput('');
      setSelectedConstructionSiteId('');
    }
  }, [isOpen]);

  const handleAddWagonNumber = () => {
    if (!numberInput.trim() || !group) return;
    
    // Add the new number and clear the input
    setWagonNumbers([...wagonNumbers, numberInput.trim()]);
    setNumberInput('');
  };

  const handleRemoveWagonNumber = (index: number) => {
    setWagonNumbers(wagonNumbers.filter((_, i) => i !== index));
  };

  const handleUpdateWagonNumber = (index: number, value: string) => {
    const updatedNumbers = [...wagonNumbers];
    updatedNumbers[index] = value;
    setWagonNumbers(updatedNumbers);
  };

  const handleSave = () => {
    if (!group) return;
    
    // We accept both filled and empty wagon numbers
    // Empty numbers will use temporary IDs in the backend
    onSave(group.id, wagonNumbers, selectedConstructionSiteId || undefined);
    onClose();
  };

  const getWagonTypeName = (typeId: string): string => {
    // Handle temporary types created when no wagon types are available
    if (typeId.startsWith('temp-type-')) {
      return 'Temporärer Waggontyp';
    }
    
    const type = wagonTypes.find(t => t.id === typeId);
    return type ? type.name : 'Unbekannter Typ';
  };

  if (!group) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Waggon-Nummern für {getWagonTypeName(group.wagonTypeId)}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-600">
            Die Eingabe von Waggon-Nummern ist optional. Leere Nummern erhalten eine temporäre ID.
          </p>
          
          {/* Construction site dropdown */}
          <div className="space-y-2">
            <label htmlFor="constructionSite" className="block text-sm font-medium text-gray-700">
              Baustelle
            </label>
            <select
              id="constructionSite"
              value={selectedConstructionSiteId}
              onChange={(e) => setSelectedConstructionSiteId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Keine Baustelle ausgewählt</option>
              {constructionSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            {wagonNumbers.map((number, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={number}
                  onChange={(e) => handleUpdateWagonNumber(index, e.target.value)}
                  placeholder={`Waggon ${index + 1} Nummer (optional)`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveWagonNumber(index)}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <Input
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="Neue Waggon-Nummer (optional)"
              className="flex-1"
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddWagonNumber()}
            />
            <Button
              type="button"
              onClick={handleAddWagonNumber}
            >
              Hinzufügen
            </Button>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSave}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface WagonGroupListProps {
  wagonGroups: WagonGroup[];
  wagonTypes: WagonType[];
  projectId: string;
  onRemoveGroup: (groupId: string) => void;
  onUpdateWagons: (groupId: string, wagonNumbers: string[], constructionSiteId?: string) => void;
}

const WagonGroupList: React.FC<WagonGroupListProps> = ({ 
  wagonGroups, 
  wagonTypes,
  projectId,
  onRemoveGroup, 
  onUpdateWagons 
}) => {
  const { supabase } = useSupabase();
  // IMPORTANT: Keep dialog state completely separate from selected group
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<WagonGroup | null>(null);
  const [constructionSites, setConstructionSites] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch construction sites for the current project
  useEffect(() => {
    const fetchConstructionSites = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .eq('project_id', projectId)
          .eq('type', 'site') // Only fetch nodes that are construction sites
          .order('name');
        
        if (error) throw error;
        setConstructionSites(data || []);
      } catch (err) {
        console.error('Error fetching construction sites:', err);
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchConstructionSites();
    }
  }, [projectId, supabase]);

  const handleOpenDialog = (group: WagonGroup) => {
    console.log('User clicked to open dialog for group:', group.id);
    
    // Make sure the group has a wagons array
    if (!group.wagons) {
      console.log('WagonGroupList: Group missing wagons array:', group.id);
      group.wagons = [];
    }
    
    // First set the selected group
    setSelectedGroup(group);
    
    // Then open the dialog
    setTimeout(() => {
      console.log('Opening dialog for group:', group.id);
      setDialogOpen(true);
    }, 50);
  };

  const handleCloseDialog = () => {
    console.log('Closing dialog');
    // First close the dialog
    setDialogOpen(false);
    
    // Then reset the selected group after a delay
    setTimeout(() => {
      setSelectedGroup(null);
    }, 100);
  };

  const getWagonTypeName = (typeId: string): string => {
    // Handle temporary types created when no wagon types are available
    if (typeId.startsWith('temp-type-')) {
      return 'Temporärer Waggontyp';
    }
    
    const type = wagonTypes.find(t => t.id === typeId);
    return type ? type.name : 'Unbekannter Typ';
  };

  if (wagonGroups.length === 0) {
    return <div className="text-center py-4 text-gray-500">Keine Waggongruppen hinzugefügt</div>;
  }

  return (
    <div className="space-y-3 mt-4">
      <h3 className="text-sm font-medium">Hinzugefügte Waggongruppen</h3>
      
      {wagonGroups.map(group => {
        // Defensive check for wagons array
        if (!group.wagons) {
          console.log('WagonGroupList: Group missing wagons array:', group.id);
          group.wagons = [];
        }
        
        // Get the construction site name if any wagon in the group has a construction site assigned
        let constructionSiteName = '';
        if (group.wagons && group.wagons.length > 0 && group.wagons[0]?.construction_site_id) {
          const site = constructionSites.find(cs => cs.id === group.wagons[0].construction_site_id);
          constructionSiteName = site ? site.name : '';
        }

        return (
          <div key={group.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-white">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{getWagonTypeName(group.wagonTypeId)}</span>
                <span className="text-sm text-gray-500">({group.quantity} Stück)</span>
              </div>
              <div className="text-sm text-gray-600">
                {group.content ? `Inhalt: ${group.content}` : 'Kein Inhalt angegeben'}
              </div>
              {constructionSiteName && (
                <div className="text-sm text-gray-600">
                  Baustelle: {constructionSiteName}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                {group.wagons && group.wagons.length > 0 
                  ? `${group.wagons.filter(w => (w as any).number).length} Waggon-Nummern definiert` 
                  : 'Keine Waggon-Nummern definiert'}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => handleOpenDialog(group)}
              >
                <EditIcon />
                Waggons
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="text-red-500 hover:text-red-700"
                onClick={() => onRemoveGroup(group.id)}
              >
                <XIcon />
              </Button>
            </div>
          </div>
        );
      })}

      {/* Use the separate dialog component */}
      <WagonNumberDialog
        isOpen={dialogOpen}
        onClose={handleCloseDialog}
        group={selectedGroup}
        wagonTypes={wagonTypes}
        constructionSites={constructionSites}
        onSave={onUpdateWagons}
      />
    </div>
  );
};

export default WagonGroupList; 