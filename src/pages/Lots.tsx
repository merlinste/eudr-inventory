// src/pages/Lots.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

type LotRow = {
  id: string
  lot_no: string
  root_lot_no: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica'|'robusta'|'other'
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
  dds_reference: string | null
  external_contract_no: string | null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  price_diff_cents_per_lb: number | null
  price_base_contract: 'KC'|'RC'|null
  price_base_month: string | null
  created_at?: string | null
}

type Warehouse = { id: string; name: string }
type Form = {
  short_desc: string
  external_contract_no: string
  dds_reference: string
  origin_country: string
  organic: boolean
  species: 'arabica'|'robusta'|'other'
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'
  price_fixed_eur_per_kg: string
  price_fixed_usd_per_lb: string
  price_diff_cents_per_lb: string
  price_base_contract: 'KC'|'RC'
  price_base_month: string
  initial_warehouse_id: string
  initial_kg: string
}

const COUNTRIES = [
  'Brazil','Colombia','Ethiopia','Vietnam','Honduras','Peru','Uganda','Mexico','Guatemala','Nicaragua',
  'Costa Rica','Kenya','Tanzania','Rwanda','Burundi','Panama','El Salvador','Indonesia','India',
  'Papua New Guinea','Bolivia','Yemen','China','Dominican Republic','Congo',"Cote d'Ivoire"
]

// KC: Mar, May, Jul, Sep, Dec.  RC: Jan, Mar, May, Jul, Sep, Nov. (ICE contract months)
function futuresMonths(contract: 'KC'|'RC', count = 18): string[] {
  const allowed = contract === 'KC' ? [3,5,7,9,12] : [1,3,5,7,9,11]
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; out.length < count && i < 60; i++) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    if (allowed.includes(m)) out.push(`${y}-${String(m).padStart(2, '0')}`)
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

export default function Lots() {
  const [rows, setRows] = useState<LotRow[]>([])
  const [q, setQ] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [form, setForm] = useState<Form>({
    short_desc: '',
    external_contract_no: '',
    dds_reference: '',
    origin_country: 'Brazil',
    organic: false,
    species: 'arabica',
    status: 'contracted',
    price_scheme: 'fixed_eur',
    price_fixed_eur_per_kg: '',
    price_fixed_usd_per_lb: '',
    price_diff_cents_per_lb: '',
    price_base_contract: 'KC',
    price_base_month: '',
    initial_warehouse_id: '',
    initial_kg: ''
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const monthOptions = useMemo(
    () => futuresMonths(form.price_base_contract, 18),
    [form.price_base_contract]
  )

  useEffect(() => { void loadAll() }, [])
  async function loadAll() {
    const [lots, wh] = await Promise.all([
      supabase.from('green_lots').select('id,lot_no,root_lot_no,short_desc,origin_country,organic,species,status,dds_reference,external_contract_no,price_scheme,price_fixed_eur_per_kg,price_fixed_usd_per_lb,price_diff_cents_per_lb,price_base_contract,price_base_month,created_at').order('created_at', { ascending: false }),
      supabase.from('v_my_warehouses').select('id,name').order('name')
    ])
    if (!lots.error) setRows((lots.data ?? []) as LotRow[])
    if (!wh.error) setWarehouses((wh.data ?? []) as Warehouse[])
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.short_desc ?? '').toLowerCase().includes(t) ||
      (r.origin_country ?? '').toLowerCase().includes(t) ||
      (r.external_contract_no ?? '').toLowerCase().includes(t) ||
      (r.dds_reference ?? '').toLowerCase().includes(t)
    )
  }, [rows, q])

  async function createLot() {
    setErr(null); setBusy(true)
    try {
      if (form.price_scheme === 'differential') {
        if (!form.price_base_contract || !form.price_base_month || form.price_diff_cents_per_lb === '') {
          throw new Error('Bitte Basis (KC/RC), Liefermonat und Differential (c/lb) ausfuellen.')
        }
      }

      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      const orgId = prof.data?.org_id
      if (!orgId) throw new Error('Kein org_id im Profil.')

      const payload = {
        org_id: orgId,
        short_desc: form.short_desc || null,
        origin_country: form.origin_country || null,
        organic: !!form.organic,
        species: form.species,
        status: form.status,
        dds_reference: form.dds_reference || null,
        external_contract_no: form.external_contract_no || null,

        price_scheme: form.price_scheme,
        price_fixed_eur_per_kg: form.price_scheme === 'fixed_eur'
          ? (form.price_fixed_eur_per_kg ? Number(form.price_fixed_eur_per_kg) : null)
          : null,
        price_fixed_usd_per_lb: form.price_scheme === 'fixed_usd'
          ? (form.price_fixed_usd_per_lb ? Number(form.price_fixed_usd_per_lb) : null)
          : null,
        price_diff_cents_per_lb: form.price_scheme === 'differential'
          ? (form.price_diff_cents_per_lb ? Number(form.price_diff_cents_per_lb) : null)
          : null,
        price_base_contract: form.price_scheme === 'differential' ? form.price_base_contract : null,
        price_base_month: form.price_scheme === 'differential' ? (form.price_base_month || null) : null
      }

      const ins = await supabase.from('green_lots').insert([payload]).select('id').single()
      if (ins.error) throw ins.error
      const newId = ins.data!.id as string

      const initKg = Number(form.initial_kg || '0')
      if (form.initial_warehouse_id && initKg > 0) {
        const mv = await supabase.from('inventory_moves').insert([{
          org_id: orgId,
          item: 'green',
          green_lot_id: newId,
          delta_kg: initKg,
          warehouse_id: form.initial_warehouse_id,
          note: 'initial stock',
          direction: 'in',
          reason: 'initial'
        }])
        if (mv.error) throw mv.error
      }

      setForm(f => ({
        ...f,
        short_desc: '',
        external_contract_no: '',
        dds_reference: '',
        price_fixed_eur_per_kg: '',
        price_fixed_usd_per_lb: '',
        price_diff_cents_per_lb: '',
        price_base_month: '',
        initial_kg: ''
      }))
      await loadAll()
      alert('Lot angelegt.')
    } catch (e: any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteLot(id: string) {
    if (!confirm('Lot wirklich loeschen?')) return
    const res = await supabase.from('green_lots').delete().eq('id', id)
    if (res.error) alert(res.error.message)
    else setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Rohkaffee-Lots</h2>

      <div className="flex items-center justify-between gap-3">
        <input className="border rounded px-3 py-2 w-full max-w-md text-sm"
               placeholder="Suche (Bezeichnung, Herkunft, DDS, Kontrakt)…"
               value={q} onChange={e=>setQ(e.target.value)} />
        <div className="text-sm text-slate-500">{filtered.length} von {rows.length}</div>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot‑Nr.</th>
              <th className="text-left p-2">Bezeichnung</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Art</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">DDS</th>
              <th className="text-left p-2">Kontrakt #</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2"><Link className="text-sky-700 hover:underline" to={`/lots/${r.id}`}>{r.short_desc ?? '-'}</Link></td>
                <td className="p-2">{r.origin_country ?? '-'}</td>
                <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                <td className="p-2">{r.species}</td>
                <td className="p-2">{r.status ?? '-'}</td>
                <td className="p-2">{r.dds_reference ?? '-'}</td>
                <td className="p-2">{r.external_contract_no ?? '-'}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <Link className="rounded bg-slate-100 px-2 py-1 text-xs" to={`/lots/${r.id}`}>Details</Link>
                    <button className="rounded bg-red-100 text-red-700 text-xs px-2 py-1" onClick={() => deleteLot(r.id)}>Loeschen</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td className="p-2" colSpan={8}>Keine Lots gefunden.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="border rounded p-4 space-y-4">
        <h3 className="font-medium">Neues Lot anlegen</h3>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label>Bezeichnung
            <input className="border rounded px-3 py-2 w-full"
                   value={form.short_desc} onChange={e=>setForm(f=>({ ...f, short_desc: e.target.value }))} />
          </label>
          <label>Herkunftsland
            <select className="border rounded px-3 py-2 w-full"
                    value={form.origin_country} onChange={e=>setForm(f=>({ ...f, origin_country: e.target.value }))}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Bio
            <select className="border rounded px-3 py-2 w-full"
                    value={form.organic ? '1':'0'} onChange={e=>setForm(f=>({ ...f, organic: e.target.value === '1' }))}>
              <option value="0">Nein</option>
              <option value="1">Ja</option>
            </select>
          </label>

          <label>Art
            <select className="border rounded px-3 py-2 w-full"
                    value={form.species} onChange={e=>setForm(f=>({ ...f, species: e.target.value as Form['species'] }))}>
              <option value="arabica">Arabica</option>
              <option value="robusta">Robusta</option>
              <option value="other">Andere</option>
            </select>
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full"
                    value={form.status} onChange={e=>setForm(f=>({ ...f, status: e.target.value as Form['status'] }))}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>
          <label>DDS-Referenz
            <input className="border rounded px-3 py-2 w-full"
                   value={form.dds_reference} onChange={e=>setForm(f=>({ ...f, dds_reference: e.target.value }))} />
          </label>
          <label>Kontraktnummer Importeur/Haendler
            <input className="border rounded px-3 py-2 w-full"
                   value={form.external_contract_no} onChange={e=>setForm(f=>({ ...f, external_contract_no: e.target.value }))} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label>Preisschema
            <select className="border rounded px-3 py-2 w-full"
                    value={form.price_scheme}
                    onChange={e=>{
                      const val = e.target.value as Form['price_scheme']
                      setForm(f=>({
                        ...f,
                        price_scheme: val,
                        price_fixed_eur_per_kg: val==='fixed_eur' ? f.price_fixed_eur_per_kg : '',
                        price_fixed_usd_per_lb: val==='fixed_usd' ? f.price_fixed_usd_per_lb : '',
                        price_diff_cents_per_lb: val==='differential' ? f.price_diff_cents_per_lb : '',
                        price_base_month: val==='differential' ? f.price_base_month : ''
                      }))
                    }}>
              <option value="fixed_eur">Fixiert in EUR/kg</option>
              <option value="fixed_usd">Fixiert in USD/lb</option>
              <option value="differential">Differential (c/lb)</option>
            </select>
          </label>

          {form.price_scheme === 'fixed_eur' && (
            <label>EUR/kg
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                     value={form.price_fixed_eur_per_kg}
                     onChange={e=>setForm(f=>({ ...f, price_fixed_eur_per_kg: e.target.value }))} />
            </label>
          )}
          {form.price_scheme === 'fixed_usd' && (
            <label>USD/lb
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                     value={form.price_fixed_usd_per_lb}
                     onChange={e=>setForm(f=>({ ...f, price_fixed_usd_per_lb: e.target.value }))} />
            </label>
          )}

          {form.price_scheme === 'differential' && (
            <>
              <label>Basis (KC/RC)
                <select className="border rounded px-3 py-2 w-full"
                        value={form.price_base_contract}
                        onChange={e=>setForm(f=>({ ...f, price_base_contract: e.target.value as Form['price_base_contract'] }))}>
                  <option value="KC">KC</option>
                  <option value="RC">RC</option>
                </select>
              </label>
              <label>Liefermonat
                <select className="border rounded px-3 py-2 w-full"
                        value={form.price_base_month}
                        onChange={e=>setForm(f=>({ ...f, price_base_month: e.target.value }))}>
                  <option value="">- waehlen -</option>
                  {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Differential (c/lb)
                <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                       value={form.price_diff_cents_per_lb}
                       onChange={e=>setForm(f=>({ ...f, price_diff_cents_per_lb: e.target.value }))} />
              </label>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label>Initial-Lager (optional)
            <select className="border rounded px-3 py-2 w-full"
                    value={form.initial_warehouse_id}
                    onChange={e=>setForm(f=>({ ...f, initial_warehouse_id: e.target.value }))}>
              <option value="">-</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>Initial-Menge (kg)
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                   value={form.initial_kg}
                   onChange={e=>setForm(f=>({ ...f, initial_kg: e.target.value }))} />
          </label>
        </div>

        <div className="flex items-center justify-between">
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={createLot} disabled={busy}>
            {busy ? 'Speichere...' : 'Lot anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
