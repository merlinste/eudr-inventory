import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // sichtbarer Hinweis im Browser + Console
  const msg = 'Supabase-Env fehlt: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'
  // eslint-disable-next-line no-console
  console.error(msg, { url, anon })
  // simple Banner-Ausgabe:
  const el = document.getElementById('root')
  if (el) el.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca">
    <b>Konfiguration fehlt</b><br>${msg}
  </div>`
}

// @ts-expect-error url/anon werden bei Netlify gesetzt
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
