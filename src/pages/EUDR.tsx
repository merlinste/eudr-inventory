import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type EudrLot = {
  id: string
  short_desc: string | null
  origin_country: string | null
  dds_reference: string | null
  production_start: string | null
  production_end: string | null
}

type EudrBatch = {
  id: string
  product_name: string
  batch_code: string | null
  mhd_text: string | null
  eudr_refs: string[] | null
}

export default function EUDR() {
  const [lots, setLots] = useState<EudrLot[]>([])
  const [batches, setBatches] = useState<EudrBatch[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setErr(null)

      const lotsSql = supabase
        .from('eudr_packages')
        .select(`
          id:green_lot_id,
          dds_reference,
          production_start,
          production_end,
          green_lots!inner(short_desc, origin_country)
        `)

      const batchSql = supabase
        .from('finished_batches')
        .select(`
          id,
          batch_code,
          mhd_text,
          eudr_refs,
          products!inner(name)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      const [lRes, bRes] = await Promise.all([lotsSql, batchSql])

      if (!mounted) return
      if (lRes.error) setErr(lRes.error.message)
      if (bRes.error) setErr(bRes.error.message || null)

      const lotRows: EudrLot[] = (lRes.data ?? []).map((r: any) => ({
        id: r.id,
        dds_reference: r.dds_reference,
        production_start: r.production_start,
        production_end: r.production_end,
        short_desc: r.green_lots?.short_desc ?? null,
        origin_country: r.green_lots?.origin_country ?? null
      }))
      const batchRows: EudrBatch[] = (bRes.data ?? []).map((r: any) => ({
        id: r.id,
        product_name: r.products?.name ?? '',
        batch_code: r.batch_code,
        mhd_text: r.mhd_text,
        eudr_refs: r.eudr_refs
      }))
      setLots(lotRows)
      setBatches(batchRows)
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  function exportLotsCsv() {
    const header = ['lot_id','short_desc','origin_country','dds_reference','production_start','production_end']
    const rows = lots.map(l => [
      l.id, wrap(l.short_desc), wrap(l.origin_country), wrap(l.dds_reference), l.production_start ?? '', l.production_end ?? ''
    ])
    downloadCsv('eudr_lots.csv', [header, ...rows])
  }

  function exportBatchesCsv() {
    const header = ['batch_id','product','batch_code','mhd','eudr_refs']
    const rows = batches.map(b => [
      b.id, wrap(b.product_name), wrap(b.batch_code), wrap(b.mhd_text),
      wrap((b.eudr_refs ?? []).join('|'))
    ])
    downloadCsv('eudr_batches.csv', [header, ...rows])
  }

  function wrap(v: string | null | undefined) { return v == null ? '' : `"${String(v).replace(/"/g,'""')}"` }
  function downloadCsv(filename: string, data: (string|number)[][]) {
    const csv = data.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div>Lade EUDR…</div>
  if (err) return <div className="text-red-600">Fehler: {err}</div>

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">DDS‑Referenzen je Rohkaffee‑Lot</h2>
          <button onClick={exportLotsCsv} className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm">CSV exportieren</button>
        </div>
        <table className="w-full border mt-3 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">Lot</th>
              <th className="p-2 text-left">Herkunft</th>
              <th className="p-2 text-left">DDS‑Ref</th>
              <th className="p-2 text-left">Produktion</th>
            </tr>
          </thead>
          <tbody>
            {lots.map(l => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.short_desc ?? '–'}</td>
                <td className="p-2">{l.origin_country ?? '–'}</td>
                <td className="p-2">{l.dds_reference ?? '–'}</td>
                <td className="p-2">{[l.production_start,l.production_end].filter(Boolean).join(' → ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Aggregierte Referenzen je Fertig‑Charge</h2>
          <button onClick={exportBatchesCsv} className="rounded bg-slate-800 text-white px-3 py-1.5 text-sm">CSV exportieren</button>
        </div>
        <table className="w-full border mt-3 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">Produkt</th>
              <th className="p-2 text-left">MHD</th>
              <th className="p-2 text-left">Charge</th>
              <th className="p-2 text-left">DDS‑Refs</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id} className="border-t">
                <td className="p-2">{b.product_name}</td>
                <td className="p-2">{b.mhd_text ?? '–'}</td>
                <td className="p-2">{b.batch_code ?? '–'}</td>
                <td className="p-2">{(b.eudr_refs ?? []).join(', ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
