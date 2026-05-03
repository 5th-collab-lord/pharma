import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://obfvazyevjfveyquuaem.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZnZhenlldmpmdmV5cXV1YWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDYyMjYsImV4cCI6MjA5MzE4MjIyNn0.MHjQJW-KNX60iD4LRcYE5FBEzG2ePF8uWSL7kj1pV3g";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function createAdmin() {
  console.log("Creating admin account...");
  
  // 1. Sign up the user
  const { data, error } = await supabase.auth.signUp({
    email: "kanhaiyakrishna5111@gmail.com",
    password: "Morningstar@2005",
    options: {
      data: { full_name: "System Admin" }
    }
  });

  if (error) {
    console.error("Error creating user:", error.message);
    return;
  }
  
  const userId = data.user?.id;
  if (!userId) {
    console.log("User created but ID not found, maybe email confirmation is required.");
    return;
  }

  console.log("User created with ID:", userId);

  // 2. Assign the 'admin' role in user_roles table
  const { error: roleError } = await supabase.from('user_roles').insert({
    user_id: userId,
    role: 'admin'
  });

  if (roleError) {
    console.error("Error assigning admin role (it might already exist):", roleError.message);
  } else {
    console.log("Admin role successfully assigned!");
  }
  
  console.log("Done.");
}

createAdmin();
