// src/pages/LotDetail.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

type Lot = {
  id: string
  short_desc: string | null
  external_contract_no: string | null
  dds_reference: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica'|'robusta'|'other'
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
}

type Wh = { id: string; name: string }

type WhBalance = { warehouse_id: string; name: string; balance_kg: number }

export default function LotDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lot, setLot] = useState<Lot | null>(null)
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [balances, setBalances] = useState<WhBalance[]>([])
  const [err, setErr] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)

  // Edit form
  const [shortDesc, setShortDesc] = useState('')
  const [status, setStatus] = useState<Lot['status']>('contracted')
  const [ddsRef, setDdsRef] = useState('')
  const [extNo, setExtNo] = useState('')

  // Split form
  const [srcWh, setSrcWh] = useState('')
  const [dstWh, setDstWh] = useState('')
  const [moveKg, setMoveKg] = useState('')
  const [newShort, setNewShort] = useState('')

  useEffect(() => { if (id) void load(id) }, [id])

  async function load(lotId: string) {
    setErr(null)
    const [lr, whr, br] = await Promise.all([
      supabase.from('green_lots').select('id, short_desc, status, dds_reference, external_contract_no').eq('id', lotId).single(),
      supabase.from('v_my_warehouses').select('id,name').order('name'),
      // per Warehouse Saldo (nur GREEN)
      supabase.rpc('rpc_green_lot_balances', { p_lot_id: lotId }).then(r => {
        if (!r.error) return { data: r.data, error: null } as any
        // Fallback: direkt aus inventory_moves aggregieren, falls RPC nicht existiert
        return supabase.from('inventory_moves')
          .select('warehouse_id, delta_kg, warehouses(name)')
          .eq('green_lot_id', lotId).eq('item','green')
      })
    ])

    if (lr.error) setErr(lr.error.message)
    else {
      setLot(lr.data as any)
      setShortDesc(lr.data?.short_desc ?? '')
      setStatus((lr.data?.status ?? 'contracted') as any)
      setDdsRef(lr.data?.dds_reference ?? '')
      setExtNo(lr.data?.external_contract_no ?? '')
      setNewShort(lr.data?.short_desc ? `${lr.data.short_desc} (Teil)` : '')
    }
    if (!whr.error) setWarehouses((whr.data ?? []) as Wh[])

    // Balances
    if (!br.error && Array.isArray(br.data)) {
      const rows = (br.data as any[]).map(r => ({
        warehouse_id: r.warehouse_id ?? r.warehouses?.id,
        name: r.name ?? r.warehouses?.name ?? 'Lager',
        balance_kg: Number(r.balance_kg ?? r.delta_kg ?? 0)
      }))
      // Falls nur einzelne Bewegungen geliefert wurden: pro Lager summieren
      const agg: Record<string, WhBalance> = {}
      for (const r of rows) {
        if (!r.warehouse_id) continue
        agg[r.warehouse_id] ??= { warehouse_id: r.warehouse_id, name: r.name, balance_kg: 0 }
        agg[r.warehouse_id].balance_kg += Number(r.balance_kg)
      }
      setBalances(Object.values(agg))
    }
  }

  async function saveEdit() {
    if (!id) return
    setSaving(true); setErr(null)
    const upd = await supabase.from('green_lots').update({
      short_desc: shortDesc || null,
      status,
      dds_reference: ddsRef || null,
      external_contract_no: extNo || null
    }).eq('id', id)
    setSaving(false)
    if (upd.error) setErr(upd.error.message)
    else alert('Gespeichert.')
  }

  async function doSplit() {
    if (!id) return
    const kg = parseFloat(moveKg)
    if (!srcWh || !dstWh || !isFinite(kg) || kg <= 0) {
      alert('Bitte Quelle, Ziel und kg angeben.'); return
    }
    const res = await supabase.rpc('safe_split_green_lot', {
      p_source_id: id,
      p_src_warehouse_id: srcWh,
      p_dst_warehouse_id: dstWh,
      p_move_kg: kg,
      p_new_short_desc: newShort || null
    })
    if (res.error) {
      alert(res.error.message)
    } else {
      alert('Lot aufgeteilt.'); navigate('/lots')
    }
  }

  if (!lot) return <div>Lade…</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      {/* Bearbeiten */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Stammdaten bearbeiten</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Kurzbeschreibung
            <input className="border rounded px-3 py-2 w-full"
                   value={shortDesc} onChange={e=>setShortDesc(e.target.value)} />
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full"
                    value={status ?? 'contracted'} onChange={e=>setStatus(e.target.value as any)}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>
          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full"
                   value={ddsRef} onChange={e=>setDdsRef(e.target.value)} />
          </label>
          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full"
                   value={extNo} onChange={e=>setExtNo(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center justify-between">
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={saveEdit} disabled={saving}>
            {saving ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Bestände je Lager */}
      <div className="border rounded p-4 space-y-2">
        <h3 className="font-medium">Aktueller Bestand je Lager (GREEN)</h3>
        <ul className="list-disc pl-5 text-sm">
          {balances.map(b => (
            <li key={b.warehouse_id}>{b.name}: {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(b.balance_kg)} kg</li>
          ))}
          {balances.length === 0 && <li>Keine Bewegungen erfasst.</li>}
        </ul>
      </div>

      {/* Aufteilen */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Lot aufteilen & zwischen Lagern bewegen</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label>Quelle (Lager)
            <select className="border rounded px-3 py-2 w-full" value={srcWh} onChange={e=>setSrcWh(e.target.value)}>
              <option value="">— wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>Ziel (Lager)
            <select className="border rounded px-3 py-2 w-full" value={dstWh} onChange={e=>setDstWh(e.target.value)}>
              <option value="">— wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>Menge (kg)
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                   value={moveKg} onChange={e=>setMoveKg(e.target.value)} />
          </label>
          <label>Neue Lot‑Bezeichnung (optional)
            <input className="border rounded px-3 py-2 w-full"
                   value={newShort} onChange={e=>setNewShort(e.target.value)} />
          </label>
        </div>
        <div>
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={doSplit}>
            Aufteilen
          </button>
        </div>
      </div>

      {/* (Deine Leaflet‑Karte kann hier drunter bleiben) */}
    </div>
  )
}
