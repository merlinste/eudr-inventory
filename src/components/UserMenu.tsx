import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function UserMenu() {
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? '')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser()
      if (active) setEmail(data.user?.email ?? '')
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-mono">{email || '—'}</span>
      <button
        className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300"
        onClick={() => supabase.auth.signOut()}
      >
        Abmelden
      </button>
    </div>
  )
}
