import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const nav = useNavigate()
  const [sp] = useSearchParams()

  useEffect(() => {
    const code = sp.get('code')
    const next = sp.get('next') || '/inventory'

    if (!code) {
      nav('/login?error=missing_code', { replace: true })
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('Auth callback error', error)
        nav('/login?error=callback_failed', { replace: true })
      } else {
        nav(next, { replace: true })
      }
    })
  }, [nav, sp])

  return <div className="p-6">Anmeldung wird abgeschlossen…</div>
}
