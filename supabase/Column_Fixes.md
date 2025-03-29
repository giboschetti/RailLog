# Column Naming Issue Fix

## Issue Identified

There was a mismatch between the column names used in the database schema and the React application code:

1. In the database, the column for storing uploaded file URLs is named `transport_plan_file`.
2. In the React app code (TripModal.tsx), it was trying to use a column named `file_url`.

This mismatch was causing the error:
```
Failed to create trip: Could not find the 'file_url' column of 'trips' in the schema cache
```

## Solution Applied

We fixed this by updating the React application code to use the correct column name: `transport_plan_file` instead of `file_url` in the tripData object.

### Files Modified

1. `src/components/projects/trips/TripModal.tsx`
   - Updated the tripData object to use `transport_plan_file` instead of `file_url`

2. `src/lib/supabase.ts` 
   - Updated the Trip type definition to reflect the correct database schema

## No Database Changes Required

Unlike the previous issue with `construction_site_id`, this issue did not require any database schema changes. The column already exists in the database, but the application code was using a different name.

## Verification

You can verify the fix is working by:
1. Creating a new trip with a PDF file attached
2. Checking that the file is successfully uploaded and linked to the trip
3. Verifying no "column not found" errors appear 