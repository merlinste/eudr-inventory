import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

type ShellProps = {
  /** optional – wir rendern die Child-Routes über <Outlet/> */
  children?: React.ReactNode
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded hover:bg-slate-100 ${isActive ? 'text-slate-900 font-medium' : 'text-slate-600'}`

export default function Shell({ children }: ShellProps) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let mounted = true

    // initial laden
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data?.session ?? null)
    })

    // Abo
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const email = session?.user?.email ?? '—'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <img src="/logo.png" alt="earlybird" className="h-7 w-auto" />
          <nav className="flex gap-1">
            <NavLink to="/stock" className={linkClass}>Bestand</NavLink>
            <NavLink to="/lots" className={linkClass}>Lots</NavLink>
            <NavLink to="/productions" className={linkClass}>Produktionen</NavLink>
            <NavLink to="/eudr" className={linkClass}>EUDR</NavLink>
            <NavLink to="/partners" className={linkClass}>Partner</NavLink>
            <NavLink to="/warehouses" className={linkClass}>Läger</NavLink>
            <NavLink to="/products" className={linkClass}>Produkte</NavLink>
            <NavLink to="/archive" className={linkClass}>Archiv</NavLink>
            <NavLink to="/admin/users" className={linkClass}>Admin</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">Angemeldet als</span>
            <span className="font-medium">{email}</span>
            <button
              onClick={logout}
              className="ml-2 rounded bg-slate-800 text-white px-3 py-1.5 text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Inhalt */}
      <main className="mx-auto max-w-7xl w-full px-4 py-6">
        {/* Wenn Kinder direkt übergeben wurden, zeige sie; ansonsten die verschachtelten Routen */}
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
