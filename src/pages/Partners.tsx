import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Org = {
  id: string
  name: string
  kind: 'importer' | 'roaster' | 'other'
  size: 'sme' | 'non_sme'
}

type Producer = { id: string; name: string }
type Lot = { id: string; short_desc: string | null }

export default function Partners() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Neues Partner-Form
  const [newPartner, setNewPartner] = useState({
    name: '',
    kind: 'roaster' as Org['kind'],
    size: 'sme' as Org['size'],
  })

  // Freigabe-Form
  const [grantProducerId, setGrantProducerId] = useState<string>('')
  const [grantLotIds, setGrantLotIds] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setErr(null)

      // 1) sichtbare Organisationen (eigene + Partner)
      const o = await supabase.from('organizations')
        .select('id,name,kind,size')
        .order('name', { ascending: true })

      // 2) Produzentenliste aus View (RLS-fest)
      const p = await supabase.from('v_my_producers')
        .select('id,name')
        .order('name', { ascending: true })

      // 3) eigene Green-Lots (Kurzliste für Freigabe)
      const l = await supabase.from('green_lots')
        .select('id,short_desc')
        .order('created_at', { ascending: false })

      if (!alive) return
      if (o.error) setErr(o.error.message)
      if (p.error) setErr(p.error.message || null)
      if (l.error) setErr(l.error.message || null)

      setOrgs((o.data ?? []) as Org[])
      setProducers((p.data ?? []) as Producer[])
      setLots((l.data ?? []) as Lot[])

      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  async function createPartner(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      if (!newPartner.name.trim()) {
        setErr('Bitte einen Namen eingeben.')
        return
      }
      const { error } = await supabase.rpc('create_partner_org', {
        p_name: newPartner.name.trim(),
        p_kind: newPartner.kind,         // enum org_kind: importer|roaster|other
        p_size: newPartner.size,         // enum size_class: sme|non_sme
        p_country: null
      })
      if (error) throw error

      // Liste neu laden
      const res = await supabase.from('organizations').select('id,name,kind,size').order('name')
      if (res.error) throw res.error
      setOrgs((res.data ?? []) as Org[])
      setNewPartner({ name: '', kind: 'roaster', size: 'sme' })
    } catch (e: any) {
      setErr(e.message ?? String(e))
    }
  }

  async function grantLots() {
    setErr(null)
    try {
      if (!grantProducerId) { setErr('Bitte zuerst einen Produzenten wählen.'); return }
      if (grantLotIds.length === 0) { setErr('Bitte mindestens ein Lot wählen.'); return }

      // Bestehende Freigaben für diesen Producer einmal holen
      const existing = await supabase
        .from('lot_assignments')
        .select('green_lot_id')
        .eq('producer_org_id', grantProducerId)
        .in('green_lot_id', grantLotIds)

      if (existing.error) throw existing.error
      const already = new Set((existing.data ?? []).map(r => r.green_lot_id))
      const inserts = grantLotIds
        .filter(id => !already.has(id))
        .map(id => ({ green_lot_id: id, producer_org_id: grantProducerId }))

      if (inserts.length > 0) {
        const ins = await supabase.from('lot_assignments').insert(inserts)
        if (ins.error) throw ins.error
      }

      // Reset
      setGrantLotIds([])
      alert('Lots freigegeben.')
    } catch (e: any) {
      setErr(e.message ?? String(e))
    }
  }

  if (loading) return <div>Lade…</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Partner</h2>

      {/* Liste der sichtbaren Orgs */}
      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Art</th>
              <th className="text-left p-2">Größe</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id} className="border-t">
                <td className="p-2">{o.name}</td>
                <td className="p-2">{labelKind(o.kind)}</td>
                <td className="p-2">{o.size}</td>
              </tr>
            ))}
            {orgs.length === 0 && <tr><td colSpan={3} className="p-2">Keine Organisationen sichtbar.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Neuen Partner anlegen */}
      <form onSubmit={createPartner} className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Neuen Partner anlegen</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="col-span-2">
            Name
            <input className="border rounded px-3 py-2 w-full"
                   value={newPartner.name}
                   onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}/>
          </label>
          <label>
            Art
            <select className="border rounded px-3 py-2 w-full"
                    value={newPartner.kind}
                    onChange={e => setNewPartner({ ...newPartner, kind: e.target.value as Org['kind'] })}>
              <option value="importer">Importeur</option>
              <option value="roaster">Röster</option>
              <option value="other">Andere</option>
            </select>
          </label>
          <label>
            Größe
            <select className="border rounded px-3 py-2 w-full"
                    value={newPartner.size}
                    onChange={e => setNewPartner({ ...newPartner, size: e.target.value as Org['size'] })}>
              <option value="sme">KMU</option>
              <option value="non_sme">Nicht‑KMU</option>
            </select>
          </label>
        </div>
        <div className="text-right">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2">Speichern</button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </form>

      {/* Lots für Produzenten freigeben */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Lots für Produzenten freigeben</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-sm">
            <label className="block mb-1">— Produzent wählen —</label>
            <select className="border rounded px-3 py-2 w-full"
                    value={grantProducerId}
                    onChange={e => setGrantProducerId(e.target.value)}>
              <option value="">(wählen)</option>
              {producers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="text-sm">
            <label className="block mb-1">Lots</label>
            <select multiple size={8}
                    className="border rounded px-3 py-2 w-full"
                    value={grantLotIds}
                    onChange={e => {
                      const opts = Array.from(e.target.selectedOptions).map(o => o.value)
                      setGrantLotIds(opts)
                    }}>
              {lots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.short_desc ?? l.id}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1">Tipp: Strg/Cmd gedrückt halten, um mehrere Lots zu wählen.</div>
          </div>
        </div>
        <div className="text-right">
          <button onClick={grantLots} className="rounded bg-green-700 text-white text-sm px-3 py-2">
            Freigeben
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
    </div>
  )
}

function labelKind(k: Org['kind']) {
  switch (k) {
    case 'importer': return 'Importeur'
    case 'roaster': return 'Röster'
    case 'other': return 'Andere'
    default: return String(k)
  }
}
