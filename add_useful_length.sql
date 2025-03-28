-- Add useful_length column to tracks if it doesn't exist
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS useful_length NUMERIC DEFAULT 0; 