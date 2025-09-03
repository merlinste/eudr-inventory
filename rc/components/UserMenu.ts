import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function UserMenu() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  if (!email) return null
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-600">Angemeldet als <strong>{email}</strong></span>
      <button
        className="bg-slate-200 hover:bg-slate-300 rounded px-2 py-1"
        onClick={async () => {
          await supabase.auth.signOut()
          window.location.assign('/login')
        }}>
        Logout
      </button>
    </div>
  )
}
