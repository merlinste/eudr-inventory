import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

import Shell from '@/components/Shell'
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
import Account from '@/pages/Account'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* öffentlich */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/account" element={<Account />} />

        {/* geschützte App – Shell rendert <Outlet/> */}
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
          <Route path="/admin/users" element={<AdminUsers />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/** ---------- Auth-Guard ---------- */
function RequireAuth({ children }: { children: JSX.Element }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    let active = true

    // 1) Initialsession laden (sofortiger Status, verhindert frühe Redirects)
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthed(!!data.session)
      setReady(true)
    })

    // 2) Auf Auth-Events hören (incl. INITIAL_SESSION / PASSWORD_RECOVERY)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAuthed(!!session)
      setReady(true)
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  // 3) Erkennen, ob wir gerade im Auth-Callback sind (PKCE/Recovery/Implicit)
  const isAuthCallback =
    loc.pathname === '/auth/callback' ||
    loc.search.includes('code=') ||
    loc.search.includes('type=recovery') ||
    loc.hash.includes('access_token') ||  // implicit flow
    loc.hash.includes('type=recovery')

  if (!ready) return <div className="p-6 text-sm">Lade…</div>
  if (!authed) {
    // Während des Callbacks nicht weg-navigieren – die Callback-Seite erledigt den Rest
    if (isAuthCallback) return <div className="p-6 text-sm">Einen Moment…</div>
    return <Navigate to="/login" replace />
  }
  return children
}
