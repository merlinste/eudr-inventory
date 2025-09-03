import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [mode, setMode] = useState<'loading'|'recovery'|'done'|'error'>('loading')
  const [msg, setMsg] = useState('')
  const [pw, setPw] = useState('')

  useEffect(() => {
    // Recovery-Event; Supabase feuert das bei Passwort-Links
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('recovery')
    })

    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const hash = new URLSearchParams(url.hash.slice(1))
        const isRecovery =
          hash.get('type') === 'recovery' || sp.get('type') === 'recovery' || sp.get('recovery') === '1'

        // A) Recovery: KEIN exchangeCodeForSession aufrufen
        if (isRecovery) {
          // Falls Tokens im Hash sind, Session herstellen
          const at = hash.get('access_token')
          const rt = hash.get('refresh_token')
          if (at && rt) {
            const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
            if (error) throw error
          }
          setMode('recovery')
          window.history.replaceState({}, document.title, '/auth/callback')
          return
        }

        // B) OAuth/PKCE: Code nur tauschen, wenn ein PKCE-Verifier existiert
        const code = sp.get('code')
        const hasVerifier = typeof window !== 'undefined' && localStorage.getItem('sb-pkce-code-verifier')
        if (code && hasVerifier) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          window.history.replaceState({}, document.title, '/')
          setMode('done'); nav('/', { replace: true }); return
        }

        // C) Implicit-Flow: Tokens im Hash setzen
        const at2 = hash.get('access_token')
        const rt2 = hash.get('refresh_token')
        if (at2 && rt2) {
          const { error } = await supabase.auth.setSession({ access_token: at2, refresh_token: rt2 })
          if (error) throw error
          window.history.replaceState({}, document.title, '/')
          setMode('done'); nav('/', { replace: true }); return
        }

        // Nichts zu tun → zurück zur App/Login
        setMode('done'); nav('/', { replace: true })
      } catch (e: any) {
        setMode('error'); setMsg(e.message ?? String(e))
      }
    })()

    return () => { sub.data.subscription.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setPassword() {
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setMsg('Passwort gesetzt. Bitte neu anmelden.')
      setMode('done')
      setTimeout(() => nav('/login', { replace: true }), 900)
    } catch (e: any) {
      setMsg(e.message ?? String(e))
    }
  }

  if (mode === 'recovery') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h2 className="font-semibold mb-3">Neues Passwort setzen</h2>
        <input type="password" className="border rounded px-3 py-2 w-full mb-3"
               value={pw} onChange={e=>setPw(e.target.value)} placeholder="Neues Passwort" />
        <button className="bg-slate-900 text-white rounded px-3 py-2" onClick={setPassword}>Speichern</button>
        {msg && <div className="text-sm text-slate-600 mt-3">{msg}</div>}
      </div>
    )
  }
  if (mode === 'error') return <div className="p-6 text-sm text-red-600">{msg}</div>
  return <div className="p-6 text-sm">Einen Moment…</div>
}
