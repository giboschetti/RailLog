import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { WagonGroup, WagonType, Wagon } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface WagonGroupFormProps {
  onAddGroup: (group: WagonGroup) => void;
  projectId: string;
  wagonTypes?: WagonType[];
}

const WagonGroupForm: React.FC<WagonGroupFormProps> = ({ 
  onAddGroup, 
  projectId, 
  wagonTypes: propWagonTypes
}) => {
  const { supabase } = useSupabase();
  const [wagonTypes, setWagonTypes] = useState<WagonType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [content, setContent] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  // Fetch wagon types on component mount, unless provided as props
  useEffect(() => {
    // If wagon types are provided as props, use those instead of fetching
    if (propWagonTypes && propWagonTypes.length > 0) {
      setWagonTypes(propWagonTypes);
      // Set default selected type if available
      if (propWagonTypes.length > 0) {
        setSelectedTypeId(propWagonTypes[0].id);
      }
      setLoading(false);
      return;
    }

    const fetchWagonTypes = async () => {
      try {
        setLoading(true);
        setDebugInfo('Fetching wagon types...');
        console.log('Fetching wagon types...');
        
        // First, check if we can access Supabase
        const { data: testData, error: testError } = await supabase
          .from('wagon_types')
          .select('count');
        
        if (testError) {
          console.error('Error testing connection:', testError);
          setFetchError(`Connection error: ${testError.message}`);
          setDebugInfo(`Connection test failed: ${JSON.stringify(testError)}`);
          throw testError;
        }
        
        setDebugInfo(`Connection test: ${JSON.stringify(testData)}`);
        console.log('Connection test:', testData);
        
        // Now fetch all wagon types
        const { data, error } = await supabase
          .from('wagon_types')
          .select('*');
        
        if (error) {
          console.error('Error fetching wagon types:', error);
          setFetchError(`Error: ${error.message}`);
          setDebugInfo(`Fetch error: ${JSON.stringify(error)}`);
          throw error;
        }
        
        setDebugInfo(`Wagon types data: ${JSON.stringify(data)}`);
        console.log('Wagon types data:', data);
        
        if (!data || data.length === 0) {
          setDebugInfo('No wagon types found in database');
          console.warn('No wagon types found in database');
        } else {
          setDebugInfo(`Found ${data.length} wagon types`);
          console.log(`Found ${data.length} wagon types`);
        }
        
        setWagonTypes(data || []);
        
        // Set default selected type if available
        if (data && data.length > 0) {
          setSelectedTypeId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading wagon types:', error);
        setDebugInfo(`Error: ${JSON.stringify(error)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWagonTypes();
  }, [supabase]);

  const handleAddGroup = () => {
    console.log('WagonGroupForm: handleAddGroup called with quantity:', quantity);
    
    // Create a temporary type if no types available
    if (wagonTypes.length === 0) {
      const tempTypeId = 'temp-type-' + Date.now();
      console.log('WagonGroupForm: Creating group with temporary type ID:', tempTypeId);
      
      // Create initialized wagon objects for each wagon in the group
      const initializedWagons = Array(quantity).fill(0).map((_, index) => {
        const wagonId = uuidv4();
        console.log(`WagonGroupForm: Creating temporary wagon ${index + 1}/${quantity} with ID:`, wagonId);
        return {
          id: wagonId,
          type_id: tempTypeId,
          number: null,
          content,
          project_id: projectId,
          length: 20, // Default length when no type is available
          construction_site_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as unknown as Wagon;
      });
      
      const newGroup: WagonGroup = {
        id: `group-${uuidv4()}`,
        wagonTypeId: tempTypeId,
        quantity,
        content,
        wagons: initializedWagons
      };
      
      console.log('WagonGroupForm: Adding group with temporary type and initialized wagons:', newGroup);
      console.log('WagonGroupForm: Number of wagons created:', initializedWagons.length);
      console.log('WagonGroupForm: Wagons array contents:', JSON.stringify(initializedWagons));
      
      onAddGroup(newGroup);
      setContent('');
      setQuantity(1);
      return;
    }
    
    // Use the selected type or the first available one
    const actualTypeId = selectedTypeId || wagonTypes[0].id;
    
    if (!actualTypeId) {
      console.error('No type ID available');
      setFetchError('Fehler: Kein Waggontyp verfügbar');
      return;
    }
    
    const selectedType = wagonTypes.find(type => type.id === actualTypeId);
    console.log('WagonGroupForm: Selected type:', selectedType);
    
    // Create initialized wagon objects for each wagon in the group
    const initializedWagons = Array(quantity).fill(0).map((_, index) => {
      const wagonId = uuidv4();
      console.log(`WagonGroupForm: Creating wagon ${index + 1}/${quantity} with ID:`, wagonId);
      return {
        id: wagonId,
        type_id: actualTypeId,
        number: null, // Explicitly set to null rather than undefined
        length: selectedType?.default_length || 0,
        content,
        project_id: projectId,
        construction_site_id: null, // Explicitly set construction_site_id to null
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as unknown as Wagon;
    });
    
    const newGroup: WagonGroup = {
      id: `group-${uuidv4()}`,
      wagonTypeId: actualTypeId,
      quantity,
      content,
      wagons: initializedWagons
    };
    
    console.log('WagonGroupForm: Adding group with initialized wagons:', newGroup);
    console.log('WagonGroupForm: Number of wagons created:', initializedWagons.length);
    console.log('WagonGroupForm: Wagons array contents:', JSON.stringify(initializedWagons));
    
    onAddGroup(newGroup);
    
    // Reset form for next entry
    setContent('');
    setQuantity(1);
  };

  if (loading) {
    return <div className="text-center py-4">Lade Waggontypen...</div>;
  }

  return (
    <div className="mb-4 p-4 border border-gray-200 rounded-md bg-gray-50">
      <h3 className="text-sm font-medium mb-3">Waggons hinzufügen</h3>
      
      {fetchError && (
        <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {fetchError}
        </div>
      )}
      
      {debugInfo && process.env.NODE_ENV === 'development' && (
        <div className="mb-3 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 overflow-x-auto max-h-32">
          <pre>{debugInfo}</pre>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label htmlFor="wagonType" className="block text-xs font-medium text-gray-700 mb-1">
            Waggontyp {wagonTypes.length === 0 && '(Keine Typen verfügbar)'}
          </label>
          <select
            id="wagonType"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            disabled={wagonTypes.length === 0}
          >
            {wagonTypes.length === 0 ? (
              <option value="">Keine Typen verfügbar</option>
            ) : (
              wagonTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.default_length}m)
                </option>
              ))
            )}
          </select>
        </div>
        
        <div>
          <label htmlFor="quantity" className="block text-xs font-medium text-gray-700 mb-1">
            Anzahl
          </label>
          <input
            id="quantity"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        
        <div>
          <label htmlFor="content" className="block text-xs font-medium text-gray-700 mb-1">
            Inhalt
          </label>
          <input
            id="content"
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            placeholder="z.B. Schotter, Schienen, Schwellen..."
          />
        </div>
      </div>
      
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAddGroup}
          className="px-3 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary-dark"
        >
          Hinzufügen
        </button>
      </div>
    </div>
  );
};

export default WagonGroupForm; 