# Schema Update Instructions

## Issues to Fix
1. Error when creating trips: `Failed to create trip: Could not find the 'construction_site_id' column of 'trips' in the schema cache`
2. Error when creating trips: `Failed to create trip: Could not find the 'file_url' column of 'trips' in the schema cache`

## Solution
The database schema needs to be updated to add missing columns to the `trips` table:
- `construction_site_id` column 
- `file_url` column

Additionally, the stored procedures that create trips need to be updated to handle these new columns.

## Files to Apply
Please apply these SQL files in the Supabase SQL Editor in the following order:

### First Fix (construction_site_id)
1. `update_trips_schema.sql` - Adds the construction_site_id column to the trips table
2. `functions/update_create_internal_trip.sql` - Updates the create_internal_trip function
3. `functions/create_internal_trip.sql` - Updates the original create_internal_trip function

### Second Fix (file_url)
4. `update_trips_file_url.sql` - Adds the file_url column to the trips table
5. `functions/update_trip_functions.sql` - Updates trip functions to include the file_url field

## How to Apply

1. Go to the Supabase Dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy the contents of each file and run them one by one in the order listed above
5. Verify that the changes were applied successfully by checking the trips table schema and the functions

After applying these changes, the application should be able to create trips without encountering schema errors.

## Verification
To verify that the changes were applied correctly, you can run the following SQL queries:

```sql
-- Check for construction_site_id column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trips' AND column_name = 'construction_site_id';

-- Check for file_url column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trips' AND column_name = 'file_url';
```

If the columns were added successfully, you should see:
- construction_site_id (uuid)
- file_url (text) 