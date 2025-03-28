#!/usr/bin/env node

// This script runs the migration via Node.js
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting restrictions migration process...');

// Use ts-node to run the TypeScript migration file
const tsNode = spawn('npx', [
  'ts-node',
  path.join(__dirname, 'migrateRestrictions.ts')
], {
  stdio: 'inherit',
  shell: true
});

tsNode.on('close', (code) => {
  if (code === 0) {
    console.log('Migration completed successfully');
  } else {
    console.error(`Migration process exited with code ${code}`);
    process.exit(code);
  }
}); 