import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Lots from './pages/Lots'
import Productions from './pages/Productions'
import EUDR from './pages/EUDR'
import Partners from './pages/Partners'
import AuthCallback from './pages/AuthCallback'
import LotDetail from './pages/LotDetail'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="p-6 text-slate-600">Lade…</div>

  return (
    <Routes>
      <Route path="auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Login />} />
      <Route path="lots/:id" element={<LotDetail />} />
      <Route
        path="/*"
        element={
          isAuthed ? (
            <Dashboard>
              <Routes>
                <Route index element={<Navigate to="inventory" replace />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="lots" element={<Lots />} />
                <Route path="productions" element={<Productions />} />
                <Route path="eudr" element={<EUDR />} />
                <Route path="partners" element={<Partners />} />
              </Routes>
            </Dashboard>
          ) : (
            <Navigate to="/login" replace state={{ from: location.pathname }} />
          )
        }
      />
    </Routes>
  )
}
