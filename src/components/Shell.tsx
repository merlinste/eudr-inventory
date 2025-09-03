import { Outlet, NavLink } from 'react-router-dom'
import UserMenu from '@/components/UserMenu'
import logo from '@/assets/earlybird_logo_small.png'

export default function Shell() {
  return (
    <div className="h-screen grid grid-rows-[56px_1fr] grid-cols-[240px_1fr]">
      {/* Header */}
      <header className="col-span-2 flex items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="earlybird" className="h-6" />
          <span className="font-semibold">inventory</span>
        </div>
        <UserMenu />
      </header>

      {/* Sidebar */}
      <aside className="border-r px-3 py-4">
        <nav className="flex flex-col gap-2 text-sm">
          <NavLink to="/stock" className={({isActive})=>isActive?'font-medium':''}>Bestand</NavLink>
          <NavLink to="/lots" className={({isActive})=>isActive?'font-medium':''}>Lots</NavLink>
          <NavLink to="/productions" className={({isActive})=>isActive?'font-medium':''}>Produktionen</NavLink>
          <NavLink to="/eudr" className={({isActive})=>isActive?'font-medium':''}>EUDR</NavLink>
          <NavLink to="/partners" className={({isActive})=>isActive?'font-medium':''}>Partner</NavLink>
          <NavLink to="/warehouses" className={({isActive})=>isActive?'font-medium':''}>Läger</NavLink>
          <NavLink to="/products" className={({isActive})=>isActive?'font-medium':''}>Produkte</NavLink>
          <NavLink to="/admin/users" className={({isActive})=>isActive?'font-medium':''}>Admin</NavLink>
        </nav>
      </aside>

      {/* Content */}
      <main className="overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  )
}
