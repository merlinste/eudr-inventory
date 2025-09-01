import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const nav = useNavigate()
  const [sp] = useSearchParams()

  useEffect(() => {
    const next = sp.get('next') || '/inventory'
    const code = sp.get('code')

    // 1) PKCE (?code=...)
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) nav('/login?error=callback_failed', { replace: true })
        else nav(next, { replace: true })
      })
      return
    }

    // 2) Implicit-Fragment (#access_token=...); Fehler ggf. aus Hash auslesen
    const hash = window.location.hash?.slice(1) || ''
    const hp = new URLSearchParams(hash)

    // Fehler, die Supabase im Hash liefern kann (siehe Redirect-URLs-Doku)
    const errCode = hp.get('error_code')
    const errDesc = hp.get('error_description')
    if (errCode) {
      console.error('OAuth error', errCode, errDesc)
      nav(`/login?error=${encodeURIComponent(errCode)}`, { replace: true })
      return
    }

    const access_token = hp.get('access_token')
    const refresh_token = hp.get('refresh_token')

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) nav('/login?error=callback_failed', { replace: true })
        else nav(next, { replace: true })
      })
      return
    }

    // 3) Nichts da -> zurück zum Login
    nav('/login?error=missing_params', { replace: true })
  }, [nav, sp])

  return <div className="p-6">Anmeldung wird abgeschlossen…</div>
}
