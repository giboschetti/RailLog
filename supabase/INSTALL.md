# Event-Sourcing Implementation Instructions

This document provides step-by-step instructions for implementing the event-sourcing architecture in your Rail Logistics application database.

## Prerequisites

- Access to the Supabase SQL Editor
- Admin privileges for your database
- A recent backup of your database (just in case)

## Installation Steps

### Option 1: Using the Master Script (Recommended)

1. Open the Supabase SQL Editor.
2. Copy the contents of `event_sourcing_master.sql` into the editor.
3. Click "Run" to execute the script.
4. Check the output for any errors or warnings.

The master script will automatically run all the necessary scripts in the correct order:
1. `implement_event_sourcing.sql` - Sets up the foundation
2. `update_ui_functions_for_events.sql` - Updates UI functions
3. `ensure_complete_event_history.sql` - Ensures event history exists
4. `improve_trip_handling.sql` - Updates trip-related functions
5. `fix_inconsistencies.sql` - Checks and fixes any data inconsistencies

### Option 2: Manual Step-by-Step Installation

If you prefer to run each script individually:

1. **Implement the Foundation**:
   - Open the Supabase SQL Editor
   - Copy the contents of `implement_event_sourcing.sql`
   - Run the script and check for errors

2. **Update UI Functions**:
   - Open a new SQL Editor tab
   - Copy the contents of `update_ui_functions_for_events.sql`
   - Run the script and check for errors

3. **Ensure Complete Event History**:
   - Open a new SQL Editor tab
   - Copy the contents of `ensure_complete_event_history.sql`
   - Run the script and check for errors

4. **Improve Trip Handling**:
   - Open a new SQL Editor tab
   - Copy the contents of `improve_trip_handling.sql`
   - Run the script and check for errors

5. **Fix Any Inconsistencies**:
   - Open a new SQL Editor tab
   - Copy the contents of `fix_inconsistencies.sql`
   - Run the script and check for errors

## Verifying the Installation

After installation, verify that everything is working properly:

1. **Check the Event Log**:
   ```sql
   SELECT * FROM audit_logs 
   WHERE details LIKE '%event-sourcing%' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
   You should see several success messages.

2. **Check Data Consistency**:
   ```sql
   SELECT * FROM verify_wagon_trajectories() WHERE mismatch = TRUE;
   ```
   This should return no rows if everything is consistent.

3. **Test Time-Travel Queries**:
   ```sql
   -- Get wagons on a track at a specific time
   SELECT * FROM get_track_wagons_at_time(
     '00000000-0000-0000-0000-000000000000', -- Replace with a real track UUID
     '2023-01-01 12:00:00'::TIMESTAMPTZ
   );
   ```

4. **Open the Application**:
   - Load your application in a browser
   - Navigate to the track view
   - Verify that wagons appear correctly on tracks
   - Change the date in the UI and verify wagons appear/disappear correctly based on their delivery/movement dates

## Troubleshooting

If you encounter issues:

1. **Check the Audit Logs**:
   ```sql
   SELECT * FROM audit_logs 
   WHERE action IN ('ERROR', 'WARNING') 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

2. **Verify Function Existence**:
   ```sql
   SELECT proname 
   FROM pg_proc 
   WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
   AND proname LIKE '%wagon%';
   ```

3. **Debug Wagon Positions**:
   ```sql
   -- View a specific wagon's complete event history
   SELECT * FROM debug_wagon_events('00000000-0000-0000-0000-000000000000'); -- Replace with real wagon UUID
   ```

4. **If All Else Fails**:
   - Open a new SQL Editor tab
   - Run `SELECT * FROM fix_inconsistencies();` again
   - Check for any remaining issues

## Next Steps

After successful implementation:

1. **Monitor Performance**:
   - Watch for any performance issues with the event-based queries
   - Consider adding materialized views if needed

2. **Update Application Code**:
   - Make sure your UI is using the updated functions
   - Consider updating your application to leverage the new debugging tools

3. **Plan for Future Enhancements**:
   - Consider implementing the full event-sourcing pattern in your application code
   - Look into snapshot generation for complex queries

## Support

If you need assistance, refer to the `README_event_sourcing.md` file for more details about the implementation or contact the development team. 