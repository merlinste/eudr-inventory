import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Prices, fetchPrices, calcEurPerKgForLot, fmtEurPerKg } from '@/lib/pricing'

type Row = {
  id: string
  lot_no: string | null
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica' | 'robusta' | 'other' | null
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  price_diff_cents_per_lb: number | null
  price_base_contract: string | null
  received_kg: number
  produced_kg: number
  balance_kg: number
}

export default function Stock() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null })

  useEffect(() => { void load(); }, [])
  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_green_stock')
      .select('*')
      .order('short_desc', { ascending: true })
    if (!error && data) setRows(data as unknown as Row[])
    setLoading(false)
  }

  async function refreshMarket() {
    // Wenn viele Lots „differential“ haben, nimm den häufigsten Basis-Kontrakt als Hint
    const hint = rows.find(r => r.price_scheme === 'differential')?.price_base_contract ?? null
    const p = await fetchPrices(hint)
    setPrices(p)
    alert(`Marktdaten aktualisiert.\nUSD→EUR: ${p.usd_eur ?? '—'}\nKC (USD/lb): ${p.kc_usd_per_lb ?? '—'}`)
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(r =>
      [r.lot_no, r.short_desc, r.origin_country].join(' ').toLowerCase().includes(s)
    )
  }, [q, rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bestand · Rohkaffee‑Lots</h2>
        <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={refreshMarket}>
          Marktdaten aktualisieren
        </button>
      </div>

      <div className="text-xs text-slate-500">
        USD→EUR: {prices.usd_eur ?? '—'} · KC (USD/lb): {prices.kc_usd_per_lb ?? '—'}
      </div>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Suchen (Bezeichnung, Herkunft)…"
        value={q}
        onChange={e=>setQ(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="p-2 text-left">Lot</th>
              <th className="p-2 text-left">Herkunft</th>
              <th className="p-2 text-left">Bio</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Lager</th>
              <th className="p-2 text-right">Erhalten (kg)</th>
              <th className="p-2 text-right">Produziert (kg)</th>
              <th className="p-2 text-right">Verbleibend (kg)</th>
              <th className="p-2 text-right">Preis (EUR/kg)</th>
              <th className="p-2 text-left">Modus</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={11}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-3" colSpan={11}>Keine Lots gefunden.</td></tr>
            ) : filtered.map(r => {
              const eurPerKg = calcEurPerKgForLot(r, prices)
              return (
                <tr key={r.id} className="border-b align-top">
                  <td className="p-2">
                    <div className="font-medium">
                      <Link className="text-blue-700 hover:underline" to={`/lots/${r.id}`}>
                        {r.short_desc ?? '—'}
                      </Link>
                    </div>
                    <div className="text-xs text-slate-500">{r.lot_no ?? '—'}</div>
                  </td>
                  <td className="p-2">{r.origin_country ?? '—'}</td>
                  <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                  <td className="p-2">{labelStatus(r.status)}</td>
                  <td className="p-2">
                    {/* optional: je-Lager-Auflistung kannst du später aus v_green_stock_detailed ziehen */}
                    —
                  </td>
                  <td className="p-2 text-right">{fmt(r.received_kg)}</td>
                  <td className="p-2 text-right">{fmt(r.produced_kg)}</td>
                  <td className="p-2 text-right">{fmt(r.balance_kg)}</td>
                  <td className="p-2 text-right">{fmtEurPerKg(eurPerKg)}</td>
                  <td className="p-2">{r.price_scheme === 'differential' ? <BadgeLive/> : <BadgeFixed/>}</td>
                  <td className="p-2"><Link className="text-blue-700 hover:underline" to={`/lots/${r.id}`}>Details</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(n: number){ return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n) }
function labelStatus(s: Row['status']) {
  switch(s){
    case 'contracted': return 'Kontrahiert'
    case 'price_fixed': return 'Preis fixiert'
    case 'at_port': return 'Im Hafen'
    case 'at_production_wh': return 'Im Produktionslager'
    case 'produced': return 'Produziert'
    case 'closed': return 'Abgeschlossen'
    default: return '—'
  }
}
function BadgeLive(){ return <span className="inline-flex items-center gap-1 text-xs text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block"/>live</span> }
function BadgeFixed(){ return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"/>fix</span> }
