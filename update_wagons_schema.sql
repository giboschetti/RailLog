-- Add construction_site_id column to the wagons table
ALTER TABLE wagons 
ADD COLUMN construction_site_id UUID REFERENCES nodes(id) NULL;

-- Add an index to improve query performance
CREATE INDEX IF NOT EXISTS idx_wagons_construction_site_id ON wagons(construction_site_id);

-- Add a comment to the column
COMMENT ON COLUMN wagons.construction_site_id IS 'Reference to the construction site (node) this wagon is designated for'; 