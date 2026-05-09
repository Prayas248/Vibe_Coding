import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    '[SUPABASE] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing — auth UI will fail until set.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'http://invalid.local',
  supabasePublishableKey ?? 'invalid'
);
