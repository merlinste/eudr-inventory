import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Seiten
import AuthCallback from '@/pages/AuthCallback'
import Login from '@/pages/Login'
import Stock from '@/pages/Stock'
import Lots from '@/pages/Lots'
import LotDetail from '@/pages/LotDetail'
import Productions from '@/pages/Productions'
import Partners from '@/pages/Partners'
import Eudr from '@/pages/Eudr'
import Warehouses from '@/pages/Warehouses'
import Products from '@/pages/Products'
import AdminUsers from '@/pages/AdminUsers'
import Archive from '@/pages/Archive'

import Shell from '@/components/Shell'

// ---- Auth‑Guard -------------------------------------------------------------

type RequireAuthProps = { children?: JSX.Element } // children optional – vermeidet TS2741

function RequireAuth({ children }: RequireAuthProps) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setAuthed(!!data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(!!s)
      setReady(true)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  if (!ready) return <div className="p-6 text-slate-500">Lade …</div>
  if (!authed) return <Navigate to="/login" replace />

  // Wenn kein Kind übergeben wurde, rendert Shell später via <Outlet/>
  return children ?? <Shell />
}

// ---- Router ----------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* öffentlich */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* geschützter Bereich + Layout */}
        <Route element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<Navigate to="/stock" replace />} />

          <Route path="/stock" element={<Stock />} />
          <Route path="/lots" element={<Lots />} />
          <Route path="/lots/:id" element={<LotDetail />} />

          <Route path="/productions" element={<Productions />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/eudr" element={<Eudr />} />
          <Route path="/warehouses" element={<Warehouses />} />
          <Route path="/products" element={<Products />} />
          <Route path="/archive" element={<Archive />} />

          <Route path="/admin/users" element={<AdminUsers />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/stock" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
