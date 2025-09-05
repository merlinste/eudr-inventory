// src/components/Shell.tsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

const baseItem = 'block px-3 py-2 rounded transition-colors';
const makeLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${baseItem} ${isActive ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'}`;

export default function Shell() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // initiale Mail laden
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    // und auf Auth-Änderungen reagieren
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="text-slate-900 font-semibold">earlybird · inventory</div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {email && (
              <span>
                Angemeldet als <span className="font-medium">{email}</span>
              </span>
            )}
            <button onClick={logout} className="rounded bg-slate-800 text-white px-3 py-1.5">
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-7xl grid grid-cols-[220px_1fr] gap-6 px-4 py-6">
        <aside className="border-r pr-4">
          <nav className="flex flex-col gap-1 text-sm">
            <NavLink to="/stock" className={makeLinkClass}>Bestand</NavLink>
            <NavLink to="/lots" className={makeLinkClass}>Lots</NavLink>
            <NavLink to="/productions" className={makeLinkClass}>Produktionen</NavLink>
            <NavLink to="/eudr" className={makeLinkClass}>EUDR</NavLink>
            <NavLink to="/partners" className={makeLinkClass}>Partner</NavLink>
            <NavLink to="/warehouses" className={makeLinkClass}>Läger</NavLink>
            <NavLink to="/products" className={makeLinkClass}>Produkte</NavLink>
            <div className="h-4" />
            <NavLink to="/archive" className={makeLinkClass}>Archiv</NavLink>
            <NavLink to="/admin/users" className={makeLinkClass}>Admin</NavLink>
          </nav>
        </aside>

        <main className="pb-20">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
