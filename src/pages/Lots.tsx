import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Link } from 'react-router-dom'

type Lot = {
  id: string
  origin_country: string | null
  short_desc: string | null
  organic: boolean
  price_eur_per_kg: number | null
  price_currency: 'EUR' | 'USD' | null
  status: string | null
}

type Warehouse = { id: string; name: string; w_type: 'port'|'production'|'finished' }

export default function Lots() {
  const [rows, setRows] = useState<Lot[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Formularzustand
  const [formOpen, setFormOpen] = useState(false)
  const [f, setF] = useState({
    origin_country: '',
    short_desc: '',
    organic: false,
    price_eur_per_kg: '',
    price_currency: 'EUR',
    status: 'in_wh',
    initial_qty_kg: '',
    initial_warehouse_id: ''
  })

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setErr(null)
      const [lRes, wRes] = await Promise.all([
        supabase.from('green_lots').select('id, origin_country, short_desc, organic, price_eur_per_kg, price_currency, status').order('created_at', { ascending: false }),
        supabase.from('warehouses').select('id, name, w_type').order('name')
      ])
      if (!mounted) return
      if (lRes.error) setErr(lRes.error.message)
      if (wRes.error) setErr(wRes.error.message || null)
      setRows(lRes.data ?? [])
      setWarehouses(wRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  // Helper: eigene org_id holen (für Inserts)
async function getMyOrgId(): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('org_id').maybeSingle()
  if (error) throw error
  if (!data?.org_id) throw new Error('Kein Profileintrag gefunden – bitte Admin verknüpft deinen User mit einer Organisation.')
  return data.org_id
}

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      const orgId = await getMyOrgId()
      const { data: lot, error } = await supabase.from('green_lots').insert([{
        org_id: orgId,
        origin_country: f.origin_country || null,
        short_desc: f.short_desc || null,
        organic: f.organic,
        price_eur_per_kg: f.price_eur_per_kg ? Number(f.price_eur_per_kg) : null,
        price_currency: f.price_currency as 'EUR'|'USD',
        status: f.status
      }]).select('id').single()
      if (error) throw error

      // Anfangsbestand optional verbuchen
      const qty = f.initial_qty_kg ? Number(f.initial_qty_kg) : 0
      if (qty > 0 && f.initial_warehouse_id) {
        await supabase.from('inventory_moves').insert([{
          org_id: orgId,
          item: 'green',
          green_lot_id: lot.id,
          warehouse_id: f.initial_warehouse_id,
          direction: 'in',
          reason: 'purchase',
          qty_kg: qty,
          ref: 'initial'
        }])
      }

      // Liste neu laden + Formular schließen
      const { data: newList } = await supabase.from('green_lots').select('id, origin_country, short_desc, organic, price_eur_per_kg, price_currency, status').order('created_at', { ascending: false })
      setRows(newList ?? [])
      setFormOpen(false)
      setF({ origin_country: '', short_desc: '', organic: false, price_eur_per_kg: '', price_currency: 'EUR', status: 'in_wh', initial_qty_kg: '', initial_warehouse_id: '' })
    } catch (e:any) {
      setErr(e.message ?? String(e))
    }
  }

  const whOptions = useMemo(() => warehouses.map(w => ({ value: w.id, label: `${w.name}` })), [warehouses])

  if (loading) return <div>Lade Lots…</div>
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Rohkaffee-Lots</h2>
        <button className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm" onClick={() => setFormOpen(v => !v)}>
          {formOpen ? 'Abbrechen' : 'Neues Lot'}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={onCreate} className="border rounded p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded px-3 py-2" placeholder="Herkunftsland" value={f.origin_country} onChange={e => setF({...f, origin_country: e.target.value})}/>
            <input className="border rounded px-3 py-2" placeholder="Kurzbeschreibung" value={f.short_desc} onChange={e => setF({...f, short_desc: e.target.value})}/>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.organic} onChange={e=>setF({...f, organic: e.target.checked})}/> Bio
            </label>
            <div className="flex items-center gap-2">
              <input className="border rounded px-3 py-2 w-full" placeholder="Preis pro kg" value={f.price_eur_per_kg} onChange={e => setF({...f, price_eur_per_kg: e.target.value})}/>
              <select className="border rounded px-2 py-2" value={f.price_currency} onChange={e=>setF({...f, price_currency: e.target.value})}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <select className="border rounded px-3 py-2" value={f.status} onChange={e=>setF({...f, status: e.target.value})}>
              <option value="contracted">contracted</option>
              <option value="price_fixed">price_fixed</option>
              <option value="shipped">shipped</option>
              <option value="in_port">in_port</option>
              <option value="in_wh">in_wh</option>
              <option value="reserved">reserved</option>
              <option value="in_production">in_production</option>
              <option value="produced">produced</option>
              <option value="closed">closed</option>
            </select>
            <input className="border rounded px-3 py-2" placeholder="Anfangsbestand (kg, optional)" value={f.initial_qty_kg} onChange={e => setF({...f, initial_qty_kg: e.target.value})}/>
            <select className="border rounded px-3 py-2" value={f.initial_warehouse_id} onChange={e=>setF({...f, initial_warehouse_id: e.target.value})}>
              <option value="">Lager wählen (für Anfangsbestand)</option>
              {whOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="text-right">
            <button className="rounded bg-green-700 text-white px-3 py-1.5 text-sm">Speichern</button>
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
        </form>
      )}

      <table className="w-full border border-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2">Kurzbeschreibung</th>
            <th className="text-left p-2">Herkunft</th>
            <th className="text-left p-2">Bio</th>
            <th className="text-right p-2">Preis</th>
            <th className="text-left p-2">Währung</th>
            <th className="text-left p-2">Status</th>
            <th className="p-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.short_desc ?? '–'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2">{r.origin_country ?? '–'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2">{r.organic ? 'Ja' : 'Nein'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2 text-right">{r.price_eur_per_kg != null ? r.price_eur_per_kg.toLocaleString('de-DE') : '–'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2">{r.price_currency ?? '–'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2">{r.status ?? '–'}
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
