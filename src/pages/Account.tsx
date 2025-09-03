import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Account() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

  async function setPassword() {
    setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setMsg(error ? error.message : 'Passwort gespeichert.')
    if (!error) setPw('')
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-4">Mein Konto</h2>
      <div className="text-sm mb-4">Angemeldet als: <span className="font-mono">{email || '—'}</span></div>

      <label className="block text-sm mb-2">Neues Passwort
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)}
               className="mt-1 w-full border rounded px-3 py-2" placeholder="••••••••" />
      </label>
      <button onClick={setPassword} className="bg-slate-900 text-white rounded px-3 py-2 text-sm">Speichern</button>
      {msg && <div className="mt-3 text-sm text-slate-600">{msg}</div>}
    </div>
  )
}
