import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import UserMenu from '@/components/UserMenu'

type Profile = { role: 'admin'|'member'|'producer'|null }

export default function Shell() {
  const nav = useNavigate()
  const [me, setMe] = useState<Profile>({ role: null })

  useEffect(() => {
    let alive = true
    async function load() {
      const { data } = await supabase.from('profiles').select('role').maybeSingle()
      if (!alive) return
      setMe({ role: (data?.role ?? null) as any })
    }
    load()
    return () => { alive = false }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    nav('/login', { replace: true })
  }

  const isAdmin = me.role === 'admin'

  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="border-r p-4 space-y-4">
        <div className="text-lg font-semibold flex items-center gap-2">
          <img src="/logo.png" alt="earlybird" className="h-6" />
          <span>inventory</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink to="/stock" className={cls}>Bestand</NavLink>
          <NavLink to="/lots" className={cls}>Lots</NavLink>
          <NavLink to="/productions" className={cls}>Produktionen</NavLink>
          <NavLink to="/eudr" className={cls}>EUDR</NavLink>
          <NavLink to="/partners" className={cls}>Partner</NavLink>
          <NavLink to="/warehouses" className={cls}>Läger</NavLink>
          <NavLink to="/products" className={cls}>Produkte</NavLink>
          <header className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold">EUDR Inventory</div>
          <UserMenu />
          </header>
          {isAdmin && <NavLink to="/admin/users" className={cls}>Admin</NavLink>}
        </nav>
        <button onClick={signOut} className="text-left text-sky-700 underline text-sm">Abmelden</button>
      </aside>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
function cls({ isActive }: { isActive: boolean }) {
  return 'px-2 py-1 rounded ' + (isActive ? 'bg-slate-200' : 'hover:bg-slate-100')
}
