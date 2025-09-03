import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Lot = {
  id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  status: string | null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  price_diff_cents_per_lb: number | null
  price_base_contract: 'KC'|'RC'|null
}

type Row = {
  lot_id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  status: string | null
  received_kg: number
  produced_kg: number
  balances: { name: string; kg: number }[]
  // Preisfelder aus green_lots:
  price_scheme: Lot['price_scheme']
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  price_diff_cents_per_lb: number | null
  price_base_contract: Lot['price_base_contract']
}

type Prices = {
  usd_eur: number | null         // EUR je 1 USD
  kc_usd_per_lb: number | null   // KC Front (USD/lb)
  rc_usd_per_ton: number | null  // RC Front (USD/t)
}

const LBS_PER_KG = 2.2046226218488
const LBS_PER_TON = 2204.6226218488

export default function Stock () {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null })
  const [fetching, setFetching] = useState(false)

  useEffect(() => { void loadRows() }, [])
  async function loadRows () {
    // v_green_stock_detailed liefert je Lot die Summen + Lagerverteilung
    const r = await supabase.from('v_green_stock_detailed')
      .select('lot_id, short_desc, origin_country, organic, status, received_kg, produced_kg, balances, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_base_contract')
      .order('short_desc', { ascending: true })
    if (!r.error) setRows((r.data ?? []) as Row[])
  }

  async function refreshPrices () {
    setFetching(true)
    try {
      // 1) Versuch: Netlify Function (falls vorhanden)
      try {
        const res = await fetch('/.netlify/functions/prices', { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          setPrices({
            usd_eur: j.usd_eur ?? null,
            kc_usd_per_lb: j.kc_usd_per_lb ?? null,
            rc_usd_per_ton: j.rc_usd_per_ton ?? null
          })
          return
        }
      } catch (_) { /* ignore */ }

      // 2) Fallback: Supabase RPC (falls vorhanden)
      try {
        const r = await supabase.rpc('get_market_prices')
        if (!r.error && r.data) {
          setPrices({
            usd_eur: r.data.usd_eur ?? null,
            kc_usd_per_lb: r.data.kc_usd_per_lb ?? null,
            rc_usd_per_ton: r.data.rc_usd_per_ton ?? null
          })
          return
        }
      } catch (_) { /* ignore */ }

      // 3) Fallback: leer lassen
      setPrices(p => ({ ...p }))
    } finally {
      setFetching(false)
    }
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.short_desc ?? '').toLowerCase().includes(t) ||
      (r.origin_country ?? '').toLowerCase().includes(t)
    )
  }, [rows, q])

  function eurPerKg (r: Row): { value: number | null, label: string } {
    // fixed EUR/kg
    if (r.price_scheme === 'fixed_eur' && r.price_fixed_eur_per_kg != null) {
      return { value: r.price_fixed_eur_per_kg, label: 'Fix (EUR/kg)' }
    }
    // fixed USD/lb
    if (r.price_scheme === 'fixed_usd' && r.price_fixed_usd_per_lb != null && prices.usd_eur != null) {
      const eurPerKg = r.price_fixed_usd_per_lb * LBS_PER_KG * prices.usd_eur
      return { value: eurPerKg, label: 'Fix (USD/lb)' }
    }
    // Differential: Basis + Diff (Front)
    if (r.price_scheme === 'differential' && r.price_base_contract && r.price_diff_cents_per_lb != null && prices.usd_eur != null) {
      if (r.price_base_contract === 'KC' && prices.kc_usd_per_lb != null) {
        const usdPerLb = prices.kc_usd_per_lb + (r.price_diff_cents_per_lb / 100.0)
        const eurPerKg = usdPerLb * LBS_PER_KG * prices.usd_eur
        return { value: eurPerKg, label: 'KC (Front) + Diff' }
      }
      if (r.price_base_contract === 'RC' && prices.rc_usd_per_ton != null) {
        const usdPerLbBase = prices.rc_usd_per_ton / LBS_PER_TON
        const usdPerLb = usdPerLbBase + (r.price_diff_cents_per_lb / 100.0)
        const eurPerKg = usdPerLb * LBS_PER_KG * prices.usd_eur
        return { value: eurPerKg, label: 'RC (Front) + Diff' }
      }
    }
    return { value: null, label: '—' }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Bestand · Rohkaffee-Lots</h2>

      <div className="flex items-center justify-between gap-3">
        <input className="border rounded px-3 py-2 w-full max-w-md text-sm"
               placeholder="Suchen (Beschreibung, Herkunft)…"
               value={q} onChange={e => setQ(e.target.value)} />
        <button className="rounded bg-slate-800 text-white text-sm px-3 py-2"
                onClick={refreshPrices} disabled={fetching}>
          {fetching ? 'Lade Preise…' : 'Preise aktualisieren'}
        </button>
      </div>

      <div className="text-xs text-slate-500">
        FX USD→EUR: {fmtNum(prices.usd_eur)} · KC (USD/lb): {fmtNum(prices.kc_usd_per_lb)} · RC (USD/t): {fmtNum(prices.rc_usd_per_ton)}
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Lager</th>
              <th className="text-right p-2">Erhalten (kg)</th>
              <th className="text-right p-2">Produziert (kg)</th>
              <th className="text-right p-2">Verbleibend (kg)</th>
              <th className="text-right p-2">Preis (EUR/kg)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const eur = eurPerKg(r)
              const remain = r.received_kg - r.produced_kg
              return (
                <tr key={r.lot_id} className="border-t">
                  <td className="p-2">{r.short_desc ?? '—'}</td>
                  <td className="p-2">{r.origin_country ?? '—'}</td>
                  <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                  <td className="p-2">{r.status ?? '—'}</td>
                  <td className="p-2">
                    <ul className="list-disc list-inside">
                      {r.balances.map(b => (
                        <li key={b.name}>{b.name}: {fmtKg(b.kg)} kg</li>
                      ))}
                    </ul>
                  </td>
                  <td className="p-2 text-right">{fmtKg(r.received_kg)}</td>
                  <td className="p-2 text-right">{fmtKg(r.produced_kg)}</td>
                  <td className="p-2 text-right">{fmtKg(remain)}</td>
                  <td className="p-2 text-right">
                    {eur.value != null ? `${fmtMoney(eur.value)}`
                      : '—'}
                    {eur.label !== '—' && <span className="text-slate-500"> ({eur.label})</span>}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td className="p-2" colSpan={9}>Keine Lots gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtKg (n: number | null | undefined) {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(v)
}
function fmtMoney (n: number | null | undefined) {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
function fmtNum (n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(Number(n))
}
