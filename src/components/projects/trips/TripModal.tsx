import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Project, Node, Track, Trip, TripType, Wagon, WagonGroup, WagonType } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/components/ui/use-toast';
import WagonGroupForm from './WagonGroupForm';
import WagonGroupList from './WagonGroupList';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import InternalTripWagonSelector from './InternalTripWagonSelector';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { validateDelivery } from '@/lib/tripValidation';
import { ValidationWarning } from '@/lib/tripValidation';
import ValidationWarnings from './ValidationWarnings';
import { checkTrackCapacityForTrip } from '@/lib/trackUtils';

interface TripModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  trip?: Trip; // If provided, we're editing an existing trip
  onTripSubmitted: () => void;
  nodes: Node[];
  tracks: Track[];
  wagons: Wagon[];
  initialDateTime?: string; // Optional prop to pre-fill date time
}

const TripModal: React.FC<TripModalProps> = ({
  isOpen,
  onClose,
  project,
  trip,
  onTripSubmitted,
  nodes,
  tracks,
  wagons,
  initialDateTime
}) => {
  const { supabase } = useSupabase();
  const [type, setType] = useState<TripType>('internal');
  const [dateTime, setDateTime] = useState('');
  const [sourceTrackId, setSourceTrackId] = useState<string>('');
  const [destTrackId, setDestTrackId] = useState<string>('');
  const [transportPlanNumber, setTransportPlanNumber] = useState('');
  const [transportPlanFile, setTransportPlanFile] = useState<File | null>(null);
  const [transportPlanFileUrl, setTransportPlanFileUrl] = useState<string | null>(null);
  const [isPlanned, setIsPlanned] = useState(true);
  const [wagonGroups, setWagonGroups] = useState<WagonGroup[]>([]);
  const [wagonTypes, setWagonTypes] = useState<WagonType[]>([]);
  const [selectedExistingWagons, setSelectedExistingWagons] = useState<Wagon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Capacity check states
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasCapacityIssue, setHasCapacityIssue] = useState(false);
  const [hasRestrictions, setHasRestrictions] = useState(false);
  const [capacityDetails, setCapacityDetails] = useState<any>(null);
  const [restrictionsDetails, setRestrictionsDetails] = useState<any>(null);
  const [validated, setValidated] = useState(false);

  // Add state for warnings
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);

  // Helper function to format date for input field
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().substring(0, 16); // Format: YYYY-MM-DDThh:mm
  };

  // Load wagon types on mount
  useEffect(() => {
    const fetchWagonTypes = async () => {
      try {
        console.log('TripModal: Fetching wagon types...');
        const { data, error } = await supabase
          .from('wagon_types')
          .select('*');
        
        if (error) {
          console.error('TripModal: Error fetching wagon types:', error);
          return;
        }
        
        console.log('TripModal: Wagon types data:', data);
        setWagonTypes(data || []);
      } catch (error) {
        console.error('TripModal: Error loading wagon types:', error);
      }
    };

    fetchWagonTypes();
  }, [supabase]);

  // If trip is provided, populate the form for editing
  useEffect(() => {
    if (trip) {
      setType(trip.type as TripType);
      setDateTime(formatDateForInput(trip.datetime));
      setSourceTrackId(trip.source_track_id || '');
      setDestTrackId(trip.dest_track_id || '');
      setTransportPlanNumber(trip.transport_plan_number || '');
      setTransportPlanFileUrl(trip.transport_plan_file || null);
      setIsPlanned(trip.is_planned);
      setComment((trip as any).comment || null);
      
      // Fetch wagons for this trip
      const fetchTripWagons = async () => {
        try {
          // Get wagons associated with this trip
          const { data, error } = await supabase
            .from('trip_wagons')
            .select('wagon_id, wagons(id, type_id, number, content)')
            .eq('trip_id', trip.id);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            // Group wagons by type
            const groupedWagons: Record<string, any[]> = {};
            
            data.forEach((tw) => {
              if (!tw.wagons) return;
              // We need to cast this as any because the nested join structure
              // doesn't match our type exactly
              const wagon = tw.wagons as any;
              if (!groupedWagons[wagon.type_id]) {
                groupedWagons[wagon.type_id] = [];
              }
              groupedWagons[wagon.type_id].push(wagon);
            });
            
            // Create wagon groups
            const newWagonGroups: WagonGroup[] = Object.entries(groupedWagons).map(([typeId, typeWagons]) => {
              const firstWagon = typeWagons[0];
              return {
                id: `group-${uuidv4()}`,
                wagonTypeId: typeId,
                quantity: typeWagons.length,
                content: firstWagon.content || '',
                wagons: typeWagons as unknown as Wagon[]
              };
            });
            
            setWagonGroups(newWagonGroups);
          }
        } catch (error) {
          console.error('Error fetching trip wagons:', error);
        }
      };
      
      fetchTripWagons();
    } else {
      // Reset form for new trip
      setType('internal');
      // Use initialDateTime if provided, otherwise use current time
      setDateTime(formatDateForInput(initialDateTime || new Date().toISOString()));
      setSourceTrackId('');
      setDestTrackId('');
      setTransportPlanNumber('');
      setTransportPlanFile(null);
      setTransportPlanFileUrl(null);
      setIsPlanned(true);
      setComment(null);
      setWagonGroups([]);
    }
    setError(null);
  }, [trip, isOpen, supabase, initialDateTime]);

  // Get tracks grouped by node
  const getTracksByNode = () => {
    const tracksByNode: Record<string, Track[]> = {};
    
    nodes.forEach(node => {
      tracksByNode[node.id] = tracks.filter(track => track.node_id === node.id);
    });
    
    return tracksByNode;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check if it's a PDF file
      if (file.type !== 'application/pdf') {
        toast({
          title: "Fehler",
          description: "Bitte nur PDF-Dateien hochladen",
          variant: "destructive"
        });
        return;
      }
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Fehler",
          description: "Die Datei ist zu groß (max. 10MB)",
          variant: "destructive"
        });
        return;
      }
      
      setTransportPlanFile(file);
    }
  };

  const handleAddWagonGroup = (group: WagonGroup) => {
    setWagonGroups(prev => [...prev, group]);
  };

  const handleRemoveWagonGroup = (groupId: string) => {
    setWagonGroups(prev => prev.filter(group => group.id !== groupId));
  };

  const handleUpdateWagons = (groupId: string, wagonNumbers: string[], constructionSiteId?: string) => {
    setWagonGroups(prev => 
      prev.map(group => {
        if (group.id === groupId) {
          // Find the wagon type to get the default length
          const wagonType = wagonTypes.find(type => type.id === group.wagonTypeId);
          const defaultLength = wagonType?.default_length || 0;
          
          // Create wagon objects from the numbers
          const newWagons = wagonNumbers.map(number => {
            // Generate a temporary ID for the wagon
            const tempId = uuidv4();
            
            return {
              id: tempId,
              type_id: group.wagonTypeId,
              number: number.trim() || null, // Allow null for empty number
              content: group.content,
              temp_id: tempId, // Add a temporary ID field for tracking
              // Add missing required fields for Wagon type
              length: defaultLength, // Use the default length from the wagon type
              project_id: project.id, // Set the project ID
              construction_site_id: constructionSiteId, // Set the construction site ID
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as unknown as Wagon;
          });
          
          return { ...group, wagons: newWagons };
        }
        return group;
      })
    );
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `transportplans/${uuidv4()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, file);
    
    if (uploadError) {
      throw uploadError;
    }
    
    const { data } = supabase.storage
      .from('files')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  };

  const handleExistingWagonsSelected = (wagons: Wagon[]) => {
    setSelectedExistingWagons(wagons);
    
    // Convert selected wagons to wagon groups for compatibility with existing code
    // Each wagon becomes its own group with quantity 1
    const newGroups: WagonGroup[] = wagons.map(wagon => ({
      id: `group-${uuidv4()}`,
      wagonTypeId: wagon.type_id,
      quantity: 1,
      content: wagon.content || '',
      wagons: [wagon]
    }));
    
    setWagonGroups(newGroups);
  };

  const handleSubmit = async (e: React.FormEvent, skipValidationCheck: boolean = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Validate form data
      if (!skipValidationCheck) {
        const isValid = await validateTrip();
        if (!isValid) {
          setLoading(false);
          return;
        }
      }

      // 2. Prepare trip data
      const tripData = {
        project_id: project.id,
        datetime: dateTime,
        type: type,
        source_track_id: sourceTrackId || null,
        dest_track_id: destTrackId || null,
        transport_plan_number: transportPlanNumber || null,
        transport_company: null, // Assuming no transport company is provided
        construction_site_id: null, // Assuming no construction site is provided
        is_planned: isPlanned,
        has_conflict: false, // Default value
        file_url: transportPlanFile ? await uploadFile(transportPlanFile) : null,
      };

      console.log('Submitting trip:', tripData);

      // 3. For delivery trips, pre-check capacity before creating anything
      if (type === 'delivery' && destTrackId) {
        const totalWagonLength = getWagonsLength();
        
        // Check capacity before attempting to create anything
        const capacityResult = await checkTrackCapacityForTrip(destTrackId, dateTime, totalWagonLength);
        
        if (!capacityResult.hasCapacity) {
          console.error('Track capacity check failed:', capacityResult);
          setError(`Der Zielgleis hat nicht genügend Kapazität. Verfügbar: ${capacityResult.availableLength}m, Benötigt: ${totalWagonLength}m.`);
          setLoading(false);
          return;
        }
      }

      // 4. Create or update trip
      let tripId;
      let tripError;
      
      if (trip) {
        // Update existing trip
        const { error } = await supabase
          .from('trips')
          .update(tripData)
          .eq('id', trip.id);
        
        tripId = trip.id;
        tripError = error;
      } else {
        // Create new trip
        const { data, error } = await supabase
          .from('trips')
          .insert(tripData)
          .select()
          .single();
        
        tripId = data?.id;
        tripError = error;
      }

      if (tripError || !tripId) {
        throw new Error(`Failed to ${trip ? 'update' : 'create'} trip: ${tripError?.message || 'Unknown error'}`);
      }

      // 5. Handle wagons based on trip type
      if (type === 'delivery') {
        // For delivery trips, create new wagons and link them to the trip
        try {
          const wagonsToCreate = [];
          
          // Prepare all wagon data for insertion
          for (const group of wagonGroups) {
            const wagonTypeId = group.wagonTypeId;
            const wagonQuantity = group.quantity || 1;
            const wagonContent = group.content;
            
            // Get the default length for this wagon type
            const wagonType = wagonTypes.find(type => type.id === wagonTypeId);
            
            for (let i = 0; i < wagonQuantity; i++) {
              let wagonData = {
                id: uuidv4(),
                type_id: wagonTypeId,
                length: wagonType?.default_length || 0,
                content: wagonContent || '',
                project_id: project.id,
                construction_site_id: null, // Assuming no construction site is provided
                current_track_id: destTrackId, // Set the current track ID to the destination track
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              
              wagonsToCreate.push(wagonData);
            }
          }
          
          console.log(`Creating ${wagonsToCreate.length} wagons in a single operation`);
          
          // Insert all wagons in a single operation
          if (wagonsToCreate.length > 0) {
            const { data: createdWagons, error: wagonsError } = await supabase
              .from('wagons')
              .insert(wagonsToCreate)
              .select();
            
            if (wagonsError) {
              // If creating wagons fails, we need to delete the trip
              console.error('Error creating wagons:', wagonsError);
              
              // Delete the trip if it was just created
              if (!trip) {
                await supabase.from('trips').delete().eq('id', tripId);
              }
              
              throw new Error(`Failed to create wagons: ${wagonsError.message}`);
            }
            
            // Link wagons to the trip
            if (createdWagons && createdWagons.length > 0) {
              const tripWagons = createdWagons.map(wagon => ({
                trip_id: tripId,
                wagon_id: wagon.id
              }));
              
              const { error: linkError } = await supabase
                .from('trip_wagons')
                .insert(tripWagons);
              
              if (linkError) {
                console.error('Error linking wagons to trip:', linkError);
                
                // If linking fails, delete the created wagons and trip
                if (!trip) {
                  // Delete all created wagons
                  const wagonIds = createdWagons.map(w => w.id);
                  await supabase.from('wagons').delete().in('id', wagonIds);
                  
                  // Delete the trip
                  await supabase.from('trips').delete().eq('id', tripId);
                }
                
                throw new Error(`Failed to link wagons to trip: ${linkError.message}`);
              }
            }
          }
        } catch (error: any) {
          console.error('Error in wagon creation process:', error);
          setError(`Fehler beim Erstellen der Waggons: ${error.message}`);
          setLoading(false);
          return;
        }
      } else if (type === 'departure') {
        // For departure trips, link existing wagons to the trip
        const tripWagons = selectedExistingWagons.map(wagon => ({
          trip_id: tripId,
          wagon_id: wagon.id
        }));
        
        if (tripWagons.length > 0) {
          const { error: linkError } = await supabase
            .from('trip_wagons')
            .insert(tripWagons);
          
          if (linkError) {
            console.error('Error linking wagons to departure trip:', linkError);
            
            // If linking fails and this is a new trip, delete the trip
            if (!trip) {
              await supabase.from('trips').delete().eq('id', tripId);
            }
            
            throw new Error(`Failed to link wagons to departure trip: ${linkError.message}`);
          }
        }
      } else if (type === 'internal') {
        // For internal trips, link existing wagons and update their current_track_id
        const tripWagons = selectedExistingWagons.map(wagon => ({
          trip_id: tripId,
          wagon_id: wagon.id
        }));
        
        if (tripWagons.length > 0) {
          // Link wagons to trip
          const { error: linkError } = await supabase
            .from('trip_wagons')
            .insert(tripWagons);
          
          if (linkError) {
            console.error('Error linking wagons to internal trip:', linkError);
            
            // If linking fails and this is a new trip, delete the trip
            if (!trip) {
              await supabase.from('trips').delete().eq('id', tripId);
            }
            
            throw new Error(`Failed to link wagons to internal trip: ${linkError.message}`);
          }
          
          // If the trip is executed, update the wagon's current track ID
          if (!isPlanned && destTrackId) {
            const wagonIds = selectedExistingWagons.map(w => w.id);
            
            const { error: updateError } = await supabase
              .from('wagons')
              .update({ current_track_id: destTrackId })
              .in('id', wagonIds);
            
            if (updateError) {
              console.error('Error updating wagon current_track_id:', updateError);
              // We don't need to roll back, as the trip and link are valid
              // Just log the error and show a warning
              console.warn('Wagons were not moved to the destination track due to an error');
            }
          }
        }
      }

      // Success! Close the modal and notify parent
      console.log('Trip submitted successfully');
      onTripSubmitted();
      onClose();
    } catch (error: any) {
      console.error('Error submitting trip:', error);
      setError(`Fehler beim Speichern: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get node name by track id
  const getNodeNameByTrackId = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return '';
    
    const node = nodes.find(n => n.id === track.node_id);
    return node ? node.name : '';
  };

  // Get track name by id
  const getTrackNameById = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    return track ? track.name : '';
  };

  // Calculate total length of all wagons
  const getWagonsLength = (): number => {
    return wagonGroups.reduce((total, group) => {
      const wagonType = wagonTypes.find(wt => wt.id === group.wagonTypeId);
      return total + ((wagonType?.default_length || 0) * group.quantity);
    }, 0);
  };
  
  // Simple function to check if track has enough capacity
  const checkCapacity = (
    trackLength: number,
    currentUsage: number,
    additionalLength: number
  ): { hasCapacity: boolean } => {
    // If track has no length limit (useful_length = 0), it has capacity
    if (trackLength === 0) {
      return { hasCapacity: true };
    }
    
    // Check if adding the additional length would exceed capacity
    return { hasCapacity: currentUsage + additionalLength <= trackLength };
  };

  const validateTrip = async (skipCapacityCheck: boolean = false): Promise<boolean> => {
    try {
      // Skip validation if the form was already validated
      if (validated) return true;
      
      // For internal trips, check track capacity on destination track
      if (type === 'internal' && destTrackId && wagonGroups.length > 0 && !skipCapacityCheck) {
        const wagonsLength = getWagonsLength();
        
        // Get current wagons on destination track
        const destTrackData = await getTrackDetails(destTrackId);
        if (!destTrackData) {
          toast({
            title: "Fehler",
            description: "Fehler beim Abrufen der Gleisinformationen",
            variant: "destructive"
          });
          return false;
        }
        
        // Calculate the current usage
        const currentUsage = destTrackData.wagons.reduce((sum: number, w: any) => sum + w.length, 0);
        const trackLength = destTrackData.useful_length || 0;
        
        // Calculate capacity
        const currentCapacityDetails = {
          track: {
            id: destTrackData.id,
            name: destTrackData.name,
            useful_length: trackLength
          },
          current_usage: currentUsage,
          additional_length: wagonsLength,
          total_after: currentUsage + wagonsLength,
          has_capacity: false // will be set below
        };
        
        // Check if there's enough capacity
        const capacityResult = checkCapacity(
          trackLength,
          currentUsage,
          wagonsLength
        );
        
        currentCapacityDetails.has_capacity = capacityResult.hasCapacity;
        
        setCapacityDetails(currentCapacityDetails);
        
        if (!capacityResult.hasCapacity) {
          setHasCapacityIssue(true);
          
          // Show capacity error dialog
          setShowConfirmDialog(true);
          return false;
        }
      }
      
      // Check for restrictions regardless of trip type
      const { checkTripRestrictionsSimplified } = await import('@/lib/trackUtils');
      const restrictionsCheck = await checkTripRestrictionsSimplified(
        type,
        dateTime,
        sourceTrackId,
        destTrackId
      );
      
      if (restrictionsCheck.hasRestrictions) {
        setHasRestrictions(true);
        setRestrictionsDetails(restrictionsCheck);
        setShowConfirmDialog(true);
        return false; // Return false to prevent form submission
      }
      
      return true; // No issues, validation passed
    } catch (error) {
      console.error('Error during validation:', error);
      toast({
        title: "Fehler bei der Validierung",
        description: "Es ist ein Fehler bei der Überprüfung der Fahrt aufgetreten.",
        variant: "destructive"
      });
      return false;
    }
  };

  // Helper function to get track details with wagons
  const getTrackDetails = async (trackId: string) => {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`
          id,
          name,
          useful_length,
          wagons ( id, length )
        `)
        .eq('id', trackId)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting track details:', error);
      return null;
    }
  };

  // Called when user confirms despite capacity issues
  const handleConfirmCapacityIssue = () => {
    setShowConfirmDialog(false);
    setValidated(true);
    
    // Create a synthetic event and call handleSubmit with skipValidationCheck=true
    const syntheticEvent = new Event('submit') as unknown as React.FormEvent;
    handleSubmit(syntheticEvent, true);
  };

  // Add a handler for the restriction confirmation
  const handleConfirmRestrictions = () => {
    setShowConfirmDialog(false);
    setValidated(true);
    
    // Create a synthetic event and call handleSubmit with skipValidationCheck=true
    const syntheticEvent = new Event('submit') as unknown as React.FormEvent;
    handleSubmit(syntheticEvent, true);
  };

  if (!isOpen) return null;

  const tracksByNode = getTracksByNode();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-3xl overflow-hidden my-8">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">
            {trip ? 'Fahrt bearbeiten' : 'Neue Fahrt'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <form 
          onSubmit={(e) => { 
            e.preventDefault(); // Always prevent default form submission
            handleSubmit(e); // Only call handleSubmit when the actual submit button is clicked
          }} 
          className="p-6 max-h-[80vh] overflow-y-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                Fahrttyp
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as TripType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="delivery">Lieferung</option>
                <option value="departure">Abfahrt</option>
                <option value="internal">Interne Bewegung</option>
              </select>
            </div>

            <div>
              <label htmlFor="dateTime" className="block text-sm font-medium text-gray-700 mb-1">
                Datum und Uhrzeit
              </label>
              <input
                id="dateTime"
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {(type as string) !== 'delivery' && (
              <div>
                <label htmlFor="sourceTrack" className="block text-sm font-medium text-gray-700 mb-1">
                  Quellgleis
                </label>
                <select
                  id="sourceTrack"
                  value={sourceTrackId}
                  onChange={(e) => setSourceTrackId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required={(type as string) !== 'delivery'}
                >
                  <option value="">Gleis auswählen</option>
                  {Object.entries(tracksByNode).map(([nodeId, nodeTracks]) => {
                    const node = nodes.find(n => n.id === nodeId);
                    return (
                      <optgroup key={nodeId} label={node?.name || 'Unbekannter Standort'}>
                        {nodeTracks.map(track => (
                          <option key={track.id} value={track.id}>
                            {track.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {sourceTrackId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Standort: {getNodeNameByTrackId(sourceTrackId)}
                  </p>
                )}
              </div>
            )}

            {(type as string) !== 'departure' && (
              <div>
                <label htmlFor="destTrack" className="block text-sm font-medium text-gray-700 mb-1">
                  Zielgleis
                </label>
                <select
                  id="destTrack"
                  value={destTrackId}
                  onChange={(e) => setDestTrackId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required={(type as string) !== 'departure'}
                >
                  <option value="">Gleis auswählen</option>
                  {Object.entries(tracksByNode).map(([nodeId, nodeTracks]) => {
                    const node = nodes.find(n => n.id === nodeId);
                    return (
                      <optgroup key={nodeId} label={node?.name || 'Unbekannter Standort'}>
                        {nodeTracks.map(track => (
                          <option key={track.id} value={track.id}>
                            {track.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {destTrackId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Standort: {getNodeNameByTrackId(destTrackId)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex-1">
                <label htmlFor="transportPlanNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Transport-Plan-Nummer
                </label>
                <input
                  id="transportPlanNumber"
                  type="text"
                  value={transportPlanNumber}
                  onChange={(e) => setTransportPlanNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <div className="flex-1">
                <label htmlFor="transportPlanFile" className="block text-sm font-medium text-gray-700 mb-1">
                  Transport-Plan PDF
                </label>
                <div className="flex items-center">
                  <input
                    id="transportPlanFile"
                    type="file"
                    ref={fileInputRef}
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-sm flex-1"
                  >
                    {transportPlanFile ? transportPlanFile.name : (transportPlanFileUrl ? 'Datei ersetzen' : 'Datei auswählen')}
                  </button>
                </div>
                {transportPlanFileUrl && !transportPlanFile && (
                  <a 
                    href={transportPlanFileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                  >
                    Aktuelle Datei ansehen
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center">
              <input
                id="isPlanned"
                type="checkbox"
                checked={isPlanned}
                onChange={(e) => setIsPlanned(e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="isPlanned" className="ml-2 block text-sm text-gray-700">
                Ist geplant
              </label>
            </div>
          </div>

          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold">Waggons</h3>
            
            {/* For internal trips and departures, select existing wagons from source track */}
            {(type === 'internal' || type === 'departure') && sourceTrackId ? (
              <InternalTripWagonSelector
                projectId={project.id}
                sourceTrackId={sourceTrackId}
                datetime={dateTime}
                wagonTypes={wagonTypes}
                onWagonsSelected={setSelectedExistingWagons}
              />
            ) : null}
            
            {/* For deliveries, create new wagons */}
            {type === 'delivery' && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="text-blue-600 text-sm">
                    Für Anlieferungen müssen Sie neue Waggons erstellen.
                  </p>
                </div>
                
                <WagonGroupForm 
                  onAddGroup={handleAddWagonGroup} 
                  wagonTypes={wagonTypes}
                  projectId={project.id}
                />
                
                <WagonGroupList 
                  wagonGroups={wagonGroups} 
                  onRemoveGroup={handleRemoveWagonGroup}
                  wagonTypes={wagonTypes}
                  projectId={project.id}
                  onUpdateWagons={handleUpdateWagons}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 p-3 rounded-md mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              disabled={loading}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              disabled={loading || (type === 'internal' && selectedExistingWagons.length === 0)}
            >
              {loading ? 'Speichern...' : (trip ? 'Aktualisieren' : 'Erstellen')}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation dialog for capacity/restriction issues */}
      {showConfirmDialog && validationWarnings.length > 0 ? (
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <ValidationWarnings 
              warnings={validationWarnings}
              onProceedAnyway={() => {
                setValidated(true);
                handleConfirmCapacityIssue();
              }}
              onCancel={() => setShowConfirmDialog(false)}
            />
          </DialogContent>
        </Dialog>
      ) : showConfirmDialog && (
        <ConfirmDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          title={
            hasCapacityIssue 
              ? "Kapazitätsproblem" 
              : hasRestrictions 
                ? "Gleisrestriktionen" 
                : "Hinweis"
          }
          description={
            <>
              {hasCapacityIssue && (
                <div className="mb-4">
                  <p className="text-sm text-red-600 mb-2">
                    Das Zielgleis hat nicht ausreichend Kapazität für diese Waggons.
                  </p>
                  {capacityDetails && (
                    <div className="bg-gray-100 p-3 rounded-md text-xs">
                      <p>Gleiskapazität: {capacityDetails.track.useful_length}m</p>
                      <p>Aktuelle Belegung: {capacityDetails.current_usage}m</p>
                      <p>Zusätzlich benötigt: {capacityDetails.additional_length}m</p>
                      <p>Nach der Buchung: {capacityDetails.total_after}m</p>
                    </div>
                  )}
                </div>
              )}
              
              {hasRestrictions && (
                <div className="mb-4">
                  <p className="text-sm text-red-600 mb-2">
                    Es gibt aktive Restriktionen für dieses Gleis zum gewählten Zeitpunkt.
                  </p>
                  {restrictionsDetails && restrictionsDetails.restrictions.map((r: any, i: number) => (
                    <div key={i} className="bg-gray-100 p-3 rounded-md text-xs mb-2">
                      <p>Typ: {r.restriction_type === 'no_entry' ? 'Keine Einfahrt' : 'Keine Ausfahrt'}</p>
                      <p>Betroffenes Gleis: {r.affected_track_id}</p>
                      <p>Grund: {r.grund || 'Nicht angegeben'}</p>
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-sm">
                Möchten Sie trotz der Probleme fortfahren? Diese Fahrt wird als "problematisch" markiert.
              </p>
            </>
          }
          onConfirm={hasCapacityIssue ? handleConfirmCapacityIssue : handleConfirmRestrictions}
          confirmText="Trotzdem fortfahren"
          variant="warning"
        />
      )}
    </div>
  );
};

export default TripModal; 