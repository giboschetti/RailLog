// When creating a new wagon
const newWagon = {
  // other fields...
  external_id: userEnteredId, // The ID entered by user
  temp_id: crypto.randomUUID() // Generate a UUID in JavaScript
};

// Or allow Supabase to generate it by default if you've set up the column correctly 