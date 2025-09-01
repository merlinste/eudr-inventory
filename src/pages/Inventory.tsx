import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type GreenRow = {
  warehouse_name: string
  green_lot_id: string
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  qty_kg: number | null
  status: string | null
}

type FinishedRow = {
  warehouse_name: string
  finished_batch_id: string
  product_name: string
  mhd_text: string | null
  batch_code: string | null
  units: number | null
  packaging_type: 'weight_pack' | 'capsule_pack' | null
  pack_size_g: number | null
  capsules_per_pack: number | null
  grams_per_capsule: number | null
}

export default function Inventory() {
  const [green, setGreen] = useState<GreenRow[]>([])
  const [finished, setFinished] = useState<FinishedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [onlyOrganic, setOnlyOrganic] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setErr(null)
      const [gRes, fRes] = await Promise.all([
        supabase.from('v_green_stock_detailed').select(`
          warehouse_name, green_lot_id, short_desc, origin_country, organic, qty_kg, status
        `),
        supabase.from('v_finished_stock_detailed').select(`
          warehouse_name, finished_batch_id, product_name, mhd_text, batch_code, units,
          packaging_type, pack_size_g, capsules_per_pack, grams_per_capsule
        `)
      ])
      if (!mounted) return
      if (gRes.error) setErr(gRes.error.message)
      if (fRes.error) setErr(fRes.error.message || null)
      setGreen(gRes.data ?? [])
      setFinished(fRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const greenFiltered = useMemo(
    () => (onlyOrganic ? green.filter(r => r.organic) : green),
    [green, onlyOrganic]
  )

  // Gruppierung: Fertigware erst nach Produkt, dann nach MHD/Charge
  const finishedGrouped = useMemo(() => {
    const byProduct = new Map<string, FinishedRow[]>()
    for (const row of finished) {
      if (!byProduct.has(row.product_name)) byProduct.set(row.product_name, [])
      byProduct.get(row.product_name)!.push(row)
    }
    // innerhalb des Produkts nach MHD/Charge gruppieren
    return Array.from(byProduct.entries()).map(([product, rows]) => {
      const byBatch = new Map<string, FinishedRow[]>()
      for (const r of rows) {
        const key = `${r.mhd_text ?? ''} | ${r.batch_code ?? ''}`
        if (!byBatch.has(key)) byBatch.set(key, [])
        byBatch.get(key)!.push(r)
      }
      return { product, groups: Array.from(byBatch.entries()).map(([key, rs]) => ({ key, rows: rs })) }
    })
  }, [finished])

  if (loading) return <div>Lade Bestände…</div>
  if (err) return <div className="text-red-600">Fehler: {err}</div>

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Rohkaffee-Bestand</h2>
          <label className="text-sm">
            <input type="checkbox" className="mr-2" checked={onlyOrganic} onChange={e => setOnlyOrganic(e.target.checked)} />
            nur Bio anzeigen
          </label>
        </div>
        <table className="w-full mt-3 border border-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Lager</th>
              <th className="text-left p-2">Kurzbeschreibung</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-right p-2">Menge (kg)</th>
              <th className="text-left p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {greenFiltered.map((r, i) => (
              <tr key={r.green_lot_id + i} className="border-t">
                <td className="p-2">{r.warehouse_name}</td>
                <td className="p-2">{r.short_desc ?? '–'}</td>
                <td className="p-2">{r.origin_country ?? '–'}</td>
                <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                <td className="p-2 text-right">{(r.qty_kg ?? 0).toLocaleString('de-DE')}</td>
                <td className="p-2">{r.status ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium">Fertigwaren-Bestand</h2>
        {finishedGrouped.length === 0 ? <div className="mt-3 text-sm">Keine Fertigware gebucht.</div> : null}
        <div className="space-y-6 mt-3">
          {finishedGrouped.map(group => (
            <div key={group.product} className="border rounded-md">
              <div className="px-3 py-2 bg-slate-50 font-medium">{group.product}</div>
              <div className="p-3">
                {group.groups.map(g => (
                  <div key={g.key} className="mb-4">
                    <div className="text-sm text-slate-600 mb-1">MHD | Charge: {g.key}</div>
                    <table className="w-full border border-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-2">Lager</th>
                          <th className="text-left p-2">Variante</th>
                          <th className="text-right p-2">Bestand (Stück)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, i) => (
                          <tr key={r.finished_batch_id + i} className="border-t">
                            <td className="p-2">{r.warehouse_name}</td>
                            <td className="p-2">
                              {r.packaging_type === 'weight_pack'
                                ? `${r.pack_size_g ?? '?'} g`
                                : r.packaging_type === 'capsule_pack'
                                  ? `${r.capsules_per_pack ?? '?'} Kapseln × ${r.grams_per_capsule ?? '?'} g`
                                  : '–'}
                            </td>
                            <td className="p-2 text-right">{(r.units ?? 0).toLocaleString('de-DE')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
