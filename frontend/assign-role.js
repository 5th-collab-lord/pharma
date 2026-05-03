import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://obfvazyevjfveyquuaem.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZnZhenlldmpmdmV5cXV1YWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDYyMjYsImV4cCI6MjA5MzE4MjIyNn0.MHjQJW-KNX60iD4LRcYE5FBEzG2ePF8uWSL7kj1pV3g";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function assignRole() {
  console.log("Logging in as admin...");
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "kanhaiyakrishna5111@gmail.com",
    password: "Morningstar@2005"
  });

  if (error) {
    console.error("Login failed:", error.message);
    return;
  }

  const userId = data.user.id;
  console.log("Logged in. User ID:", userId);

  const { error: roleError } = await supabase.from('user_roles').insert({
    user_id: userId,
    role: 'admin'
  });

  if (roleError) {
    console.error("Error assigning admin role:", roleError.message);
  } else {
    console.log("Admin role successfully assigned!");
  }
}

assignRole();
