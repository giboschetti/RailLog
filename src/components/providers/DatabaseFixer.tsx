'use client';

import { useEffect, useState } from 'react';
import { updateTrackOccupancyFunction, addLengthColumnToWagons } from '@/lib/db';

export function DatabaseFixer() {
  const [isFixed, setIsFixed] = useState(false);

  useEffect(() => {
    const fixDatabase = async () => {
      try {
        // Run our database fixes
        console.log('Running database fixes...');
        
        // Fix 1: Update track occupancy function
        const result1 = await updateTrackOccupancyFunction();
        if (!result1.success) {
          console.error('Failed to update track occupancy function', result1.error);
        } else {
          console.log('Track occupancy function updated successfully');
        }
        
        // Fix 2: Add length column to wagons
        const result2 = await addLengthColumnToWagons();
        if (!result2.success) {
          console.error('Failed to add length column to wagons', result2.error);
        } else {
          console.log('Length column added to wagons successfully');
        }
        
        // Mark as fixed if both were successful
        if (result1.success && result2.success) {
          console.log('All database fixes applied successfully');
          setIsFixed(true);
        }
      } catch (error) {
        console.error('Error applying database fixes:', error);
      }
    };

    if (!isFixed) {
      fixDatabase();
    }
  }, [isFixed]);

  // This component doesn't render anything
  return null;
} 