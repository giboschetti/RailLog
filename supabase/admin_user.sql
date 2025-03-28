-- Replace 'your-user-email@example.com' with the email of the user you want to make an admin
UPDATE public.users
SET role = 'admin'
WHERE email = 'your-user-email@example.com';

-- Alternatively, you can run this directly in the Supabase SQL editor with your actual email:

/*
UPDATE public.users
SET role = 'admin'
WHERE email = 'your-actual-email@example.com';
*/

-- To check the current users and their roles
SELECT * FROM public.users; 