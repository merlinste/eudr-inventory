import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Role = 'admin'|'staff'|'partner'
type Org = { id: string; name: string }
type ProfileRow = { user_id: string; email: string | null; role: Role; org_id: string | null }

export default function AdminUsers(){
  const [orgs, setOrgs] = useState<Org[]>([])
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [orgId, setOrgId] = useState<string | ''>('')

  useEffect(() => { void load() }, [])
  async function load(){
    const [o,p] = await Promise.all([
      supabase.from('orgs').select('id,name').order('name'),
      supabase.from('profiles').select('user_id,email,role,org_id').order('created_at', { ascending: false })
    ])
    if (!o.error && o.data) setOrgs(o.data as Org[])
    if (!p.error && p.data) setRows(p.data as ProfileRow[])
  }

  async function invite(){
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ email, password: pwd || undefined, role, org_id: orgId || null })
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Fehler'); return }
    alert('Benutzer angelegt / eingeladen.')
    setEmail(''); setPwd('')
    await load()
  }

  async function saveRow(r: ProfileRow){
    const { error } = await supabase.from('profiles').update({
      role: r.role, org_id: r.org_id
    }).eq('user_id', r.user_id)
    if (error) alert(error.message); else alert('Gespeichert.')
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Admin · Benutzerverwaltung</h2>

      <div className="border rounded p-4 space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <label>E‑Mail
            <input className="border rounded px-3 py-2 w-full" value={email} onChange={e=>setEmail(e.target.value)} />
          </label>
          <label>Passwort (optional)
            <input className="border rounded px-3 py-2 w-full" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="leer = Einladung per E‑Mail"/>
          </label>
          <label>Rolle
            <select className="border rounded px-3 py-2 w-full" value={role} onChange={e=>setRole(e.target.value as Role)}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
              <option value="partner">partner</option>
            </select>
          </label>
          <label className="col-span-3">Organisation
            <select className="border rounded px-3 py-2 w-full" value={orgId} onChange={e=>setOrgId(e.target.value)}>
              <option value="">—</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={invite}>
            Benutzer anlegen / einladen
          </button>
        </div>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-2 text-left">E‑Mail</th>
              <th className="p-2 text-left">Rolle</th>
              <th className="p-2 text-left">Org</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className="border-b">
                <td className="p-2">{r.email ?? '—'}</td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1"
                          value={r.role}
                          onChange={e=>{
                            const v = e.target.value as Role
                            setRows(prev => prev.map((x,idx) => idx===i ? { ...x, role:v } : x))
                          }}>
                    <option value="staff">staff</option>
                    <option value="admin">admin</option>
                    <option value="partner">partner</option>
                  </select>
                </td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1"
                          value={r.org_id ?? ''}
                          onChange={e=>{
                            const v = e.target.value || null
                            setRows(prev => prev.map((x,idx)=> idx===i ? { ...x, org_id: v as any } : x))
                          }}>
                    <option value="">—</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <button className="text-blue-700 hover:underline" onClick={()=>saveRow(rows[i])}>Speichern</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
