import { createClient } from '@supabase/supabase-js'

let _client = null

function getSupabase() {
  if (_client) return _client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return _client
}

// Lazy proxy: client components can be imported during Next prerender without
// requiring Supabase env to exist at build time.
export const supabase = new Proxy(
  {},
  { get(_target, prop) { return getSupabase()[prop] } }
)
