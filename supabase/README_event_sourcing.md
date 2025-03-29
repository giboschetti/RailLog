# Event-Sourcing Implementation for Rail Logistics

This document explains the event-sourcing architecture implemented for the Rail Logistics application, providing details on how to apply the changes and verify they are working correctly.

## What is Event-Sourcing?

Event-sourcing is an architectural pattern where:

1. **All changes to application state are stored as a sequence of events**
2. **The current state can be recreated by replaying the events**
3. **The event log becomes the source of truth rather than the current state**

For our Rail Logistics application, this means we track every wagon movement as an immutable event in the `wagon_trajectories` table, which allows us to:

- Determine the exact position of any wagon at any point in time
- Understand the complete history of wagon movements
- Avoid data inconsistencies by having a single source of truth
- Enable accurate time-travel queries (e.g., "show me the track state on July 15th")

## Changes Implemented

The implementation consists of two SQL scripts:

1. **`implement_event_sourcing.sql`**: Enhances the existing database to better support event-sourcing principles
2. **`update_ui_functions_for_events.sql`**: Updates the UI functions to use the event-sourcing approach

### Key Components:

- **Event Storage**: Using the existing `wagon_trajectories` table with improved indexing
- **Position Querying**: New functions to determine wagon positions at any time point
- **Consistency Tools**: Functions to verify and fix data inconsistencies 
- **UI Integration**: Updated UI functions that use the event log for display
- **Error Prevention**: New trigger to ensure event records are created for all position changes

## How to Apply the Changes

Follow these steps to implement the event-sourcing architecture:

### Step 1: Run the Foundation Script

Run the `implement_event_sourcing.sql` script in the Supabase SQL Editor. This will:

- Add indexes to improve query performance
- Create the core event-sourcing functions
- Implement the wagon position view
- Add triggers to maintain data consistency

```sql
-- Run this in the Supabase SQL Editor
-- Copy and paste the entire contents of implement_event_sourcing.sql
```

### Step 2: Run the UI Update Script

Run the `update_ui_functions_for_events.sql` script in the Supabase SQL Editor. This will:

- Update the `get_track_wagons_at_time` function to use the event log
- Update the `get_track_occupancy_at_time` function to use the event log
- Add diagnostic and repair functions

```sql
-- Run this in the Supabase SQL Editor
-- Copy and paste the entire contents of update_ui_functions_for_events.sql
```

### Step 3: Verify Data Consistency

After applying the scripts, run the following query to check for any inconsistencies between the `current_track_id` in the wagons table and the latest position in the event log:

```sql
SELECT * FROM verify_wagon_trajectories() WHERE mismatch = TRUE;
```

If inconsistencies are found, you can fix them automatically with:

```sql
SELECT * FROM fix_wagon_trajectory_inconsistencies();
```

## Testing the Implementation

To confirm that the event-sourcing implementation is working correctly:

1. **Check wagon displays**: Load the application and verify wagons appear on the tracks
2. **Time-travel testing**: Change the date in the UI and verify wagons appear only after their arrival time
3. **Query test**: Run this query to see a wagon's position history:
   ```sql
   SELECT * FROM debug_wagon_events('wagon-uuid-here');
   ```

## Diagnostics and Troubleshooting

If you encounter issues:

1. **Check the audit logs**:
   ```sql
   SELECT * FROM audit_logs 
   WHERE action IN ('DEBUG', 'ERROR') 
   ORDER BY created_at DESC 
   LIMIT 50;
   ```

2. **Verify wagon positions**:
   ```sql
   SELECT * FROM current_wagon_positions;
   ```

3. **Test the wagon position function directly**:
   ```sql
   SELECT * FROM get_wagon_position_at_time('wagon-uuid-here', 'YYYY-MM-DD HH:MM:SS'::TIMESTAMPTZ);
   ```

## Benefits of This Implementation

- **Historical Accuracy**: Correctly shows wagons based on their actual arrival/departure times
- **Data Consistency**: Prevents duplicates and inconsistencies between tables
- **Temporal Queries**: Enables accurate historical views of the system
- **Debugging**: Provides tools to diagnose and fix data issues
- **Maintainability**: More resilient to future changes in the application

## Future Enhancements

- Add materialized views for performance optimization
- Implement snapshot generation for complex queries
- Add more sophisticated constraint checking based on the event log

## Questions?

If you have questions about the implementation or encounter issues, please contact the development team. 