import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

type Org = { id: string; name: string }
type Profile = { user_id: string; email: string | null; role: 'admin'|'member'|'producer'; org_id: string }

export default function AdminUsers() {
  const [me, setMe] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Invite/Assign form
  const [email, setEmail] = useState('')
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState<'admin'|'member'|'producer'>('member')

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setErr(null)
      const auth = await supabase.auth.getUser()
      const meRes = await supabase.from('profiles').select('user_id,email,role,org_id').eq('user_id', auth.data.user?.id ?? '').maybeSingle()
      if (!alive) return
      if (meRes.error) { setErr(meRes.error.message); setLoading(false); return }
      setMe(meRes.data as any)

      const oRes = await supabase.from('organizations').select('id,name').order('name')
      if (oRes.error) { setErr(oRes.error.message); setLoading(false); return }
      setOrgs((oRes.data ?? []) as Org[])

      const pRes = await supabase.from('profiles').select('user_id,email,role,org_id').order('email', { ascending: true })
      if (pRes.error) { setErr(pRes.error.message); setLoading(false); return }
      setRows((pRes.data ?? []) as Profile[])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  const isAdmin = me?.role === 'admin'
  if (loading) return <div>Lade…</div>
  if (!isAdmin) return <Navigate to="/" replace />

  async function saveRow(p: Profile, patch: Partial<Profile>) {
    setErr(null)
    const { error } = await supabase.from('profiles')
      .update({ role: patch.role ?? p.role, org_id: patch.org_id ?? p.org_id })
      .eq('user_id', p.user_id)
    if (error) setErr(error.message)
    else setRows(rows.map(r => r.user_id === p.user_id ? { ...r, ...patch } as Profile : r))
  }

  async function inviteOrAssign() {
    setErr(null)
    if (!email || !orgId) { setErr('Bitte E‑Mail und Organisation wählen.'); return }
    const { error } = await supabase.rpc('assign_user_to_org', { p_email: email, p_org_id: orgId, p_role: role })
    if (error) setErr(error.message)
    else {
      setEmail(''); setOrgId(''); setRole('member')
      const pRes = await supabase.from('profiles').select('user_id,email,role,org_id').order('email', { ascending: true })
      if (!pRes.error) setRows((pRes.data ?? []) as Profile[])
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Admin · Nutzerverwaltung</h2>

      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Einladen / Zuweisen</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label className="col-span-2">
            E‑Mail
            <input className="border rounded px-3 py-2 w-full" value={email} onChange={e=>setEmail(e.target.value)} placeholder="roesterei@example.com"/>
          </label>
          <label>
            Organisation
            <select className="border rounded px-3 py-2 w-full" value={orgId} onChange={e=>setOrgId(e.target.value)}>
              <option value="">— wählen —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label>
            Rolle
            <select className="border rounded px-3 py-2 w-full" value={role} onChange={e=>setRole(e.target.value as any)}>
              <option value="member">Member</option>
              <option value="producer">Producer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button onClick={inviteOrAssign} className="rounded bg-slate-800 text-white text-sm px-3 py-2">Einladen / Zuweisen</button>
        <p className="text-xs text-slate-500 mt-1">Existiert die E‑Mail schon, wird das Profil sofort aktualisiert. Andernfalls wird eine Einladung vorgemerkt.</p>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">E‑Mail</th>
              <th className="text-left p-2">Organisation</th>
              <th className="text-left p-2">Rolle</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user_id} className="border-t">
                <td className="p-2">{r.email ?? '—'}</td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1"
                          value={r.org_id}
                          onChange={e=>saveRow(r, { org_id: e.target.value })}>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1"
                          value={r.role}
                          onChange={e=>saveRow(r, { role: e.target.value as any })}>
                    <option value="member">Member</option>
                    <option value="producer">Producer</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="p-2">
                  <button className="rounded px-2 py-1 bg-slate-200" onClick={()=>saveRow(r, {})}>Speichern</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-2" colSpan={4}>Keine Profile sichtbar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
