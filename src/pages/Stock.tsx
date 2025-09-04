// src/pages/Stock.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchPrices, calcEurPerKgForLot, type Prices } from '@/lib/pricing'

type Row = {
  id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
  // Summen
  received_kg: number
  produced_kg: number
  balance_kg: number
  // Preisdaten
  species: 'arabica'|'robusta'|'other'|null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg?: number | null
  price_fixed_usd_per_lb?: number | null
  price_diff_cents_per_lb?: number | null
  price_diff_usd_per_ton?: number | null
}

export default function Stock() {
  const [rows, setRows] = useState<Row[]>([])
  const [p, setP] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null })

  useEffect(() => { void load() }, [])
  async function load() {
    const [data, prices] = await Promise.all([
      supabase.from('v_green_stock').select(`
        id, short_desc, origin_country, organic, status,
        received_kg, produced_kg, balance_kg,
        species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
        price_diff_cents_per_lb, price_diff_usd_per_ton
      `),
      fetchPrices()
    ])
    if (!data.error && data.data) setRows(data.data as Row[])
    setP(prices)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Bestand · Rohkaffee‑Lots</h2>

      <div className="text-xs text-slate-500">
        FX USD→EUR: {fmt(p.usd_eur)} · KC (USD/lb): {fmt(p.kc_usd_per_lb)} · RC (USD/t): —
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
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
            {rows.length === 0 ? (
              <tr><td className="p-3" colSpan={9}>Keine Lots gefunden.</td></tr>
            ) : rows.map(r => {
              const eurkg = calcEurPerKgForLot(r, p)
              const badge = r.price_scheme === 'fixed_eur' ? 'Fix' : (eurkg != null ? 'Live' : '')
              return (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.short_desc ?? '—'}</td>
                  <td className="p-2">{r.origin_country ?? '—'}</td>
                  <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                  <td className="p-2">{toStatus(r.status)}</td>
                  <td className="p-2">—{/* (Lagerliste pro Lot kann hier optional eingefügt werden) */}</td>
                  <td className="p-2 text-right">{fmtKg(r.received_kg)}</td>
                  <td className="p-2 text-right">{fmtKg(r.produced_kg)}</td>
                  <td className="p-2 text-right">{fmtKg(r.balance_kg)}</td>
                  <td className="p-2 text-right">
                    {eurkg != null ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(eurkg) : '—'}
                    {badge ? <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">{badge}</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function toStatus(s: Row['status']) {
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
function fmtKg(n: number) { return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n ?? 0) }
function fmt(n: number | null) { return n == null ? '—' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(n) }
