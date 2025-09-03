import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const nav = useNavigate()
  const loc = useLocation()
  const [msg, setMsg] = useState('Authentifiziere…')

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href)
        const next = url.searchParams.get('next') || '/'
        const code = url.searchParams.get('code')

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          // URL aufräumen (ohne code)
          window.history.replaceState({}, document.title, next)
          nav(next, { replace: true })
          return
        }

        // Fallback: Magic‑Link (Fragment) -> setSession (selten, aber nett)
        if (window.location.hash.includes('access_token=')) {
          const h = new URLSearchParams(window.location.hash.slice(1))
          const access_token = h.get('access_token')
          const refresh_token = h.get('refresh_token')
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) throw error
            window.history.replaceState({}, document.title, next)
            nav(next, { replace: true })
            return
          }
        }

        throw new Error('Kein Auth‑Code gefunden.')
      } catch (e: any) {
        console.error(e)
        setMsg(`Login-Callback fehlgeschlagen: ${e.message ?? e}`)
      }
    })()
  }, [nav])

  return <div className="p-6 text-sm">{msg}</div>
}
