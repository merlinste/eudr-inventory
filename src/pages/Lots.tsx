// src/pages/Lots.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

type Species = 'arabica' | 'robusta' | 'other'
type LotStatus = 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null

type LotRow = {
  id: string
  lot_no?: string | null
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: Species
  status: LotStatus
  dds_reference?: string | null
  external_contract_no?: string | null
  price_scheme: PriceScheme
  price_fixed_eur_per_kg?: number | null
  price_fixed_usd_per_lb?: number | null
  price_diff_cents_per_lb?: number | null
  price_diff_usd_per_ton?: number | null
  price_base_contract?: string | null
}

type ContractOpt = { value: string; label: string; yyyymm: string }

// Month codes ICE: Jan..Dec = F G H J K M N Q U V X Z
const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z'] as const
const KC_CYCLE = new Set(['H','K','N','U','Z'])       // Mar, May, Jul, Sep, Dec
const RC_CYCLE = new Set(['F','H','K','N','U','X'])   // Jan, Mar, May, Jul, Sep, Nov

function buildNextContracts(count: number, product: 'KC'|'RC'): ContractOpt[] {
  const res: ContractOpt[] = []
  const d = new Date()
  d.setUTCDate(1)
  while (res.length < count) {
    const m = d.getUTCMonth()                     // 0..11
    const y = d.getUTCFullYear()
    const code = MONTH_CODES[m]                   // F..Z
    const ok = product === 'RC' ? RC_CYCLE.has(code) : KC_CYCLE.has(code)
    if (ok) {
      const sym = product
      const y1 = String(y).slice(-1)             // 2025 -> "5"
      const codeStr = `${sym}${code}${y1}`       // KCZ5
      const mm = String(m+1).padStart(2,'0')     // "12"
      res.push({
        value: codeStr,
        label: `${mm}/${y} (${codeStr})`,
        yyyymm: `${y}-${mm}`,
      })
    }
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return res
}

const COUNTRIES = [
  'Brazil','Colombia','Peru','Ethiopia','Kenya','Guatemala','Honduras','India',
  'Indonesia','Uganda','Tanzania','Vietnam','Mexico','Nicaragua','Rwanda','Burundi'
]

export default function Lots() {
  const [rows, setRows] = useState<LotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const [form, setForm] = useState({
    short_desc: '',
    origin_country: 'Brazil',
    organic: false,
    species: 'arabica' as Species,
    status: 'contracted' as LotStatus,
    dds_reference: '',
    external_contract_no: '',
    price_scheme: 'fixed_eur' as PriceScheme,
    price_fixed_eur_per_kg: '' as string | number,
    price_fixed_usd_per_lb: '' as string | number,
    price_diff_cents_per_lb: '' as string | number,
    price_diff_usd_per_ton: '' as string | number,
    price_base_contract: '' as string,
  })

  // KC/RC-Kontrakte je nach Spezies (8 Stück)
  const contractOptions = useMemo<ContractOpt[]>(
    () => buildNextContracts(8, form.species === 'robusta' ? 'RC' : 'KC'),
    [form.species]
  )

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('green_lots')
      .select('id, lot_no, short_desc, origin_country, organic, species, status, dds_reference, external_contract_no, price_scheme, price_base_contract')
      .order('created_at', { ascending: false })
    if (!error && data) setRows(data as LotRow[])
    setLoading(false)
  }

  function resetForm() {
    setForm({
      short_desc: '',
      origin_country: 'Brazil',
      organic: false,
      species: 'arabica',
      status: 'contracted',
      dds_reference: '',
      external_contract_no: '',
      price_scheme: 'fixed_eur',
      price_fixed_eur_per_kg: '',
      price_fixed_usd_per_lb: '',
      price_diff_cents_per_lb: '',
      price_diff_usd_per_ton: '',
      price_base_contract: contractOptions[0]?.value ?? '',
    })
  }

  async function submitNewLot(e: React.FormEvent) {
    e.preventDefault()
    const payload: any = {
      short_desc: form.short_desc || null,
      origin_country: form.origin_country || null,
      organic: !!form.organic,
      species: form.species,
      status: form.status,
      dds_reference: form.dds_reference || null,
      external_contract_no: form.external_contract_no || null,
      price_scheme: form.price_scheme,
      price_base_contract: form.price_base_contract || null,
    }

    if (form.price_scheme === 'fixed_eur') {
      payload.price_fixed_eur_per_kg = form.price_fixed_eur_per_kg ? Number(form.price_fixed_eur_per_kg) : null
      payload.price_fixed_usd_per_lb = null
      payload.price_diff_cents_per_lb = null
      payload.price_diff_usd_per_ton = null
    } else if (form.price_scheme === 'fixed_usd') {
      payload.price_fixed_usd_per_lb = form.price_fixed_usd_per_lb ? Number(form.price_fixed_usd_per_lb) : null
      payload.price_fixed_eur_per_kg = null
      payload.price_diff_cents_per_lb = null
      payload.price_diff_usd_per_ton = null
    } else if (form.price_scheme === 'differential') {
      if (form.species === 'arabica') {
        payload.price_diff_cents_per_lb = form.price_diff_cents_per_lb ? Number(form.price_diff_cents_per_lb) : null
        payload.price_diff_usd_per_ton = null
      } else if (form.species === 'robusta') {
        payload.price_diff_usd_per_ton = form.price_diff_usd_per_ton ? Number(form.price_diff_usd_per_ton) : null
        payload.price_diff_cents_per_lb = null
      }
      payload.price_fixed_eur_per_kg = null
      payload.price_fixed_usd_per_lb = null
    }

    const { error } = await supabase.from('green_lots').insert([payload])
    if (error) {
      alert(error.message)
    } else {
      resetForm()
      await load()
      alert('Neues Lot angelegt.')
    }
  }

  async function removeLot(id: string) {
    if (!confirm('Wirklich löschen?')) return
    const { error } = await supabase.from('green_lots').delete().eq('id', id)
    if (error) alert(error.message)
    else setRows(prev => prev.filter(r => r.id !== id))
  }

  const filtered = rows.filter((r) => {
    const s = (q || '').toLowerCase()
    if (!s) return true
    const hay = [
      r.lot_no ?? '', r.short_desc ?? '', r.origin_country ?? '',
      r.external_contract_no ?? '', r.dds_reference ?? ''
    ].join(' ').toLowerCase()
    return hay.includes(s)
  })

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Rohkaffee‑Lots</h2>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Suche (Bezeichnung, Herkunft, DDS, Kontrakt)…"
        value={q}
        onChange={e=>setQ(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
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
            {loading ? (
              <tr><td className="p-3" colSpan={9}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-3" colSpan={9}>Keine Lots gefunden.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2 font-mono">{r.lot_no ?? '—'}</td>
                <td className="p-2">
                  <Link to={`/lots/${r.id}`} className="text-blue-700 hover:underline">
                    {r.short_desc ?? '—'}
                  </Link>
                </td>
                <td className="p-2">{r.origin_country ?? '—'}</td>
                <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                <td className="p-2">{r.species}</td>
                <td className="p-2">{toStatusLabel(r.status)}</td>
                <td className="p-2">{r.dds_reference ?? '—'}</td>
                <td className="p-2">{r.external_contract_no ?? '—'}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <Link to={`/lots/${r.id}`} className="text-blue-700 hover:underline">Details</Link>
                    <button className="text-red-600 hover:underline" onClick={()=>removeLot(r.id)}>Löschen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formular: neues Lot */}
      <div className="border rounded p-4">
        <h3 className="font-medium mb-3">Neues Lot anlegen</h3>
        <form onSubmit={submitNewLot} className="grid grid-cols-2 gap-3 text-sm">
          <label>Bezeichnung
            <input className="border rounded px-3 py-2 w-full"
              value={form.short_desc}
              onChange={e=>setForm({...form, short_desc: e.target.value})}/>
          </label>

          <label>Herkunftsland
            <select className="border rounded px-3 py-2 w-full"
              value={form.origin_country ?? ''}
              onChange={e=>setForm({...form, origin_country: e.target.value})}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label>Art
            <select className="border rounded px-3 py-2 w-full"
              value={form.species}
              onChange={e=>{
                const sp = e.target.value as Species
                const first = buildNextContracts(8, sp === 'robusta' ? 'RC' : 'KC')[0]?.value ?? ''
                setForm(prev => ({ ...prev, species: sp, price_base_contract: first }))
              }}>
              <option value="arabica">Arabica</option>
              <option value="robusta">Robusta</option>
              <option value="other">Andere</option>
            </select>
          </label>

          <label>Status
            <select className="border rounded px-3 py-2 w-full"
              value={form.status ?? 'contracted'}
              onChange={e=>setForm({...form, status: e.target.value as LotStatus})}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>

          <label>Bio
            <select className="border rounded px-3 py-2 w-full"
              value={form.organic ? '1' : '0'}
              onChange={e=>setForm({...form, organic: e.target.value === '1'})}>
              <option value="0">Nein</option>
              <option value="1">Ja</option>
            </select>
          </label>

          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full"
              value={form.dds_reference}
              onChange={e=>setForm({...form, dds_reference: e.target.value})}/>
          </label>

          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full"
              value={form.external_contract_no}
              onChange={e=>setForm({...form, external_contract_no: e.target.value})}/>
          </label>

          {/* Preisschema & Basis-Kontrakt */}
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label>Preisschema
              <select className="border rounded px-3 py-2 w-full"
                value={form.price_scheme ?? 'fixed_eur'}
                onChange={e=>setForm({...form, price_scheme: e.target.value as PriceScheme})}>
                <option value="fixed_eur">Fixiert in EUR/kg</option>
                <option value="fixed_usd">Fixiert in USD/lb</option>
                <option value="differential">Differential</option>
              </select>
            </label>

            <label>Basis‑Kontrakt (Monat)
              <select className="border rounded px-3 py-2 w-full"
                value={form.price_base_contract ?? ''}
                onChange={e=>setForm({...form, price_base_contract: e.target.value})}>
                {contractOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>

            {form.price_scheme === 'fixed_eur' && (
              <label>EUR/kg
                <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                  value={form.price_fixed_eur_per_kg}
                  onChange={e=>setForm({...form, price_fixed_eur_per_kg: e.target.value})}/>
              </label>
            )}

            {form.price_scheme === 'fixed_usd' && (
              <label>USD/lb
                <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                  value={form.price_fixed_usd_per_lb}
                  onChange={e=>setForm({...form, price_fixed_usd_per_lb: e.target.value})}/>
              </label>
            )}

            {form.price_scheme === 'differential' && form.species === 'arabica' && (
              <label>Diff. (c/lb, +/‑)
                <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                  value={form.price_diff_cents_per_lb}
                  onChange={e=>setForm({...form, price_diff_cents_per_lb: e.target.value})}/>
              </label>
            )}

            {form.price_scheme === 'differential' && form.species === 'robusta' && (
              <label>Diff. (USD/t, +/‑)
                <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                  value={form.price_diff_usd_per_ton}
                  onChange={e=>setForm({...form, price_diff_usd_per_ton: e.target.value})}/>
              </label>
            )}
          </div>

          <div className="col-span-2 flex justify-end mt-2">
            <button className="rounded bg-slate-800 text-white text-sm px-4 py-2">Lot anlegen</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function toStatusLabel(s: LotStatus) {
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
