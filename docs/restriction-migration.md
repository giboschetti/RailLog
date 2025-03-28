# Restriction Migration Guide

## Overview

This document explains the process of migrating existing restrictions to the new `daily_restrictions` table model. The migration is necessary to support more efficient restriction checking and to enable a more granular approach to managing track restrictions.

## Background

Previously, restrictions were stored in the `restrictions` table with an associated many-to-many relationship to tracks in the `restriction_tracks` table. This model worked, but had limitations:

1. Checking for conflicts required complex logic
2. Restrictions spanning multiple days were difficult to manage
3. Performance issues when checking many restrictions

The new model introduces a `daily_restrictions` table that expands each restriction into individual daily records. This offers several benefits:

1. Simpler queries when checking for conflicts
2. Better performance for checking restrictions
3. More granular control over restrictions
4. Easier visualization in the calendar view

## Migration Process

The migration script performs the following steps:

1. Fetches all existing restrictions from the database
2. For each restriction, finds the associated tracks
3. Expands each restriction into daily records
4. Stores these records in the `daily_restrictions` table

The script handles different repetition patterns (once, daily) and multiple restriction types (no_entry, no_exit) appropriately.

## Running the Migration

To run the migration, follow these steps:

### Prerequisites

- Node.js 14+ installed
- Project dependencies installed (`npm install`)
- Access to the Supabase database
- Environment variables configured (`.env` file with Supabase credentials)

### Running the Script

Execute the migration with the following command:

```bash
npm run migrate-restrictions
```

This command will:
1. Start the migration process
2. Log progress to the console
3. Report any errors encountered
4. Provide a summary of processed restrictions

### Monitoring Progress

During execution, the script will log:
- Number of restrictions found
- Progress (current/total) as it processes each restriction
- Any errors encountered
- Final summary of processed restrictions

If the script encounters errors with specific restrictions, it will continue processing other restrictions and report the errors at the end.

## After Migration

Once the migration is complete:

1. The original restrictions remain unchanged
2. All restrictions are also represented in the `daily_restrictions` table
3. The application now uses the simplified restriction checking

### Verification

To verify the migration was successful, you can:

1. Check that the count of daily_restrictions is appropriate given the source restrictions
2. Test the creation of trips in the application to ensure restriction checking works
3. Verify that restrictions appear correctly in the calendar view

## Troubleshooting

If you encounter issues:

1. **Database connection errors**: Check your environment variables
2. **Permission errors**: Ensure you have write access to the database
3. **Migration script crashes**: Review the logs and fix any specific restrictions causing issues

If you need to run the migration again, it's safe to do so. The script will first delete any existing daily_restrictions records associated with each original restriction before creating new ones.

## Technical Reference

- Migration script: `src/scripts/migrateRestrictions.ts`
- Restriction expansion function: `expandRestriction()` in `src/lib/trackUtils.ts`
- Daily restrictions model: `daily_restrictions` table in Supabase

## Contact

If you encounter any issues with the migration, please contact the development team. 