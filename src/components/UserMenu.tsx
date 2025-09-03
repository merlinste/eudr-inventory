import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Link } from 'react-router-dom'

export default function UserMenu() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email ?? '') })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser()
      if (active) setEmail(data.user?.email ?? '')
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:block text-sm text-slate-700 truncate max-w-[220px] font-mono">{email || '—'}</span>
      <Link to="/account" className="text-sm underline decoration-dotted">Mein Konto</Link>
      <button onClick={() => supabase.auth.signOut()} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm">
        Abmelden
      </button>
    </div>
  )
}
