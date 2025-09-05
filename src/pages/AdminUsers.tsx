// src/pages/AdminUsers.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  user_id: string;
  email: string | null;
  role: 'admin'|'staff'|'partner'|'viewer'|string;
  org_id: string | null;
  created_at: string | null;
};
type Org = { id: string; name: string };

export default function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  // Form: create/invite
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // optional
  const [role, setRole] = useState<Profile['role']>('staff');
  const [orgId, setOrgId] = useState<string>('');

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [pr, or] = await Promise.all([
      supabase.from('profiles').select('user_id, email, role, org_id, created_at').order('created_at', { ascending: false }),
      supabase.from('orgs').select('id, name').order('name'),
    ]);
    if (!pr.error && pr.data) setProfiles(pr.data as any);
    if (!or.error && or.data) setOrgs(or.data as any);
    setLoading(false);
  }

  async function createUser(ev: React.FormEvent) {
    ev.preventDefault();
    const payload = {
      email: email.trim(),
      password: password ? password : undefined,
      role,
      org_id: orgId || null,
      invite: password ? false : true,
    };
    const res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'Fehler'); return; }
    setEmail(''); setPassword(''); setRole('staff'); setOrgId('');
    await load();
    alert('Benutzer angelegt / eingeladen.');
  }

  async function saveRow(p: Profile) {
    const res = await fetch('/api/admin-users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: p.user_id, role: p.role, org_id: p.org_id }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'Fehler'); return; }
    await load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Admin · Benutzerverwaltung</h2>

      <form onSubmit={createUser} className="grid grid-cols-4 gap-3 border rounded p-4 text-sm">
        <label className="col-span-2">E‑Mail
          <input className="border rounded px-3 py-2 w-full" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        </label>
        <label>Passwort (optional)
          <input className="border rounded px-3 py-2 w-full" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="leer = Einladung per E‑Mail" />
        </label>
        <label>Rolle
          <select className="border rounded px-3 py-2 w-full" value={role} onChange={e=>setRole(e.target.value as any)}>
            <option value="admin">admin</option>
            <option value="staff">staff</option>
            <option value="partner">partner</option>
            <option value="viewer">viewer</option>
          </select>
        </label>
        <label>Organisation
          <select className="border rounded px-3 py-2 w-full" value={orgId} onChange={e=>setOrgId(e.target.value)}>
            <option value="">—</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <div className="col-span-4 flex justify-end">
          <button className="rounded bg-slate-800 text-white text-sm px-4 py-2">Benutzer anlegen / einladen</button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-2 text-left">E‑Mail</th>
              <th className="p-2 text-left">Rolle</th>
              <th className="p-2 text-left">Org</th>
              <th className="p-2 text-left">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={4}>Lade…</td></tr>
            ) : profiles.length === 0 ? (
              <tr><td className="p-3" colSpan={4}>Keine Benutzer.</td></tr>
            ) : profiles.map(p => (
              <tr key={p.user_id} className="border-b">
                <td className="p-2">{p.email ?? '—'}</td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1" value={p.role} onChange={e=>setProfiles(old => old.map(x => x.user_id===p.user_id? {...x, role: e.target.value as any} : x))}>
                    <option value="admin">admin</option>
                    <option value="staff">staff</option>
                    <option value="partner">partner</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1" value={p.org_id ?? ''} onChange={e=>setProfiles(old => old.map(x => x.user_id===p.user_id? {...x, org_id: e.target.value || null} : x))}>
                    <option value="">—</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <button className="text-blue-700 hover:underline" onClick={()=>saveRow(p)}>Speichern</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
