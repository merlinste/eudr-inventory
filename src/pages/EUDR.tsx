import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type LotRow = {
  green_lot_id: string
  lot_label: string
  origin_country: string | null
  dds_reference: string | null
  production_start: string | null
  production_end: string | null
}
type BatchRow = {
  finished_batch_id: string
  product_name: string
  batch_code: string | null
  mhd_text: string | null
  dds_refs: string | null
}

export default function Eudr() {
  const [lots, setLots] = useState<LotRow[]>([])
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setErr(null)
      const [l, b] = await Promise.all([
        supabase.from('v_dds_refs_by_green_lot').select('*').order('lot_label'),
        supabase.from('v_dds_refs_by_finished_batch').select('*').order('product_name')
      ])
      if (!alive) return
      if (l.error) setErr(l.error.message)
      if (b.error) setErr(b.error.message || null)
      setLots((l.data ?? []) as LotRow[])
      setBatches((b.data ?? []) as BatchRow[])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [])

  function exportCsv(name: string, rows: (string | number)[][]) {
    const csv = rows.map(r => r.map(v => {
      const s = v == null ? '' : String(v)
      return `"${s.replace(/"/g,'""')}"`
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return <div>Lade…</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">EUDR</h2>

      <section className="border rounded p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">DDS‑Referenzen je Rohkaffee‑Lot</h3>
          <button
            className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm"
            onClick={()=>{
              exportCsv('dds_refs_by_green_lot.csv', [
                ['Lot','Herkunft','DDS‑Ref','Produktion Start','Produktion Ende'],
                ...lots.map(l => [l.lot_label, l.origin_country ?? '', l.dds_reference ?? '', l.production_start ?? '', l.production_end ?? ''])
              ])
            }}
          >
            CSV exportieren
          </button>
        </div>
        <table className="w-full text-sm mt-3">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">DDS‑Ref</th>
              <th className="text-left p-2">Produktion</th>
            </tr>
          </thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.green_lot_id} className="border-t">
                <td className="p-2">{l.lot_label}</td>
                <td className="p-2">{l.origin_country ?? '–'}</td>
                <td className="p-2">{l.dds_reference ?? '–'}</td>
                <td className="p-2">
                  {(l.production_start || l.production_end)
                    ? `${l.production_start ?? '…'} – ${l.production_end ?? '…'}`
                    : '–'}
                </td>
              </tr>
            ))}
            {lots.length === 0 && <tr><td className="p-2" colSpan={4}>Keine Daten.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="border rounded p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Aggregierte Referenzen je Fertig‑Charge</h3>
          <button
            className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm"
            onClick={()=>{
              exportCsv('dds_refs_by_finished_batch.csv', [
                ['Produkt','MHD','Charge','DDS‑Refs'],
                ...batches.map(b => [b.product_name, b.mhd_text ?? '', b.batch_code ?? '', b.dds_refs ?? ''])
              ])
            }}
          >
            CSV exportieren
          </button>
        </div>
        <table className="w-full text-sm mt-3">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Produkt</th>
              <th className="text-left p-2">MHD</th>
              <th className="text-left p-2">Charge</th>
              <th className="text-left p-2">DDS‑Refs</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.finished_batch_id} className="border-t">
                <td className="p-2">{b.product_name}</td>
                <td className="p-2">{b.mhd_text ?? '–'}</td>
                <td className="p-2">{b.batch_code ?? '–'}</td>
                <td className="p-2">{b.dds_refs ?? '–'}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td className="p-2" colSpan={4}>Keine Daten.</td></tr>}
          </tbody>
        </table>
      </section>

      {err && <div className="text-red-600 text-sm">{err}</div>}
    </div>
  )
}
