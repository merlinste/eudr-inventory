import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const [mode, setMode] = useState<'login'|'signup'|'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // Wenn bereits eingeloggt, direkt ins App-Home
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav('/', { replace: true })
    })
  }, [nav])

  const next = (loc.state as any)?.from || '/'

  async function handleLogin() {
    setLoading(true); setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password }) // E-Mail/Passwort-Login
    setLoading(false)
    if (error) setMessage(error.message)
    else nav(next, { replace: true })
  }

  async function handleSignup() {
    setLoading(true); setMessage(null)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${origin}/auth/callback` } // Link führt zurück in die App
    })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Bitte E‑Mail prüfen und Registrierung bestätigen.')
  }

  async function handleReset() {
    setLoading(true); setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback` // dort neues Passwort setzen
    })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Wenn die E‑Mail existiert, wurde ein Reset‑Link gesendet.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded p-6 space-y-4">
        <h1 className="text-xl font-semibold text-center">Anmelden</h1>

        <div className="space-y-3">
          <label className="block text-sm">E‑Mail
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          </label>

          {mode !== 'reset' && (
            <label className="block text-sm">Passwort
              <input
                className="mt-1 w-full border rounded px-3 py-2"
                type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='signup'?'new-password':'current-password'} />
            </label>
          )}

          {message && <div className="text-sm text-red-600">{message}</div>}

          {mode === 'login' && (
            <>
              <button onClick={handleLogin} disabled={loading}
                className="w-full bg-slate-900 text-white rounded py-2">
                {loading ? 'Bitte warten…' : 'Einloggen'}
              </button>
              <div className="flex justify-between text-sm">
                <button className="underline" onClick={()=>setMode('reset')}>Passwort vergessen?</button>
                <button className="underline" onClick={()=>setMode('signup')}>Konto erstellen</button>
              </div>
            </>
          )}

          {mode === 'signup' && (
            <>
              <button onClick={handleSignup} disabled={loading}
                className="w-full bg-slate-900 text-white rounded py-2">
                {loading ? 'Bitte warten…' : 'Registrieren'}
              </button>
              <div className="flex justify-between text-sm">
                <button className="underline" onClick={()=>setMode('login')}>Schon ein Konto? Einloggen</button>
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <button onClick={handleReset} disabled={loading}
                className="w-full bg-slate-900 text-white rounded py-2">
                {loading ? 'Bitte warten…' : 'Reset‑Link anfordern'}
              </button>
              <div className="flex justify-between text-sm">
                <button className="underline" onClick={()=>setMode('login')}>Zurück zum Login</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
