import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallback() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'exchanging'|'recovery'|'done'|'error'>('exchanging')
  const [msg, setMsg] = useState('Authentifiziere…')
  const [newPw, setNewPw] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    const next = url.searchParams.get('next') || '/'
    const code = url.searchParams.get('code')

    // 1) PKCE-Code in Session tauschen (falls vorhanden)
    ;(async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          window.history.replaceState({}, document.title, `/auth/callback?next=${encodeURIComponent(next)}`)
        }
      } catch (e:any) {
        setMode('error'); setMsg(e.message ?? String(e)); return
      }

      // 2) Passwort-Recovery?
      // Supabase setzt "type=recovery" in URL-Fragment, außerdem feuert ein PASSWORD_RECOVERY-Event.
      const hash = window.location.hash
      if (hash.includes('type=recovery')) {
        setMode('recovery'); setMsg('Neues Passwort vergeben'); return
      }

      // 3) ansonsten zurück in die App
      setMode('done'); nav(next, { replace: true })
    })()
  }, [nav])

  async function setPassword() {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      setMsg('Passwort aktualisiert. Bitte neu einloggen.'); setMode('done')
      setTimeout(() => nav('/login', { replace: true }), 1200)
    } catch (e:any) {
      setMsg(e.message ?? String(e))
    }
  }

  if (mode === 'recovery') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h2 className="font-semibold mb-3">Neues Passwort setzen</h2>
        <input type="password" className="border rounded px-3 py-2 w-full mb-3"
               placeholder="Neues Passwort" value={newPw} onChange={e=>setNewPw(e.target.value)} />
        <button className="bg-slate-900 text-white rounded px-3 py-2" onClick={setPassword}>Speichern</button>
        <div className="text-sm text-slate-600 mt-3">{msg}</div>
      </div>
    )
  }

  return <div className="p-6 text-sm">{msg}</div>
}
