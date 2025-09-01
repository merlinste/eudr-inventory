import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import {
  COFFEE_COUNTRIES,
  COFFEE_SPECIES,
  LOT_STATUS,
  MONTHS_KC,
  MONTHS_RC,
} from '@/constants/taxonomies'
import { fetchEurPerKg, applyDifferential } from '@/lib/pricing'

type LotRow = {
  id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica' | 'robusta' | 'other' | null
  status: 'contracted' | 'price_fixed' | 'at_port' | 'at_production_wh' | 'produced' | 'closed' | null
  price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential'
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  diff_root: 'KC' | 'RM' | null
  diff_month_code: string | null
  diff_year: number | null
  diff_value: number | null
}

type Warehouse = { id: string; name: string; w_type: 'in_transit'|'port'|'production'|'finished'|'delivered' }

type CalcState = {
  symbol: string
  unit: string        // 'USc/lb' oder 'USD/t'
  baseEurKg: number   // Futures-Basis in EUR/kg (ohne Differential)
  eurKgWithDiff: number // inkl. Differential
} | null

export default function Lots() {
  const [rows, setRows] = useState<LotRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // Formularstatus
  const [formOpen, setFormOpen] = useState(false)
  const [calc, setCalc] = useState<CalcState>(null)

  const [f, setF] = useState({
    short_desc: '',
    origin_country: '',
    organic: false,
    species: 'arabica' as 'arabica'|'robusta'|'other',
    status: 'contracted' as LotRow['status'],
    price_scheme: 'fixed_eur' as LotRow['price_scheme'],
    price_fixed_eur_per_kg: '',
    price_fixed_usd_per_lb: '',
    diff_root: 'KC' as 'KC'|'RM',
    diff_month_code: '',
    diff_year: new Date().getFullYear(),
    diff_value: '',
    // Anfangsbestand (optional)
    initial_qty_kg: '',
    initial_warehouse_id: '',
  })

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setErr(null)
      const [lRes, wRes] = await Promise.all([
        supabase.from('green_lots').select(`
          id, short_desc, origin_country, organic, species, status,
          price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
          diff_root, diff_month_code, diff_year, diff_value
        `).order('created_at', { ascending: false }),
        supabase.from('warehouses').select('id, name, w_type').order('name')
      ])
      if (!mounted) return
      if (lRes.error) setErr(lRes.error.message)
      if (wRes.error) setErr(wRes.error.message || null)
      setRows((lRes.data ?? []) as LotRow[])
      setWarehouses((wRes.data ?? []) as Warehouse[])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const whOptions = useMemo(
    () => warehouses.map(w => ({ value: w.id, label: `${w.name}` })),
    [warehouses]
  )

  async function getMyOrgId(): Promise<string> {
    const { data, error } = await supabase.from('profiles').select('org_id').maybeSingle()
    if (error) throw error
    if (!data?.org_id) throw new Error('Kein Profileintrag mit org_id gefunden – bitte Admin verknüpfen.')
    return data.org_id
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setErr(null); setCalc(null)
    try {
      const orgId = await getMyOrgId()

      // Payload für green_lots
      const payload: any = {
        org_id: orgId,
        short_desc: f.short_desc || null,
        origin_country: f.origin_country || null,
        organic: !!f.organic,
        species: f.species,
        status: f.status ?? 'contracted',
        price_scheme: f.price_scheme,
      }

      if (f.price_scheme === 'fixed_eur') {
        payload.price_fixed_eur_per_kg = f.price_fixed_eur_per_kg ? Number(f.price_fixed_eur_per_kg) : null
        payload.price_fixed_usd_per_lb = null
        payload.diff_root = null
        payload.diff_month_code = null
        payload.diff_year = null
        payload.diff_value = null
      } else if (f.price_scheme === 'fixed_usd') {
        payload.price_fixed_usd_per_lb = f.price_fixed_usd_per_lb ? Number(f.price_fixed_usd_per_lb) : null
        payload.price_fixed_eur_per_kg = null
        payload.diff_root = null
        payload.diff_month_code = null
        payload.diff_year = null
        payload.diff_value = null
      } else {
        // differential
        if (!f.diff_month_code || !f.diff_year) {
          throw new Error('Bitte Kontrakt-Monat und Jahr wählen.')
        }
        payload.price_fixed_eur_per_kg = null
        payload.price_fixed_usd_per_lb = null
        payload.diff_root = f.diff_root
        payload.diff_month_code = f.diff_month_code
        payload.diff_year = f.diff_year
        payload.diff_value = f.diff_value ? Number(f.diff_value) : 0
      }

      const { data: lot, error: insErr } = await supabase
        .from('green_lots')
        .insert([payload])
        .select('id')
        .single()
      if (insErr) throw insErr

      // Anfangsbestand optional buchen
      const qty = f.initial_qty_kg ? Number(f.initial_qty_kg) : 0
      if (qty > 0 && f.initial_warehouse_id) {
        const { error: mvErr } = await supabase.from('inventory_moves').insert([{
          org_id: orgId,
          item: 'green',
          green_lot_id: lot!.id,
          warehouse_id: f.initial_warehouse_id,
          direction: 'in',
          reason: 'purchase',
          qty_kg: qty,
          ref: 'initial'
        }])
        if (mvErr) throw mvErr
      }

      // neu laden + Formular zurücksetzen
      const { data: newList } = await supabase.from('green_lots').select(`
        id, short_desc, origin_country, organic, species, status,
        price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
        diff_root, diff_month_code, diff_year, diff_value
      `).order('created_at', { ascending: false })
      setRows((newList ?? []) as LotRow[])
      setFormOpen(false)
      setF({
        short_desc: '',
        origin_country: '',
        organic: false,
        species: 'arabica',
        status: 'contracted',
        price_scheme: 'fixed_eur',
        price_fixed_eur_per_kg: '',
        price_fixed_usd_per_lb: '',
        diff_root: 'KC',
        diff_month_code: '',
        diff_year: new Date().getFullYear(),
        diff_value: '',
        initial_qty_kg: '',
        initial_warehouse_id: ''
      })
    } catch (e:any) {
      setErr(e.message ?? String(e))
    }
  }

  // UI Helpers
  const monthOptions = f.diff_root === 'RM' ? MONTHS_RC : MONTHS_KC

  if (loading) return <div>Lade Lots…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Rohkaffee‑Lots</h2>
        <button
          className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm"
          onClick={() => setFormOpen(v => !v)}
        >
          {formOpen ? 'Abbrechen' : 'Neues Lot'}
        </button>
      </div>

      {formOpen && (
        <form onSubmit={onCreate} className="border rounded p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Kurzbeschreibung
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="z. B. Peru coop xyz, 84+"
                value={f.short_desc}
                onChange={e => setF({ ...f, short_desc: e.target.value })}
              />
            </label>

            <label className="text-sm">
              Herkunftsland
              <input
                list="coffee-countries"
                className="border rounded px-3 py-2 w-full"
                placeholder="Land auswählen oder tippen"
                value={f.origin_country}
                onChange={e => setF({ ...f, origin_country: e.target.value })}
              />
              <datalist id="coffee-countries">
                {COFFEE_COUNTRIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </label>

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.organic}
                onChange={e => setF({ ...f, organic: e.target.checked })}
              />
              Bio
            </label>

            <label className="text-sm">
              Sorte
              <select
                className="border rounded px-3 py-2 w-full"
                value={f.species}
                onChange={e => setF({ ...f, species: e.target.value as any })}
              >
                {COFFEE_SPECIES.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              Status
              <select
                className="border rounded px-3 py-2 w-full"
                value={f.status ?? 'contracted'}
                onChange={e => setF({ ...f, status: e.target.value as any })}
              >
                {LOT_STATUS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              Preis‑Schema
              <select
                className="border rounded px-3 py-2 w-full"
                value={f.price_scheme}
                onChange={e => {
                  const ps = e.target.value as LotRow['price_scheme']
                  setF({
                    ...f,
                    price_scheme: ps,
                    // Felder bei Schemawechsel aufräumen
                    price_fixed_eur_per_kg: ps === 'fixed_eur' ? f.price_fixed_eur_per_kg : '',
                    price_fixed_usd_per_lb: ps === 'fixed_usd' ? f.price_fixed_usd_per_lb : '',
                    diff_root: ps === 'differential' ? f.diff_root : 'KC',
                    diff_month_code: ps === 'differential' ? f.diff_month_code : '',
                    diff_year: ps === 'differential' ? f.diff_year : new Date().getFullYear(),
                    diff_value: ps === 'differential' ? f.diff_value : '',
                  })
                  setCalc(null)
                }}
              >
                <option value="fixed_eur">Fixiert in EUR/kg</option>
                <option value="fixed_usd">Fixiert in USD/lb</option>
                <option value="differential">Differential</option>
              </select>
            </label>

            {/* Preisfelder je Schema */}
            {f.price_scheme === 'fixed_eur' && (
              <label className="text-sm">
                Fixpreis (EUR/kg)
                <input
                  type="number" step="0.0001"
                  className="border rounded px-3 py-2 w-full"
                  value={f.price_fixed_eur_per_kg}
                  onChange={e => setF({ ...f, price_fixed_eur_per_kg: e.target.value })}
                />
              </label>
            )}

            {f.price_scheme === 'fixed_usd' && (
              <>
                <label className="text-sm">
                  Fixpreis (USD/lb)
                  <input
                    type="number" step="0.0001"
                    className="border rounded px-3 py-2 w-full"
                    value={f.price_fixed_usd_per_lb}
                    onChange={e => setF({ ...f, price_fixed_usd_per_lb: e.target.value })}
                  />
                </label>
                <div className="text-sm flex items-end gap-2">
                  <button
                    type="button"
                    className="rounded bg-slate-200 px-3 py-2"
                    onClick={async () => {
                      // USD/lb -> EUR/kg:  usd_per_lb * 2.2046226218 * (USD->EUR)
                      const { eur_per_kg, unit, symbol, fx } = await fetchEurPerKg({ root: 'KC' }) // FX holen
                      const usdPerLb = f.price_fixed_usd_per_lb ? Number(f.price_fixed_usd_per_lb) : 0
                      const eurKg = usdPerLb * 2.2046226218 * fx.usd_to_eur
                      setCalc({
                        symbol, unit,
                        baseEurKg: eurKg, eurKgWithDiff: eurKg
                      })
                    }}
                  >
                    In EUR/kg umrechnen
                  </button>
                </div>
              </>
            )}

            {f.price_scheme === 'differential' && (
              <div className="col-span-2 grid grid-cols-4 gap-3 text-sm">
                <label>
                  Kontrakt
                  <select
                    className="border rounded px-3 py-2 w-full"
                    value={f.diff_root}
                    onChange={e => { setF({ ...f, diff_root: e.target.value as any, diff_month_code: '' }); setCalc(null) }}
                  >
                    <option value="KC">KC (Arabica)</option>
                    <option value="RM">RM (Robusta)</option>
                  </select>
                </label>
                <label>
                  Monat
                  <select
                    className="border rounded px-3 py-2 w-full"
                    value={f.diff_month_code}
                    onChange={e => setF({ ...f, diff_month_code: e.target.value })}
                  >
                    <option value="">—</option>
                    {monthOptions.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
                  </select>
                </label>
                <label>
                  Jahr
                  <input
                    type="number" min={new Date().getFullYear()-1} max={2035}
                    className="border rounded px-3 py-2 w-full"
                    value={f.diff_year}
                    onChange={e => setF({ ...f, diff_year: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Differential
                  <div className="flex">
                    <span className="inline-flex items-center px-2 border border-r-0 rounded-l bg-slate-50 text-sm">
                      {f.diff_root === 'RM' ? 'USD/t' : 'c/lb'}
                    </span>
                    <input
                      type="number" step="0.01"
                      className="border rounded-r px-3 py-2 w-full"
                      value={f.diff_value}
                      onChange={e => setF({ ...f, diff_value: e.target.value })}
                    />
                  </div>
                </label>

                <div className="col-span-4">
                  <button
                    type="button"
                    className="rounded bg-slate-200 px-3 py-2"
                    onClick={async () => {
                      if (!f.diff_month_code || !f.diff_year) return
                      const root = f.diff_root
                      const q = await fetchEurPerKg({ root, month: f.diff_month_code, year: f.diff_year })
                      const eurkg = applyDifferential({
                        root,
                        futures_close: q.close, // KC: c/lb ; RM: USD/t
                        usd_to_eur: q.fx.usd_to_eur,
                        diff_native: f.diff_value ? Number(f.diff_value) : 0
                      })
                      setCalc({
                        symbol: q.symbol, unit: q.unit,
                        baseEurKg: q.eur_per_kg,
                        eurKgWithDiff: eurkg
                      })
                    }}
                  >
                    Preis berechnen
                  </button>
                  {calc && (
                    <div className="mt-2 text-sm">
                      <div>Futures: <b>{calc.symbol}</b> ({calc.unit}) → Basis ≈ <b>{calc.baseEurKg.toFixed(3)} EUR/kg</b></div>
                      <div>Mit Differential: <b className="text-green-700">{calc.eurKgWithDiff.toFixed(3)} EUR/kg</b></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Anfangsbestand (optional) */}
            <label className="text-sm">
              Anfangsbestand (kg, optional)
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="z. B. 360.0"
                value={f.initial_qty_kg}
                onChange={e => setF({ ...f, initial_qty_kg: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Lager (für Anfangsbestand)
              <select
                className="border rounded px-3 py-2 w-full"
                value={f.initial_warehouse_id}
                onChange={e => setF({ ...f, initial_warehouse_id: e.target.value })}
              >
                <option value="">— Lager wählen —</option>
                {whOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <div className="text-right">
            <button className="rounded bg-green-700 text-white px-3 py-1.5 text-sm">
              Speichern
            </button>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}
        </form>
      )}

      <table className="w-full border border-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2">Details</th>
            <th className="text-left p-2">Kurzbeschreibung</th>
            <th className="text-left p-2">Herkunft</th>
            <th className="text-left p-2">Sorte</th>
            <th className="text-left p-2">Bio</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Preis‑Schema</th>
            <th className="text-left p-2">Preis‑Felder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2">
                <Link className="text-sky-700 underline" to={`/lots/${r.id}`}>öffnen</Link>
              </td>
              <td className="p-2">{r.short_desc ?? '–'}</td>
              <td className="p-2">{r.origin_country ?? '–'}</td>
              <td className="p-2">{labelSpecies(r.species)}</td>
              <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
              <td className="p-2">{labelStatus(r.status)}</td>
              <td className="p-2">{labelScheme(r.price_scheme)}</td>
              <td className="p-2">
                {r.price_scheme === 'fixed_eur' && (r.price_fixed_eur_per_kg != null
                  ? `${r.price_fixed_eur_per_kg.toLocaleString('de-DE', { maximumFractionDigits: 3 })} EUR/kg`
                  : '—')}
                {r.price_scheme === 'fixed_usd' && (r.price_fixed_usd_per_lb != null
                  ? `${r.price_fixed_usd_per_lb.toLocaleString('de-DE', { maximumFractionDigits: 4 })} USD/lb`
                  : '—')}
                {r.price_scheme === 'differential' && (
                  <>
                    <span>{r.diff_root ?? '—'} {r.diff_month_code ?? '–'} {r.diff_year ?? '–'}</span>
                    {' · '}
                    <span>{r.diff_value != null ? (r.diff_root === 'RM'
                      ? `${r.diff_value} USD/t`
                      : `${r.diff_value} c/lb`) : '—'}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Label-Helper unten, damit das JSX schlank bleibt
function labelScheme(s: LotRow['price_scheme']) {
  switch (s) {
    case 'fixed_eur': return 'Fixiert in EUR/kg'
    case 'fixed_usd': return 'Fixiert in USD/lb'
    case 'differential': return 'Differential'
    default: return String(s)
  }
}
function labelStatus(s: LotRow['status']) {
  switch (s) {
    case 'contracted': return 'Kontrahiert'
    case 'price_fixed': return 'Preis fixiert'
    case 'at_port': return 'Im Hafen'
    case 'at_production_wh': return 'Im Produktionslager'
    case 'produced': return 'Produziert'
    case 'closed': return 'Abgeschlossen'
    default: return s ?? '–'
  }
}
function labelSpecies(sp: LotRow['species']) {
  switch (sp) {
    case 'arabica': return 'Arabica'
    case 'robusta': return 'Robusta'
    case 'other': return 'Andere'
    default: return sp ?? '–'
  }
}
