// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Vite stellt import.meta.env bereit; wir casten defensiv auf string
const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL ?? '') as string
const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string

// Freundlicher Hinweis im Browser, falls Variablen fehlen (anstatt "weißer Seite")
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const msg = 'Supabase-Umgebungsvariablen fehlen: VITE_SUPABASE_URL und/oder VITE_SUPABASE_ANON_KEY.'
  // eslint-disable-next-line no-console
  console.error(msg, { SUPABASE_URL_present: !!SUPABASE_URL, SUPABASE_ANON_KEY_present: !!SUPABASE_ANON_KEY })
  if (typeof document !== 'undefined') {
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML = `
        <div style="padding:16px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:6px">
          <b>Konfiguration fehlt</b><br/>
          ${msg}
        </div>`
    }
  }
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // wichtig für Azure-Redirect
  },
})
