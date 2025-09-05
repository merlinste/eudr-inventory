import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

function linkClass(active: boolean) {
  return `px-3 py-2 rounded ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    const sub = supabase.auth.onAuthStateChange((_e, s) => setEmail(s.user?.email ?? ''))
    return () => sub.data.subscription.unsubscribe()
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            {/* logo from /public */}
            <img src="/logo.png" alt="earlybird" className="h-7 w-auto" />
            <span className="font-semibold">inventory</span>
          </Link>
          <div className="text-sm text-slate-600">
            Angemeldet als <span className="font-medium">{email || '—'}</span>
            <button
              className="ml-3 text-slate-700 hover:underline"
              onClick={() => supabase.auth.signOut()}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-[220px,1fr] gap-6 py-6">
        <aside className="space-y-1">
          {[
            ['/', 'Bestand'],
            ['/lots', 'Lots'],
            ['/productions', 'Produktionen'],
            ['/eudr', 'EUDR'],
            ['/partners', 'Partner'],
            ['/warehouses', 'Läger'],
            ['/products', 'Produkte'],
            ['/archive', 'Archiv'],
            ['/admin/users', 'Admin'],
          ].map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => linkClass(isActive && (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to)))}>
              {label}
            </NavLink>
          ))}
        </aside>

        <main>{children}</main>
      </div>
    </div>
  )
}
