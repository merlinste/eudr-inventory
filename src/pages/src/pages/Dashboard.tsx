import { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function Dashboard({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const loc = useLocation()

  async function signOut() {
    await supabase.auth.signOut()
    nav('/login')
  }

  const items = [
    { to: '/inventory', label: 'Bestand' },
    { to: '/lots', label: 'Lots' },
    { to: '/productions', label: 'Produktionen' },
    { to: '/eudr', label: 'EUDR' },
    { to: '/partners', label: 'Partner' }
  ]

  return (
    <div className="min-h-full grid grid-cols-[220px_1fr]">
      <aside className="border-r p-4 space-y-2">
        <div className="font-medium mb-3">earlybird inventory</div>
        <nav className="space-y-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className={
                'block px-2 py-1 rounded ' +
                (loc.pathname.startsWith(it.to)
                  ? 'bg-slate-200'
                  : 'hover:bg-slate-100')
              }
            >
              {it.label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="mt-6 text-sm text-slate-600 hover:underline">
          Abmelden
        </button>
      </aside>
      <main className="p-6">{children}</main>
    </div>
  )
}
