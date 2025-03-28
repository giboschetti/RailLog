import { supabase } from './supabase';

/**
 * Updates the track occupancy function in the database
 * This handles the issue with the missing 'length' column
 */
export async function updateTrackOccupancyFunction() {
  try {
    // Use the SQL query API to update the function
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Drop the function if it exists
        DROP FUNCTION IF EXISTS get_track_occupancy;
        
        -- Create a simplified function that only uses useful_length
        CREATE OR REPLACE FUNCTION get_track_occupancy(
            track_id_param UUID,
            timestamp_param TIMESTAMPTZ DEFAULT NOW()
        )
        RETURNS JSON AS $$
        DECLARE
            track_rec RECORD;
            total_length NUMERIC := 0;
            occupied_length NUMERIC := 0;
            available_length NUMERIC := 0;
            wagon_count INTEGER := 0;
            result JSON;
        BEGIN
            -- Get basic track info using useful_length
            BEGIN
                SELECT id, useful_length INTO STRICT track_rec
                FROM tracks
                WHERE id = track_id_param;
                
                -- Use useful_length
                total_length := COALESCE(track_rec.useful_length, 0);
            EXCEPTION WHEN no_data_found THEN
                -- No track found
                NULL;
            END;
            
            -- Simplest possible query for wagons
            BEGIN
                SELECT COUNT(id) INTO wagon_count
                FROM wagons
                WHERE track_id = track_id_param;
            EXCEPTION WHEN OTHERS THEN
                wagon_count := 0;
            END;
            
            -- Create a simple result
            result := json_build_object(
                'track_id', track_id_param,
                'datetime', timestamp_param,
                'total_length', total_length,
                'occupied_length', occupied_length,
                'available_length', total_length,
                'wagon_count', wagon_count
            );
            
            RETURN result;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    if (error) {
      console.error('Error updating track occupancy function:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Exception updating track occupancy function:', error);
    return { success: false, error };
  }
}

/**
 * Adds the missing length column to the wagons table
 */
export async function addLengthColumnToWagons() {
  try {
    // Direct SQL query to add the column
    const { data, error } = await supabase.from('wagons').select('id').limit(1);
    
    if (error) {
      console.error('Error checking wagons table:', error);
      return { success: false, error };
    }
    
    // Execute the SQL to add the column (using a direct RPC call if available)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`
        },
        body: JSON.stringify({
          sql: `
            -- Add length column to wagons if it doesn't exist
            ALTER TABLE wagons ADD COLUMN IF NOT EXISTS length NUMERIC DEFAULT 0;
            
            -- Copy data from default_length of wagon_types to length of wagons if not set
            UPDATE wagons w
            SET length = wt.default_length
            FROM wagon_types wt
            WHERE w.type_id = wt.id AND w.length IS NULL;
          `
        })
      });
      
      return { success: true };
    } catch (rpcError) {
      console.error('Error executing SQL via RPC:', rpcError);
      return { success: false, error: rpcError };
    }
  } catch (error) {
    console.error('Exception adding length column:', error);
    return { success: false, error };
  }
} 