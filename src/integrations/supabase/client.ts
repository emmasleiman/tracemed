
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ayzqxlszyvhqzwswpewr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5enF4bHN6eXZocXp3c3dwZXdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NzYzNzgsImV4cCI6MjA1OTQ1MjM3OH0.Qi1KIaQVRiA_L6ZLaOblJYHU3qP41vxCVBuIuGOkkpA";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
