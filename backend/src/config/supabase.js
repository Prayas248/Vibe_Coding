import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn(
    '[SUPABASE] SUPABASE_URL or SUPABASE_SECRET_KEY is missing — auth will fail until these are set.'
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? 'http://invalid.local',
  supabaseSecretKey ?? 'invalid',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
