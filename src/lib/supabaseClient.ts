import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://paomxioocjurhjompfvg.supabase.co/rest/v1/';
export const SUPABASE_ANON_KEY = 'sb_publishable_YDL0M4psSEqJg_A0vAw51A_9cG94sBo';

// Normalize URL: createClient from @supabase/supabase-js expects the project base origin URL
// without /rest/v1/ suffix so it can properly route /rest/v1 and /auth/v1 endpoints.
const normalizedSupabaseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');

export const supabase = createClient(normalizedSupabaseUrl, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
