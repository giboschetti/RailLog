import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';
import { validateInternalTrip, InternalTripData } from './tripValidation';

interface CreateInternalTripParams {
  projectId: string;
  sourceTrackId: string;
  destTrackId: string;
  wagonIds: string[];
  tripDateTime: string;
  isPlanned: boolean;
}

/**
 * Creates an internal trip with transaction-based approach and validation
 * @param params Trip parameters
 * @returns Result of the trip creation
 */
export async function createInternalTrip(params: CreateInternalTripParams) {
  const { projectId, sourceTrackId, destTrackId, wagonIds, tripDateTime, isPlanned } = params;
  
  try {
    // 1. Fetch the wagons to get their lengths for validation
    const { data: wagonsData, error: wagonsError } = await supabase
      .from('wagons')
      .select('id, length')
      .in('id', wagonIds);
    
    if (wagonsError) throw wagonsError;
    if (!wagonsData || wagonsData.length === 0) {
      throw new Error('No wagons found for the specified IDs');
    }
    
    // 2. Validate the internal trip
    const validationData: InternalTripData = {
      projectId,
      dateTime: tripDateTime,
      sourceTrackId,
      destTrackId,
      selectedWagons: wagonsData,
      isPlanned
    };
    
    const validationResult = await validateInternalTrip(validationData);
    
    // If there are errors, don't proceed
    if (!validationResult.isValid) {
      return {
        success: false,
        error: validationResult.errors[0].message,
        warnings: validationResult.warnings,
        validationResult
      };
    }
    
    // 3. Create the trip with a transaction-based approach
    const tripId = uuidv4();
    
    // a. Create trip record
    const tripData = {
      id: tripId,
      project_id: projectId,
      type: 'internal',
      datetime: tripDateTime,
      source_track_id: sourceTrackId,
      dest_track_id: destTrackId,
      is_planned: isPlanned,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_conflicts: validationResult.warnings.length > 0
    };
    
    const { error: tripError } = await supabase
      .from('trips')
      .insert(tripData);
    
    if (tripError) throw tripError;
    
    // b. Link wagons to the trip
    const tripWagons = wagonIds.map(wagonId => ({
      trip_id: tripId,
      wagon_id: wagonId
    }));
    
    const { error: linkError } = await supabase
      .from('trip_wagons')
      .insert(tripWagons);
    
    if (linkError) {
      // If linking fails, delete the trip
      await supabase.from('trips').delete().eq('id', tripId);
      throw linkError;
    }
    
    // c. If not planned (executed trip), update wagons' current_track_id
    if (!isPlanned) {
      const { error: updateError } = await supabase
        .from('wagons')
        .update({ current_track_id: destTrackId })
        .in('id', wagonIds);
      
      if (updateError) {
        console.error('Error updating wagon locations:', updateError);
        // Don't throw here, as the trip is still valid
      }
    }
    
    return {
      success: true,
      tripId,
      warnings: validationResult.warnings
    };
  } catch (error: any) {
    console.error('Error creating internal trip:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 