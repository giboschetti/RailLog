require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase URL or service role key in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateRLSPolicies() {
  console.log('Updating RLS policies for daily_restrictions table...');

  try {
    // Get SQL from the migration file
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(__dirname, '../supabase/migrations/20240420_daily_restrictions_rls.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`Error: Migration file not found at ${sqlPath}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL using Supabase's REST API
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error executing SQL:', error);
      process.exit(1);
    }
    
    console.log('RLS policies updated successfully!');
    console.log(data);
    
  } catch (error) {
    console.error('Error updating RLS policies:', error);
    process.exit(1);
  }
}

// Run the update
updateRLSPolicies().catch(console.error); 