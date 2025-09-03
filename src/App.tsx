import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import Eudr from '@/pages/Eudr'          // << Datei heißt genau: src/pages/Eudr.tsx
import Warehouses from '@/pages/Warehouses'
import Products from '@/pages/Products'
import AdminUsers from '@/pages/AdminUsers'  // falls noch nicht vorhanden: siehe unten

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

// --- Auth-Guard
function RequireAuth({ children }: { children: JSX.Element }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(!!s); setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session); setReady(true)
    })
    return () => { sub.data.subscription.unsubscribe() }
  }, [])

  if (!ready) return <div className="p-6">Lade…</div>
  if (!authed) return <Navigate to="/login" replace />
  return children
}

function StockPage() {
  return <div className="text-sm text-slate-700">Rohkaffee‑Bestand und Fertigwaren findest du in den jeweiligen Reitern.</div>
}
