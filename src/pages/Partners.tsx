import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Org = { id: string; name: string; kind: 'producer'|'importer'|'trader'|'roaster'|'retailer'|'other'; size: 'sme'|'non_sme' }
type Lot = { id: string; short_desc: string | null }

export default function Partners() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // neues Partner‑Form
  const [form, setForm] = useState({ name: '', kind: 'producer', size: 'sme' })

  // Freigaben
  const [assignOrgId, setAssignOrgId] = useState('')
  const [assignLotIds, setAssignLotIds] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setErr(null)
      const [oRes, lRes] = await Promise.all([
        supabase.from('organizations').select('id, name, kind, size').order('name'),
        supabase.from('green_lots').select('id, short_desc').order('created_at', { ascending: false })
      ])
      if (!mounted) return
      if (oRes.error) setErr(oRes.error.message)
      if (lRes.error) setErr(lRes.error.message || null)
      setOrgs(oRes.data ?? [])
      setLots(lRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const producerOptions = useMemo(() => orgs.filter(o => o.kind === 'producer'), [orgs])

async function createPartner(e: FormEvent) {
  e.preventDefault()
  setErr(null)
  const { error } = await supabase.rpc('create_partner_org', {
    p_name: form.name,
    p_kind: form.kind,
    p_size: form.size,
    p_country: null
  })
  if (error) {
    setErr(error.message)
  } else {
    // Liste neu laden
    const { data, error: e2 } = await supabase
      .from('organizations')
      .select('id, name, kind, size')
      .order('name')
    if (e2) setErr(e2.message)
    setOrgs(data ?? [])
    setForm({ name: '', kind: 'producer', size: 'sme' })
  }
}

  async function assignLots() {
    try {
      if (!assignOrgId || assignLotIds.length === 0) return
      const rows = assignLotIds.map(id => ({ green_lot_id: id, producer_org_id: assignOrgId }))
      const { error } = await supabase.from('lot_assignments').upsert(rows, { ignoreDuplicates: true })
      if (error) throw error
      alert('Freigaben gespeichert.')
      setAssignLotIds([])
    } catch (e:any) {
      setErr(e.message ?? String(e))
    }
  }

  if (loading) return <div>Lade Partner…</div>

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-medium">Partner</h2>
        <table className="w-full border mt-3 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Art</th>
              <th className="p-2 text-left">Größe</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id} className="border-t">
                <td className="p-2">{o.name}</td>
                <td className="p-2">{o.kind}</td>
                <td className="p-2">{o.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border rounded p-4">
        <h3 className="font-medium mb-3">Neuen Partner anlegen</h3>
        <form onSubmit={createPartner} className="grid grid-cols-3 gap-3 text-sm">
          <input className="border rounded px-3 py-2" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} required/>
          <select className="border rounded px-2 py-2" value={form.kind} onChange={e=>setForm({...form, kind: e.target.value as any})}>
            <option value="producer">producer</option>
            <option value="importer">importer</option>
            <option value="trader">trader</option>
            <option value="retailer">retailer</option>
            <option value="roaster">roaster</option>
            <option value="other">other</option>
          </select>
          <select className="border rounded px-2 py-2" value={form.size} onChange={e=>setForm({...form, size: e.target.value as any})}>
            <option value="sme">sme</option>
            <option value="non_sme">non_sme</option>
          </select>
          <div className="col-span-3 text-right">
            <button className="rounded bg-slate-800 text-white px-3 py-1.5">Speichern</button>
          </div>
        </form>
      </section>

      <section className="border rounded p-4">
        <h3 className="font-medium mb-3">Lots für Produzenten freigeben</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <select className="border rounded px-2 py-2" value={assignOrgId} onChange={e=>setAssignOrgId(e.target.value)}>
            <option value="">— Produzent wählen —</option>
            {producerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="col-span-2">
            <select multiple className="border rounded px-2 py-2 w-full h-32"
              value={assignLotIds}
              onChange={e=>{
                const vals = Array.from(e.target.selectedOptions).map(o=>o.value)
                setAssignLotIds(vals)
              }}>
              {lots.map(l => <option key={l.id} value={l.id}>{l.short_desc ?? l.id.slice(0,6)}</option>)}
            </select>
          </div>
        </div>
        <div className="text-right mt-3">
          <button onClick={assignLots} className="rounded bg-green-700 text-white px-3 py-1.5">Freigeben</button>
        </div>
        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      </section>
    </div>
  )
}
