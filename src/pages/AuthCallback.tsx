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
    // 1) Recovery-Event abonnieren (wird bei Recovery-Links emittiert)
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('recovery')
    })

    ;(async () => {
      try {
        // 2) PKCE: Auth-Code gegen Session tauschen
        const code = sp.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // 3) Fallback: Implicit-Flow (#access_token / #type=recovery)
          const hash = new URLSearchParams(window.location.hash.slice(1))
          const at = hash.get('access_token')
          const rt = hash.get('refresh_token')
          if (at && rt) {
            const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
            if (error) throw error
          }
          if (hash.get('type') === 'recovery') setMode('recovery')
        }

        // 4) Optionaler Hinweis über Query (wenn du resetPasswordForEmail mit ?recovery=1 schickst)
        if (sp.get('recovery') === '1') setMode('recovery')

        // URL aufräumen
        window.history.replaceState({}, document.title, '/auth/callback')

        // Falls noch kein Recovery-Modus gesetzt wurde → fertig
        if (mode === 'loading') setMode('done')
      } catch (e:any) {
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
    } catch (e:any) {
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
