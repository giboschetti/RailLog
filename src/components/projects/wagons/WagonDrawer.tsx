import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Wagon, WagonType, Node } from '@/lib/supabase';
import { X as XIcon, Edit as EditIcon, Save as SaveIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea';

interface WagonDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wagonId: string;
  onWagonUpdated: () => void;
  projectId: string;
}

const WagonDrawer: React.FC<WagonDrawerProps> = ({
  isOpen,
  onClose,
  wagonId,
  onWagonUpdated,
  projectId
}) => {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [wagon, setWagon] = useState<Wagon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wagonTypes, setWagonTypes] = useState<WagonType[]>([]);
  const [constructionSites, setConstructionSites] = useState<Node[]>([]);
  
  // Edit form state
  const [formData, setFormData] = useState({
    number: '',
    type_id: '',
    content: '',
    length: 0,
    construction_site_id: ''
  });

  // Fetch wagon details when the drawer opens
  useEffect(() => {
    if (isOpen && wagonId) {
      fetchWagonDetails();
      fetchWagonTypes();
      fetchConstructionSites();
    }
  }, [isOpen, wagonId]);

  const fetchWagonDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch wagon with all related information
      const { data, error } = await supabase
        .from('wagons')
        .select(`
          *,
          wagon_types(*),
          construction_site:nodes(id, name)
        `)
        .eq('id', wagonId)
        .single();

      if (error) throw error;

      if (data) {
        setWagon(data);
        // Initialize form data with wagon details
        setFormData({
          number: data.number || '',
          type_id: data.type_id || '',
          content: data.content || '',
          length: data.length || 0,
          construction_site_id: data.construction_site_id || ''
        });
      }
    } catch (err: any) {
      console.error('Error fetching wagon details:', err);
      setError(err.message || 'Fehler beim Laden der Waggon-Details');
    } finally {
      setLoading(false);
    }
  };

  const fetchWagonTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('wagon_types')
        .select('*')
        .order('name');

      if (error) throw error;
      setWagonTypes(data || []);
    } catch (err) {
      console.error('Error fetching wagon types:', err);
    }
  };

  const fetchConstructionSites = async () => {
    try {
      const { data, error } = await supabase
        .from('nodes')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', 'site')
        .order('name');

      if (error) throw error;
      setConstructionSites(data || []);
    } catch (err) {
      console.error('Error fetching construction sites:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'length' ? parseFloat(value) || 0 : value
    });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const typeId = e.target.value;
    setFormData({
      ...formData,
      type_id: typeId
    });

    // Update length based on selected wagon type's default length
    if (typeId) {
      const wagonType = wagonTypes.find(type => type.id === typeId);
      if (wagonType) {
        setFormData(prev => ({
          ...prev,
          length: wagonType.default_length
        }));
      }
    }
  };

  const handleSave = async () => {
    if (!wagon) return;

    try {
      setIsSaving(true);
      
      const updates = {
        number: formData.number || null,
        type_id: formData.type_id,
        content: formData.content || null,
        length: formData.length,
        construction_site_id: formData.construction_site_id || null
      };

      const { error } = await supabase
        .from('wagons')
        .update(updates)
        .eq('id', wagon.id);

      if (error) throw error;

      toast({
        title: "Waggon aktualisiert",
        description: "Die Waggon-Details wurden erfolgreich aktualisiert",
        variant: "default"
      });

      fetchWagonDetails();
      onWagonUpdated();
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error updating wagon:', err);
      toast({
        title: "Fehler",
        description: err.message || 'Fehler beim Aktualisieren des Waggons',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out overflow-auto">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold">Waggon-Details</h3>
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
          <p className="mt-2 text-gray-500">Lade Waggon-Details...</p>
        </div>
      ) : error ? (
        <div className="p-4 text-center text-red-500">
          <p>{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2"
            onClick={fetchWagonDetails}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : wagon ? (
        <div className="p-4 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">
                {wagon.wagon_types?.name || 'Waggon'}
                {wagon.number && <span className="text-gray-600 ml-2">#{wagon.number}</span>}
              </h2>
            </div>
            <div>
              {isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  Abbrechen
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <EditIcon size={16} className="mr-1" /> Bearbeiten
                </Button>
              )}
            </div>
          </div>

          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="type_id">Waggontyp</Label>
                <Select
                  id="type_id"
                  name="type_id"
                  value={formData.type_id}
                  onChange={handleTypeChange}
                  required
                >
                  <option value="">Waggontyp auswählen</option>
                  {wagonTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.default_length}m)
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="number">Waggonnummer (optional)</Label>
                <Input
                  id="number"
                  name="number"
                  value={formData.number}
                  onChange={handleInputChange}
                  placeholder="z.B. FWE-12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="length">Länge (m)</Label>
                <Input
                  id="length"
                  name="length"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.length}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Inhalt (optional)</Label>
                <Textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  placeholder="z.B. Schotter, Schwellen, etc."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="construction_site_id">Baustelle (optional)</Label>
                <Select
                  id="construction_site_id"
                  name="construction_site_id"
                  value={formData.construction_site_id}
                  onChange={handleInputChange}
                >
                  <option value="">Keine Baustelle</option>
                  {constructionSites.map(site => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full"
                >
                  <SaveIcon size={16} className="mr-1" /> {isSaving ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium">Details</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-medium">Typ:</div>
                  <div>{wagon.wagon_types?.name || '-'}</div>
                  
                  <div className="font-medium">Nummer:</div>
                  <div>{wagon.number || '-'}</div>
                  
                  <div className="font-medium">Länge:</div>
                  <div>{wagon.length} m</div>

                  <div className="font-medium">Inhalt:</div>
                  <div>{wagon.content || '-'}</div>

                  <div className="font-medium">Baustelle:</div>
                  <div>{wagon.construction_site?.name || '-'}</div>
                </div>
              </div>

              {/* Show recent trip history for this wagon */}
              <div className="space-y-2">
                <h3 className="font-medium">Aktuelle Position</h3>
                <div className="text-sm">
                  {wagon.track_id ? (
                    <div>Auf Gleis: {/* Need to fetch track & node name */}</div>
                  ) : (
                    <div className="text-gray-500">Aktuell nicht auf einem Gleis</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500">
          <p>Keine Waggon-Details gefunden</p>
        </div>
      )}
    </div>
  );
};

export default WagonDrawer; 