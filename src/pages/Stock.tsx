import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Lot = {
  id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica'|'robusta'|'other'
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  diff_root: string | null
  diff_month_code: string | null
  diff_year: number | null
  diff_value: number | null           // in USD/lb für KC (MVP); RC -> N/A
}

type SumRow = {
  green_lot_id: string
  balance_kg: number
  received_kg: number
  produced_kg: number
}

type Prices = { usd_eur: number | null; kc_usd_per_lb: number | null }

export default function Stock() {
  const [lots, setLots] = useState<Lot[]>([])
  const [sums, setSums] = useState<Record<string, SumRow>>({})
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null })
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setErr(null)
      const l = await supabase.from('green_lots').select(`
        id, short_desc, origin_country, organic, species, status,
        price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
        diff_root, diff_month_code, diff_year, diff_value
      `).neq('status','closed').order('created_at', { ascending: false })
      const s = await supabase.from('v_green_lot_stock_summary').select('*')
      if (!alive) return
      if (l.error) setErr(l.error.message)
      if (s.error) setErr(s.error.message || null)

      setLots((l.data ?? []) as Lot[])
      const m: Record<string, SumRow> = {}
      for (const row of (s.data ?? []) as SumRow[]) m[row.green_lot_id] = row
      setSums(m)
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  async function refreshPrices() {
    try {
      const res = await fetch('/.netlify/functions/prices')
      const j = await res.json()
      setPrices(j)
    } catch (e) {
      console.error(e)
    }
  }
  useEffect(()=>{ refreshPrices() }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return lots
    return lots.filter(l =>
      (l.short_desc ?? '').toLowerCase().includes(t) ||
      (l.origin_country ?? '').toLowerCase().includes(t)
    )
  }, [lots, q])

  function priceEurPerKg(l: Lot): { value: number | null, note?: string } {
    if (l.price_scheme === 'fixed_eur') return { value: l.price_fixed_eur_per_kg ?? null }
    if (l.price_scheme === 'fixed_usd') {
      if (l.price_fixed_usd_per_lb == null || prices.usd_eur == null) return { value: null }
      const usdPerKg = l.price_fixed_usd_per_lb / 0.45359237
      return { value: usdPerKg * prices.usd_eur }
    }
    if (l.price_scheme === 'differential') {
      if (!l.diff_root || l.diff_value == null || prices.usd_eur == null) return { value: null }
      if (l.diff_root === 'KC') {
        if (prices.kc_usd_per_lb == null) return { value: null }
        const usdLb = prices.kc_usd_per_lb + l.diff_value
        const eurKg = (usdLb / 0.45359237) * prices.usd_eur
        return { value: eurKg, note: 'KC (Front) + Diff' }
      }
      // RC/Diverses: MVP kein Feed
      return { value: null, note: 'RC‑Preis N/A (MVP)' }
    }
    return { value: null }
  }

  if (loading) return <div>Lade…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Bestand · Rohkaffee‑Lots</h2>
        <div className="flex items-center gap-2">
          <button onClick={refreshPrices} className="rounded bg-slate-200 px-3 py-1.5 text-sm">Preise aktualisieren</button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input className="border rounded px-3 py-2 w-full max-w-md text-sm"
               placeholder="Suchen (Beschreibung, Herkunft)…"
               value={q} onChange={e=>setQ(e.target.value)} />
        <div className="text-xs text-slate-500">
          FX USD→EUR: {fmt(prices.usd_eur)} · KC (USD/lb): {fmt(prices.kc_usd_per_lb)}
        </div>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2">Erhalten (kg)</th>
              <th className="text-right p-2">Produziert (kg)</th>
              <th className="text-right p-2">Verbleibend (kg)</th>
              <th className="text-right p-2">Preis (EUR/kg)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => {
              const s = sums[l.id]
              const recv = s?.received_kg ?? 0
              const prod = s?.produced_kg ?? 0
              const bal  = s?.balance_kg ?? 0
              const price = priceEurPerKg(l)
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.short_desc ?? l.id.slice(0,8)}</td>
                  <td className="p-2">{l.origin_country ?? '—'}</td>
                  <td className="p-2">{l.organic ? 'Ja' : 'Nein'}</td>
                  <td className="p-2">{labelStatus(l.status)}</td>
                  <td className="p-2 text-right">{fmtKg(recv)}</td>
                  <td className="p-2 text-right">{fmtKg(prod)}</td>
                  <td className="p-2 text-right">{fmtKg(bal)}</td>
                  <td className="p-2 text-right">
                    {price.value != null ? fmt2(price.value) : '—'}
                    {price.note ? <span className="ml-1 text-xs text-slate-500">({price.note})</span> : null}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td className="p-2" colSpan={8}>Keine Lots.</td></tr>}
          </tbody>
        </table>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}
      <p className="text-xs text-slate-500">
        Hinweis: „Produziert (kg)“ basiert auf negativen Bestandsbewegungen von GREEN‑Lots.
      </p>
    </div>
  )
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(n)
}
function fmt2(n: number) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmtKg(n: number) { return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n) }
function labelStatus(s: Lot['status']) {
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
