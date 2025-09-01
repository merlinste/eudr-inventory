import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import logoUrl from '@/assets/earlybird-logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signInPassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  async function signInAzure() {
    setBusy(true); setError(null)
    const origin = window.location.origin
    const next = '/inventory'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email',
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`
      }
    })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center">
          <img src={logoUrl} alt="earlybird coffee" className="h-10 w-auto" />
        </div>
        <h1 className="text-xl text-center">Anmeldung</h1>

        <button
          onClick={signInAzure}
          className="w-full rounded bg-black/80 text-white py-2"
          disabled={busy}
        >
          Mit Microsoft anmelden
        </button>

        <div className="text-center text-sm text-slate-500">oder</div>

        <form onSubmit={signInPassword} className="space-y-2">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            className="w-full rounded bg-slate-800 text-white py-2"
            disabled={busy}
          >
            Login
          </button>
        </form>

        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>
    </div>
  )
}
