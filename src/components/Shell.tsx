// src/components/Shell.tsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

const baseItem = 'block px-3 py-2 rounded transition-colors';
const link = ({ isActive }: { isActive: boolean }) =>
  `${baseItem} ${isActive ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'}`;

export default function Shell() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-earlybird.svg" alt="earlybird" className="h-6 w-auto" />
            <span className="text-slate-900 font-semibold">inventory</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {email && <>Angemeldet als <span className="font-medium">{email}</span></>}
            <button onClick={logout} className="rounded bg-slate-800 text-white px-3 py-1.5">Logout</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl grid grid-cols-[220px_1fr] gap-6 px-4 py-6">
        <aside className="border-r pr-4">
          <nav className="flex flex-col gap-1 text-sm">
            <NavLink to="/stock" className={link}>Bestand</NavLink>
            <NavLink to="/lots" className={link}>Lots</NavLink>
            <NavLink to="/productions" className={link}>Produktionen</NavLink>
            <NavLink to="/eudr" className={link}>EUDR</NavLink>
            <NavLink to="/partners" className={link}>Partner</NavLink>
            <NavLink to="/warehouses" className={link}>Läger</NavLink>
            <NavLink to="/products" className={link}>Produkte</NavLink>
            <div className="h-4" />
            <NavLink to="/archive" className={link}>Archiv</NavLink>
            <NavLink to="/admin/users" className={link}>Admin</NavLink>
          </nav>
        </aside>

        <main className="pb-24">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
