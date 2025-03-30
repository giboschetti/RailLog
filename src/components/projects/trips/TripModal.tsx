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
import { validateDelivery, validateInternalTrip, InternalTripData, DeliveryTripData, ValidationError } from '@/lib/tripValidation';
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
  const [type, setType] = useState<TripType>('delivery');
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

  // Add state variables for validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // Add state variables for confirmation dialog
  const [confirmDialogTitle, setConfirmDialogTitle] = useState<string>('');
  const [confirmDialogMessage, setConfirmDialogMessage] = useState<string>('');
  const [confirmDialogAction, setConfirmDialogAction] = useState<string>('');

  // Add extra state to track if form submission is in progress
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add a keyboard event handler for Escape key to close dialog
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showConfirmDialog) {
        setShowConfirmDialog(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showConfirmDialog]);

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

  // Initialize form with trip data or defaults
  useEffect(() => {
    if (!isOpen) return;
    
    if (trip) {
      // If trying to edit an internal trip, show a message and close the modal
      if (trip.type === 'internal') {
        toast({
          title: "Hinweis",
          description: "Interne Bewegungen können nur per Drag-and-Drop auf der Zeitachse bearbeitet werden.",
          variant: "default"
        });
        onClose();
        return;
      }
      
      // Load existing trip data
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
      setType('delivery');
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
    console.log('TripModal: Adding wagon group:', group);
    
    // Make sure the group has a properly initialized wagons array
    // and doesn't automatically trigger the dialog
    const wagonType = wagonTypes.find(type => type.id === group.wagonTypeId);
    const defaultLength = wagonType?.default_length || 0;
    
    // Create wagon objects based on quantity
    const wagons = Array(group.quantity || 1).fill(0).map(() => {
      const tempId = uuidv4();
      return {
        id: tempId,
        type_id: group.wagonTypeId,
        number: null, 
        content: group.content || '',
        temp_id: tempId,
        length: defaultLength,
        project_id: project.id,
        construction_site_id: null,
        current_track_id: destTrackId, // Always set track ID regardless of execution status
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as unknown as Wagon;
    });
    
    // Add the group with initialized wagons
    const newGroup: WagonGroup = {
      ...group,
      wagons // Properly typed wagons array
    };
    
    console.log('TripModal: Adding group with initialized wagons:', newGroup);
    console.log('TripModal: Number of wagons created:', wagons.length);
    console.log('TripModal: Wagons array:', wagons);
    
    // Update state with the new group
    setWagonGroups(prev => [...prev, newGroup]);
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
              current_track_id: destTrackId, // Always set track ID regardless of execution status
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
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Validate form data
      if (!skipValidationCheck) {
        const isValid = await validateTrip();
        if (!isValid) {
          setLoading(false);
          setIsSubmitting(false);
          return;
        }
      }

      // 2. Prepare trip data - using only confirmed database columns
      const tripDateTime = new Date(dateTime);
      
      // Automatically determine is_planned status based on date
      const isAutoPlanned = tripDateTime > new Date();
      
      const tripData = {
        type,
        datetime: tripDateTime.toISOString(),
        source_track_id: (type === 'departure' || type === 'internal') ? sourceTrackId : null,
        dest_track_id: (type === 'delivery' || type === 'internal') ? destTrackId : null,
        transport_plan_number: transportPlanNumber || null,
        is_planned: isAutoPlanned, // Use auto-determined value
        transport_plan_file: transportPlanFile ? await uploadFile(transportPlanFile) : transportPlanFileUrl,
        project_id: project.id,
        has_conflicts: validationWarnings.length > 0,
        comment: comment || null,
        construction_site_id: (project as any).construction_site_id || null
      };

      // Remove the id field from tripData if it's a new trip (causes issues with default uuid generation)
      if (trip) {
        // Only include ID for existing trips
        (tripData as any).id = trip.id;
      }

      console.log('Debug: Preparing trip data with fields:', Object.keys(tripData));
      console.log('Debug: Trip data values:', JSON.stringify(tripData));

      // 3. For delivery trips, pre-check capacity before creating anything
      if (type === 'delivery' && destTrackId) {
        const totalWagonLength = getWagonsLength();
        
        // Check capacity before attempting to create anything
        const capacityResult = await checkTrackCapacityForTrip(destTrackId, dateTime, totalWagonLength);
        
        if (!capacityResult.hasCapacity) {
          console.error('Track capacity check failed:', capacityResult);
          setError(`Der Zielgleis hat nicht genügend Kapazität. Verfügbar: ${capacityResult.availableLength}m, Benötigt: ${totalWagonLength}m.`);
          setLoading(false);
          setIsSubmitting(false);
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
        
        if (error) {
          console.error('Debug: Trip insert error:', error);
          console.error('Debug: Error details:', JSON.stringify(error));
          console.error('Debug: Error message:', error.message);
          console.error('Debug: Error code:', error.code);
          console.error('Debug: Error details:', error.details);
        }
        
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
            const wagonContent = group.content;
            
            // Get the default length for this wagon type
            const wagonType = wagonTypes.find(type => type.id === wagonTypeId);
            
            // Use the initialized wagons array from the group which may have numbers
            if (group.wagons && Array.isArray(group.wagons) && group.wagons.length > 0) {
              console.log(`Processing ${group.wagons.length} wagons from group with type: ${wagonTypeId}`);
              
              for (const wagon of group.wagons) {
                // Log the current wagon number being processed
                console.log(`Processing wagon with number: ${wagon.number || 'null'}`);
                
                // Determine if this is an executed trip (past date)
                const tripDate = new Date(dateTime);
                const isExecuted = tripDate <= new Date();
                
                // For executed trips, immediately set current_track_id to destination track
                let wagonData = {
                  id: uuidv4(),
                  type_id: wagonTypeId,
                  length: wagonType?.default_length || 0,
                  content: wagonContent || '',
                  project_id: project.id,
                  construction_site_id: wagon.construction_site_id || null,
                  current_track_id: destTrackId, // Always set track ID regardless of execution status
                  number: wagon.number || null, // Use the number from the wagon object
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                console.log(`Adding wagon with number: ${wagonData.number || 'null'}, current_track_id: ${wagonData.current_track_id || 'null'}`);
                wagonsToCreate.push(wagonData);
              }
            } else {
              // Fallback for cases where wagons array isn't initialized
              const wagonQuantity = group.quantity || 1;
              for (let i = 0; i < wagonQuantity; i++) {
                // Determine if this is an executed trip (past date)
                const tripDate = new Date(dateTime);
                const isExecuted = tripDate <= new Date();
                
                // For executed trips, immediately set current_track_id to destination track
                let wagonData = {
                  id: uuidv4(),
                  type_id: wagonTypeId,
                  length: wagonType?.default_length || 0,
                  content: wagonContent || '',
                  project_id: project.id,
                  construction_site_id: null,
                  current_track_id: destTrackId, // Always set track ID regardless of execution status
                  number: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                
                console.log(`Adding fallback wagon, current_track_id: ${wagonData.current_track_id || 'null'}`);
                wagonsToCreate.push(wagonData);
              }
            }
          }
          
          console.log(`Creating ${wagonsToCreate.length} wagons in a single operation`);
          
          // Insert all wagons in a single operation
          if (wagonsToCreate.length > 0) {
            console.log('Wagons to create with numbers:', wagonsToCreate.map(w => w.number));
            
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
            
            // Link wagons to the main delivery trip
            if (createdWagons && createdWagons.length > 0) {
              console.log('Created wagons with numbers:', createdWagons.map(w => w.number));
              
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
          console.error('Error creating wagons for delivery:', error);
          throw error;
        }
      } else if (type === 'departure') {
        // For departure trips, update the wagon current_track_id to null
        // and create trip_wagons records
        try {
          // Create trip_wagons records
          const tripWagons = selectedExistingWagons.map(wagon => ({
            trip_id: tripId,
            wagon_id: wagon.id
          }));
          
          if (tripWagons.length > 0) {
            // Link wagons to the trip
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
            
            // For executed departure trips, set wagon current_track_id to null
            const tripDate = new Date(dateTime);
            const isExecuted = tripDate <= new Date();
            
            if (isExecuted) {
              const wagonIds = selectedExistingWagons.map(w => w.id);
              
              const { error: updateError } = await supabase
                .from('wagons')
                .update({ current_track_id: null })
                .in('id', wagonIds);
              
              if (updateError) {
                console.error('Error updating wagon current_track_id for departure:', updateError);
                // We don't need to roll back, as the trip and link are valid
                // Just log the error and show a warning
                console.warn('Wagons current_track_id could not be updated due to an error');
              }
            }
          }
        } catch (error: any) {
          console.error('Error processing departure trip:', error);
          throw error;
        }
      }

      // Success! Close the modal and notify parent
      console.log('Trip submitted successfully');
      
      // Force refresh of any timeline displays
      if (onTripSubmitted) {
        // Add a slight delay to allow DB triggers to complete
        setTimeout(() => {
          onTripSubmitted();
        }, 500);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error submitting trip:', error);
      setError(`Fehler bei der Verarbeitung: ${error.message}`);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
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

  const validateTrip = async (): Promise<boolean> => {
    try {
      // Skip validation if the trip was already created
      if (trip) return true;
      
      // Choose validation method based on trip type
      if (type === 'delivery') {
        // Use dedicated delivery trip validation
        const deliveryData: DeliveryTripData = {
          projectId: project.id,
          dateTime: dateTime,
          destTrackId,
          wagonGroups,
          transportPlanNumber,
          isPlanned: new Date(dateTime) > new Date() // Auto-determine planned status
        };
        
        const validationResult = await validateDelivery(deliveryData);
        
        if (!validationResult.isValid) {
          if (validationResult.errors && validationResult.errors.length > 0) {
            setError(validationResult.errors[0].message);
          }
          return false;
        }
        
        // Store all warnings
        setValidationWarnings(validationResult.warnings || []);
        
        // Check for different types of warnings that need confirmation
        const restrictionWarnings = validationResult.warnings?.filter(w => w.type === 'restriction') || [];
        const capacityWarnings = validationResult.warnings?.filter(w => w.type === 'capacity') || [];
        const futureConflicts = validationResult.warnings?.filter(w => w.type === 'future_capacity_conflict') || [];
        
        if (restrictionWarnings.length > 0) {
          // Restrictions take priority over capacity warnings
          const warningMessages = restrictionWarnings.map(w => w.message).join('\n');
          setConfirmDialogMessage(`Es gibt Einschränkungen für diese Fahrt:\n\n${warningMessages}\n\nMöchten Sie trotzdem fortfahren?`);
          setConfirmDialogTitle('Einschränkungen erkannt');
          setConfirmDialogAction('restrictions');
          setShowConfirmDialog(true);
          return false; // Don't proceed until user confirms
        } else if (capacityWarnings.length > 0) {
          // Show capacity warnings if there are no restrictions
          setConfirmDialogTitle('Kapazitätsprobleme erkannt');
          setConfirmDialogAction('capacity');
          setShowConfirmDialog(true);
          return false; // Don't proceed until user confirms
        } else if (futureConflicts.length > 0) {
          // Show future capacity conflict warnings
          const conflictMessages = futureConflicts.map(w => w.message).join('\n\n');
          setConfirmDialogMessage(`Diese Lieferung hat ausreichend Kapazität zum geplanten Zeitpunkt, aber wird Konflikte mit zukünftigen Fahrten verursachen:\n\n${conflictMessages}\n\nMöchten Sie trotzdem fortfahren?`);
          setConfirmDialogTitle('Zukünftige Kapazitätskonflikte erkannt');
          setConfirmDialogAction('future_conflicts');
          setShowConfirmDialog(true);
          return false; // Don't proceed until user confirms
        }
      } else if (type === 'departure') {
        // Basic validation for departures
        if (!sourceTrackId) {
          setError('Quellgleis ist erforderlich für Abfahrten');
          return false;
        }
        
        if (selectedExistingWagons.length === 0) {
          setError('Bitte wählen Sie mindestens einen Waggon für die Abfahrt');
          return false;
        }
        
        // Check for departure restrictions
        try {
          const { checkTripRestrictionsSimplified } = await import('@/lib/trackUtils');
          const restrictionsResult = await checkTripRestrictionsSimplified(
            'departure',
            dateTime,
            sourceTrackId,
            undefined // No destination track for departures
          );
          
          if (restrictionsResult.hasRestrictions) {
            // Format restriction messages for display
            const warningMessages = restrictionsResult.restrictions.map(r => 
              `Einschränkung: ${r.comment || 'Keine Ausfahrt von diesem Gleis erlaubt'}`
            ).join('\n');
            
            setConfirmDialogMessage(`Es gibt Einschränkungen für diese Abfahrt:\n\n${warningMessages}\n\nMöchten Sie trotzdem fortfahren?`);
            setConfirmDialogTitle('Einschränkungen erkannt');
            setConfirmDialogAction('restrictions');
            setShowConfirmDialog(true);
            return false; // Don't proceed until user confirms
          }
        } catch (error: any) {
          console.error('Error checking restrictions for departure:', error);
          // Don't block submission for restriction check errors
        }
      }
      
      return true;
    } catch (error: any) {
      setError(`Validierungsfehler: ${error.message}`);
      return false;
    }
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
              <label htmlFor="tripType" className="block text-sm font-medium text-gray-700 mb-1">
                Fahrttyp
              </label>
              <select
                id="tripType"
                value={type}
                onChange={(e) => setType(e.target.value as TripType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="delivery">Lieferung</option>
                <option value="departure">Abfahrt</option>
                {/* Internal trips are now handled only through drag-and-drop */}
              </select>
              <p className="text-xs text-blue-600 mt-1">
                Interne Bewegungen können per Drag-and-Drop auf der Zeitachse erstellt werden.
              </p>
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
            <div className="bg-blue-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-blue-800 mb-1">Trip-Status Information</h4>
              <p className="text-sm text-blue-600">
                Der Status des Trips wird automatisch anhand des Datums bestimmt:
              </p>
              <ul className="text-sm text-blue-600 list-disc list-inside mt-1">
                <li>Trips in der Vergangenheit sind automatisch ausgeführt.</li>
                <li>Trips in der Zukunft sind automatisch geplant.</li>
              </ul>
              {dateTime && (
                <p className="text-sm font-medium text-blue-800 mt-2">
                  Status dieses Trips: {new Date(dateTime) > new Date() ? 'Geplant' : 'Ausgeführt'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 mt-6">
            <h3 className="text-lg font-semibold">Waggons</h3>
            
            {/* For departures, select existing wagons from source track */}
            {type === 'departure' && sourceTrackId ? (
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
                
                {/* Ensure wagon groups have properly initialized wagon arrays */}
                <WagonGroupList 
                  wagonGroups={wagonGroups.map(group => {
                    // Make sure each group has a properly initialized wagons array
                    if (!group.wagons || !Array.isArray(group.wagons) || group.wagons.length === 0) {
                      console.log('TripModal: Fixing missing wagons array for group:', group.id);
                      const wagonType = wagonTypes.find(type => type.id === group.wagonTypeId);
                      const defaultLength = wagonType?.default_length || 0;
                      
                      // Create wagon objects based on quantity
                      const wagons = Array(group.quantity || 1).fill(0).map(() => {
                        const tempId = uuidv4();
                        
                        // Determine if this is an executed trip (past date)
                        const tripDate = new Date(dateTime);
                        const isExecuted = tripDate <= new Date();
                        
                        return {
                          id: tempId,
                          type_id: group.wagonTypeId,
                          number: null, 
                          content: group.content || '',
                          temp_id: tempId,
                          length: defaultLength,
                          project_id: project.id,
                          construction_site_id: null,
                          current_track_id: destTrackId, // Always set track ID regardless of execution status
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString()
                        } as unknown as Wagon;
                      });
                      
                      return { ...group, wagons };
                    }
                    return group;
                  })} 
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
            <Button 
              type="submit" 
              variant="default" 
              className="w-full"
              disabled={loading || isSubmitting}
            >
              {(loading || isSubmitting) ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verarbeite...
                </div>
              ) : (
                trip ? 'Änderungen speichern' : 'Fahrt erstellen'
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Confirmation dialog for capacity/restriction issues */}
      {showConfirmDialog && (
        <Dialog 
          open={showConfirmDialog} 
          onOpenChange={(open) => {
            if (!open) setShowConfirmDialog(false);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto z-50">
            <DialogHeader>
              <DialogTitle className={
                confirmDialogAction === 'restrictions' 
                  ? "text-red-600" 
                  : confirmDialogAction === 'future_conflicts'
                    ? "text-blue-600"
                    : "text-amber-600"
              }>
                {confirmDialogTitle}
              </DialogTitle>
            </DialogHeader>
            
            <div className="mt-4">
              <div className="mb-4">
                {confirmDialogAction === 'restrictions' ? (
                  <div className="space-y-2">
                    <p className="text-red-600 font-medium">Achtung! Es gibt aktive Einschränkungen für diese Fahrt.</p>
                    <div className="bg-red-50 border border-red-200 p-3 rounded-md text-sm max-h-60 overflow-y-auto">
                      {confirmDialogMessage.split('\n').map((line, index) => (
                        <p key={index} className="mb-1 last:mb-0">{line}</p>
                      ))}
                    </div>
                    <p className="text-sm mt-2">
                      Diese Fahrt kann zu Planungskonflikten führen. Möchten Sie trotzdem fortfahren?
                    </p>
                  </div>
                ) : confirmDialogAction === 'future_conflicts' ? (
                  <div>
                    <p className="text-blue-600 font-medium mb-2">Hinweis: Diese Lieferung wird zukünftige Kapazitätskonflikte verursachen.</p>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-md text-sm max-h-60 overflow-y-auto">
                      {confirmDialogMessage.split('\n').map((line, index) => (
                        <p key={index} className="mb-1 last:mb-0">{line}</p>
                      ))}
                    </div>
                    <p className="text-sm mt-2">
                      Es gibt ausreichend Kapazität zum geplanten Zeitpunkt, aber zukünftige Fahrten könnten betroffen sein. Möchten Sie trotzdem fortfahren?
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-amber-600 font-medium mb-2">Achtung! Kapazitätsprobleme erkannt.</p>
                    <div className="max-h-60 overflow-y-auto">
                      {validationWarnings.map((warning, index) => (
                        <div key={index} className="mb-2 bg-amber-50 border border-amber-200 p-3 rounded-md text-sm">
                          <p>{warning.message}</p>
                          {warning.details && (
                            <div className="mt-2 text-xs text-gray-600">
                              <p>Gleiskapazität: {warning.details.trackLength || 0}m</p>
                              <p>Benötigte Länge: {warning.details.requiredLength || 0}m</p>
                              <p>Überschreitung: {Math.max(0, (warning.details.requiredLength || 0) - (warning.details.trackLength || 0))}m</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-sm mt-2">
                      Diese Fahrt kann zu Überbelegung führen. Möchten Sie trotzdem fortfahren?
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-4 flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => setShowConfirmDialog(false)}
                  variant="outline"
                  className="flex-1"
                  type="button"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={() => {
                    try {
                      setValidated(true);
                      setShowConfirmDialog(false);
                      
                      // Create a synthetic event and call handleSubmit with skipValidationCheck=true
                      const syntheticEvent = new Event('submit') as unknown as React.FormEvent;
                      handleSubmit(syntheticEvent, true);
                    } catch (error) {
                      console.error("Error in dialog confirmation:", error);
                      setShowConfirmDialog(false);
                      toast({
                        title: "Fehler",
                        description: "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.",
                        variant: "destructive"
                      });
                    }
                  }}
                  variant={confirmDialogAction === 'restrictions' ? "destructive" : confirmDialogAction === 'future_conflicts' ? "default" : "secondary"}
                  className="flex-1"
                  type="button"
                >
                  {confirmDialogAction === 'restrictions' 
                    ? 'Einschränkungen bestätigen' 
                    : confirmDialogAction === 'future_conflicts'
                      ? 'Konflikt akzeptieren und fortfahren'
                      : 'Trotzdem fortfahren'
                  }
                </Button>
              </div>
            </div>
            
            {/* Add emergency close button at top right */}
            <button 
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200"
              onClick={() => setShowConfirmDialog(false)}
              aria-label="Close dialog"
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </DialogContent>
        </Dialog>
      )}

      {/* Warning Dialog */}
      {showWarningDialog && (
        <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Fahrtenvalidierung Warnungen</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <ValidationWarnings warnings={validationWarnings} />
              
              <div className="flex justify-end space-x-3 mt-4">
                <Button
                  onClick={() => setShowWarningDialog(false)}
                  variant="outline"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={() => {
                    setShowWarningDialog(false);
                    // Create a synthetic form event instead of using a raw Event
                    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
                    handleSubmit(syntheticEvent, true); // Skip validation when submitting after warning acknowledgment
                  }}
                  variant="destructive"
                >
                  Trotzdem fortfahren
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TripModal; 