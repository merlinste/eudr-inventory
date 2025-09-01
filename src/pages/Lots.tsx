// src/pages/Lots.tsx
import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

// ---- Types (lokal)
type Species = 'arabica' | 'robusta' | 'other'
type PriceScheme = 'fixed_eur' | 'fixed_usd' | 'differential'
type LotStatus = 'contracted' | 'price_fixed' | 'at_port' | 'at_production_wh' | 'produced' | 'closed' | null

type LotRow = {
  id: string
  short_desc: string | null
  external_contract_no: string | null
  dds_reference: string | null
  origin_country: string | null
  organic: boolean
  species: Species
  status: LotStatus
}

type Warehouse = { id: string; name: string; w_type: string }

// ---- Formular-Shape + Defaults
type LotForm = {
  short_desc: string
  external_contract_no: string
  dds_reference: string
  origin_country: string
  organic: boolean
  species: Species
  status: LotStatus
  price_scheme: PriceScheme
  price_fixed_eur_per_kg: string
  price_fixed_usd_per_lb: string
  diff_root: string
  diff_month_code: string
  diff_year: string
  diff_value: string
  initial_quantity_kg: string
  initial_warehouse_id: string
}

const FORM_DEFAULTS: LotForm = {
  short_desc: '',
  external_contract_no: '',
  dds_reference: '',
  origin_country: '',
  organic: false,
  species: 'arabica',
  status: 'contracted',
  price_scheme: 'fixed_eur',
  price_fixed_eur_per_kg: '',
  price_fixed_usd_per_lb: '',
  diff_root: 'KC',          // ICE Arabica
  diff_month_code: '',      // (H,K,N,U,Z) → Mär/Mai/Jul/Sep/Dez
  diff_year: '',
  diff_value: '',
  initial_quantity_kg: '',
  initial_warehouse_id: ''
}

// ---- Auswahllisten
const COUNTRIES = [
  'Brazil','Vietnam','Colombia','Indonesia','Ethiopia','Honduras','India','Uganda','Mexico','Guatemala',
  'Peru','Nicaragua','Costa Rica','Kenya','Tanzania','Rwanda','Burundi','El Salvador','Panama','Ecuador',
  'Papua New Guinea','DR Congo','Cameroon','Yemen','Bolivia','Dominican Republic','Laos','Thailand','China (Yunnan)'
]

const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: 'arabica', label: 'Arabica' },
  { value: 'robusta', label: 'Robusta' },
  { value: 'other',   label: 'Andere' },
]

const STATUS_OPTIONS: { value: NonNullable<LotStatus>; label: string }[] = [
  { value: 'contracted',       label: 'Kontrahiert' },
  { value: 'price_fixed',      label: 'Preis fixiert' },
  { value: 'at_port',          label: 'Im Hafen' },
  { value: 'at_production_wh', label: 'Im Produktionslager' },
  { value: 'produced',         label: 'Produziert' },
  { value: 'closed',           label: 'Abgeschlossen' },
]

const PRICE_SCHEMES: { value: PriceScheme; label: string }[] = [
  { value: 'fixed_eur', label: 'Fixiert in EUR/kg' },
  { value: 'fixed_usd', label: 'Fixiert in USD/lb' },
  { value: 'differential', label: 'Differential (KC/RC ± diff)' },
]

const DIFF_ROOTS = [
  { value: 'KC', label: 'KC (Arabica ICE)' },
  { value: 'RC', label: 'RC (Robusta ICE)' },
]

// Für KC sind üblich: H (Mär), K (Mai), N (Jul), U (Sep), Z (Dez)
const FUT_MONTHS = [
  { value: 'H', label: 'Mär (H)' },
  { value: 'K', label: 'Mai (K)' },
  { value: 'N', label: 'Jul (N)' },
  { value: 'U', label: 'Sep (U)' },
  { value: 'Z', label: 'Dez (Z)' },
]

export default function Lots() {
  const [rows, setRows]   = useState<LotRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [f, setF] = useState<LotForm>(FORM_DEFAULTS)
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  // Laden
  async function load() {
    setLoading(true); setErr(null)
    const [lotsRes, whRes] = await Promise.all([
      supabase.from('green_lots')
        .select('id, short_desc, external_contract_no, dds_reference, origin_country, organic, species, status')
        .order('created_at', { ascending: false }),
      supabase.from('v_my_warehouses')
        .select('id,name,w_type').order('name', { ascending: true })
    ])
    if (lotsRes.error) setErr(lotsRes.error.message)
    if (whRes.error) setErr(whRes.error.message || null)
    setRows((lotsRes.data ?? []) as LotRow[])
    setWarehouses((whRes.data ?? []) as Warehouse[])
    setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  // Filtern
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(r => {
      return (
        (r.short_desc ?? '').toLowerCase().includes(term) ||
        (r.origin_country ?? '').toLowerCase().includes(term) ||
        (r.external_contract_no ?? '').toLowerCase().includes(term) ||
        (r.dds_reference ?? '').toLowerCase().includes(term)
      )
    })
  }, [rows, q])

  // Insert
  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      // org_id für RLS
      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      const orgId = prof.data?.org_id
      if (!orgId) throw new Error('Kein org_id im Profil gefunden.')

      // Payload bauen
      const price_fixed_eur_per_kg = f.price_scheme === 'fixed_eur' ? numOrNull(f.price_fixed_eur_per_kg) : null
      const price_fixed_usd_per_lb = f.price_scheme === 'fixed_usd' ? numOrNull(f.price_fixed_usd_per_lb) : null
      const diff_root       = f.price_scheme === 'differential' ? (f.diff_root || null) : null
      const diff_month_code = f.price_scheme === 'differential' ? (f.diff_month_code || null) : null
      const diff_year       = f.price_scheme === 'differential' ? intOrNull(f.diff_year) : null
      const diff_value      = f.price_scheme === 'differential' ? numOrNull(f.diff_value) : null

      const insertLot = {
        org_id: orgId,
        short_desc: emptyToNull(f.short_desc),
        external_contract_no: emptyToNull(f.external_contract_no),
        dds_reference: emptyToNull(f.dds_reference),
        origin_country: emptyToNull(f.origin_country),
        organic: !!f.organic,
        species: f.species,
        status: f.status,
        price_scheme: f.price_scheme,
        price_fixed_eur_per_kg,
        price_fixed_usd_per_lb,
        diff_root, diff_month_code, diff_year, diff_value
      }

      const lotRes = await supabase.from('green_lots').insert([insertLot]).select('id').single()
      if (lotRes.error) throw lotRes.error
      const newLotId = lotRes.data!.id as string

      // optionaler Startbestand
      const qty = numOrNull(f.initial_quantity_kg)
      if (qty && f.initial_warehouse_id) {
        const mv = await supabase.from('inventory_moves').insert([{
          org_id: orgId,
          item: 'green',
          green_lot_id: newLotId,
          delta_kg: qty,
          warehouse_id: f.initial_warehouse_id
        }])
        if (mv.error) throw mv.error
      }

      // Reset & Reload
      setF(FORM_DEFAULTS)
      await load()
    } catch (e: any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Rohkaffee‑Lots</h2>

      {/* Suche */}
      <div className="flex items-center justify-between gap-3">
        <input
          className="border rounded px-3 py-2 w-full max-w-md text-sm"
          placeholder="Suchen (Beschreibung, Herkunft, Kontraktnr., DDS‑Ref)…"
          value={q} onChange={e=>setQ(e.target.value)}
        />
        <div className="text-sm text-slate-500">{filtered.length} von {rows.length}</div>
      </div>

      {/* Tabelle */}
      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Sorte</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">DDS‑Ref</th>
              <th className="text-left p-2">Kontraktnr.</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.short_desc ?? r.id}</td>
                <td className="p-2">{r.origin_country ?? '—'}</td>
                <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                <td className="p-2">{labelSpecies(r.species)}</td>
                <td className="p-2">{labelStatus(r.status)}</td>
                <td className="p-2">{r.dds_reference ?? '—'}</td>
                <td className="p-2">{r.external_contract_no ?? '—'}</td>
                <td className="p-2">
                  <Link to={`/lots/${r.id}`} className="text-sky-700 underline">Details</Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="p-2" colSpan={8}>Keine Lots gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Neues Lot */}
      <form onSubmit={onCreate} className="border rounded p-4 space-y-4">
        <h3 className="font-medium">Neues Lot anlegen</h3>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="col-span-2">Kurzbeschreibung
            <input className="border rounded px-3 py-2 w-full"
                   value={f.short_desc}
                   onChange={e=>setF(prev=>({...prev, short_desc:e.target.value}))}/>
          </label>
          <label>Herkunftsland
            <select className="border rounded px-3 py-2 w-full"
                    value={f.origin_country}
                    onChange={e=>setF(prev=>({...prev, origin_country:e.target.value}))}>
              <option value="">— wählen —</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full"
                   value={f.external_contract_no}
                   onChange={e=>setF(prev=>({...prev, external_contract_no:e.target.value}))}/>
          </label>
          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full"
                   value={f.dds_reference}
                   onChange={e=>setF(prev=>({...prev, dds_reference:e.target.value}))}/>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.organic}
                   onChange={e=>setF(prev=>({...prev, organic:e.target.checked}))}/>
            Bio
          </label>

          <label>Sorte
            <select className="border rounded px-3 py-2 w-full"
                    value={f.species}
                    onChange={e=>setF(prev=>({...prev, species:e.target.value as Species}))}>
              {SPECIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label>Status
            <select className="border rounded px-3 py-2 w-full"
                    value={f.status ?? 'contracted'}
                    onChange={e=>setF(prev=>({...prev, status: e.target.value as LotStatus}))}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {/* Preis */}
        <div className="border rounded p-3">
          <div className="font-medium mb-2 text-sm">Preis</div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <label>Schema
              <select className="border rounded px-3 py-2 w-full"
                      value={f.price_scheme}
                      onChange={e=>setF(prev=>({...prev, price_scheme: e.target.value as PriceScheme}))}>
                {PRICE_SCHEMES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>

            {f.price_scheme === 'fixed_eur' && (
              <label className="col-span-3">Fixpreis EUR/kg
                <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                       value={f.price_fixed_eur_per_kg}
                       onChange={e=>setF(prev=>({...prev, price_fixed_eur_per_kg: e.target.value}))}/>
              </label>
            )}

            {f.price_scheme === 'fixed_usd' && (
              <label className="col-span-3">Fixpreis USD/lb
                <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                       value={f.price_fixed_usd_per_lb}
                       onChange={e=>setF(prev=>({...prev, price_fixed_usd_per_lb: e.target.value}))}/>
              </label>
            )}

            {f.price_scheme === 'differential' && (
              <>
                <label>Kontrakt
                  <select className="border rounded px-3 py-2 w-full"
                          value={f.diff_root}
                          onChange={e=>setF(prev=>({...prev, diff_root: e.target.value}))}>
                    {DIFF_ROOTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <label>Monat
                  <select className="border rounded px-3 py-2 w-full"
                          value={f.diff_month_code}
                          onChange={e=>setF(prev=>({...prev, diff_month_code: e.target.value}))}>
                    <option value="">—</option>
                    {FUT_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label>Jahr (YYYY)
                  <input className="border rounded px-3 py-2 w-full"
                         placeholder="2026"
                         value={f.diff_year}
                         onChange={e=>setF(prev=>({...prev, diff_year: e.target.value}))}/>
                </label>
                <label>Diff (±)
                  <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                         placeholder="+0.20"
                         value={f.diff_value}
                         onChange={e=>setF(prev=>({...prev, diff_value: e.target.value}))}/>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Startbestand */}
        <div className="border rounded p-3">
          <div className="font-medium mb-2 text-sm">Startbestand (optional)</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label>Menge (kg)
              <input type="number" step="0.01"
                     className="border rounded px-3 py-2 w-full"
                     value={f.initial_quantity_kg}
                     onChange={e=>setF(prev=>({...prev, initial_quantity_kg: e.target.value}))}/>
            </label>
            <label>in Lager
              <select className="border rounded px-3 py-2 w-full"
                      value={f.initial_warehouse_id}
                      onChange={e=>setF(prev=>({...prev, initial_warehouse_id: e.target.value}))}>
                <option value="">— wählen —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <div className="self-center text-xs text-slate-500">
              Wenn beides gesetzt ist, wird ein Bestandseintrag erstellt.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" disabled={busy}>
            {busy ? 'Speichere…' : 'Lot anlegen'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Helpers
function labelSpecies(s: Species) {
  switch (s) {
    case 'arabica': return 'Arabica'
    case 'robusta': return 'Robusta'
    default: return 'Andere'
  }
}
function labelStatus(s: LotStatus) {
  switch (s) {
    case 'contracted': return 'Kontrahiert'
    case 'price_fixed': return 'Preis fixiert'
    case 'at_port': return 'Im Hafen'
    case 'at_production_wh': return 'Im Produktionslager'
    case 'produced': return 'Produziert'
    case 'closed': return 'Abgeschlossen'
    default: return '—'
  }
}
function emptyToNull(s: string) { return s.trim() === '' ? null : s }
function numOrNull(s: string) { const n = parseFloat(s); return isFinite(n) ? n : null }
function intOrNull(s: string) { const n = parseInt(s, 10); return Number.isInteger(n) ? n : null }
