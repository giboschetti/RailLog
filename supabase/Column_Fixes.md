# Column Name Mismatch Fixes

## Issue 1: file_url vs transport_plan_file Column Name Mismatch

### Problem
There was a mismatch between the column names used in the database schema and the SQL functions:

1. In the database schema, the column is named `transport_plan_file` in the `trips` table.
2. In the React app code (specifically useWagonDragDrop.ts), it was using a null value for this field, but proper naming is needed.
3. In the SQL functions (`create_internal_trip_v2` and others), the column was incorrectly referred to as `file_url`.

This caused the error:
```
Failed to load resources: the server responded with a status of 400 ()
RPC error for wagon c1d515f5-2b1f-4aea-8280-6dff27aa8d72:
Object: {"code":"42703","details":null,"hint":null,"message":"column \"file_url\" of relation \"trips\" does not exist"}
```

### Solution
We fixed this by updating both the React application code and the SQL functions to consistently use the correct column name:

1. Updated useWagonDragDrop.ts:
   - Updated the tripData object to use `transport_plan_file` instead of `file_url`

2. Updated SQL functions:
   - Updated all functions in create_internal_trip_with_manual_trajectory.sql
   - Updated all functions in fix_function_signature.sql
   - Updated all functions in fix_transaction_handling.sql
   - Created a new comprehensive fix_file_url_column.sql with all fixes in one place

3. The fix_file_url_column.sql file contains:
   - Updated create_internal_trip_v2 function 
   - Updated create_internal_trip function
   - Schema cache reload

### Implementation
Run the SQL file fix_file_url_column.sql in the Supabase SQL Editor to apply all the changes at once.

### Verification
To verify that the changes were applied correctly, drag and drop a wagon to move it to another track. The operation should now complete without errors.

## No Database Changes Required

Unlike the previous issue with `construction_site_id`, this issue did not require any database schema changes. The column already exists in the database, but the application code was using a different name.

## Verification

You can verify the fix is working by:
1. Creating a new trip with a PDF file attached
2. Checking that the file is successfully uploaded and linked to the trip
3. Verifying no "column not found" errors appear 