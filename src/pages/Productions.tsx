// src/pages/Productions.tsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Run = { id: string; created_at: string | null; happened_at: string | null }
type Warehouse = { id: string; name: string; w_type: string }
type Lot = { id: string; short_desc: string | null }
type Product = { id: string; name: string }
type Variant = {
  id: string; product_id: string;
  packaging_type: 'bag' | 'capsule_pack' | 'other' | null;
  net_weight_g: number | null;
  capsules_per_pack: number | null;
  grams_per_capsule: number | null;
}
type InputRow = { lot_id: string; kg: string }

export default function Productions() {
  // Listing
  const [runs, setRuns] = useState<Run[]>([])
  const [finByRun, setFinByRun] = useState<Record<string, string>>({})
  const [inpByRun, setInpByRun] = useState<Record<string, number>>({})
  const [listErr, setListErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Form‑Optionen
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])

  // Formularzustand
  const today = new Date().toISOString().slice(0, 10)
  const [happenedAt, setHappenedAt] = useState<string>(today)
  const [whSource, setWhSource] = useState<string>('')      // Quelle (grün)
  const [productId, setProductId] = useState<string>('')
  const [variantId, setVariantId] = useState<string>('')    // optional
  const [batchCode, setBatchCode] = useState<string>('')    // optional
  const [mhdText, setMhdText] = useState<string>('')        // optional
  const [outKg, setOutKg] = useState<string>('')            // optional (Dokumentation)
  const [inputs, setInputs] = useState<InputRow[]>([{ lot_id: '', kg: '' }])

  const [q, setQ] = useState('')
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ---------- Daten laden ----------
  useEffect(() => {
    loadListing()
    loadFormData()
  }, [])

  async function loadListing() {
    setLoading(true); setListErr(null)
    const r = await supabase.from('production_runs').select('id,created_at,happened_at').order('created_at', { ascending: false })
    if (r.error) { setListErr(r.error.message); setLoading(false); return }
    const runRows = (r.data ?? []) as Run[]
    setRuns(runRows)

    const ids = runRows.map(x => x.id)
    if (ids.length === 0) { setFinByRun({}); setInpByRun({}); setLoading(false); return }

    const ri = await supabase.from('run_inputs').select('production_run_id').in('production_run_id', ids)
    const inpMap: Record<string, number> = {}
    if (!ri.error) for (const row of (ri.data ?? []) as { production_run_id: string }[]) {
      inpMap[row.production_run_id] = (inpMap[row.production_run_id] ?? 0) + 1
    }

    const fb = await supabase.from('finished_batches')
      .select('production_run_id, batch_code, mhd_text, products(name)')
      .in('production_run_id', ids)
    const finMap: Record<string, string> = {}
    if (!fb.error) {
      const byRun: Record<string, string[]> = {}
      for (const row of (fb.data ?? []) as any[]) {
        const pname = row.products?.name as (string | null)
        const meta = [pname, row.batch_code, row.mhd_text].filter(Boolean).join(' / ')
        if (!byRun[row.production_run_id]) byRun[row.production_run_id] = []
        if (meta) byRun[row.production_run_id].push(meta)
      }
      for (const [rid, v] of Object.entries(byRun)) finMap[rid] = v.join('; ')
    }

    setInpByRun(inpMap)
    setFinByRun(finMap)
    setLoading(false)
  }

  async function loadFormData() {
    const [wh, gl, p, v] = await Promise.all([
      supabase.from('v_my_warehouses').select('id,name,w_type').order('name'),
      supabase.from('green_lots').select('id,short_desc').order('created_at', { ascending: false }),
      supabase.from('products').select('id,name').order('name'),
      supabase.from('product_variants').select('id,product_id,packaging_type,net_weight_g,capsules_per_pack,grams_per_capsule')
    ])
    if (!wh.error) setWarehouses((wh.data ?? []) as Warehouse[])
    if (!gl.error) setLots((gl.data ?? []) as Lot[])
    if (!p.error) setProducts((p.data ?? []) as Product[])
    if (!v.error) setVariants((v.data ?? []) as Variant[])
  }

  const filteredRuns = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return runs
    return runs.filter(r =>
      (r.happened_at ?? r.created_at ?? '').toLowerCase().includes(t) ||
      (finByRun[r.id] ?? '').toLowerCase().includes(t)
    )
  }, [runs, q, finByRun])

  // ---------- Löschen ----------
  async function deleteRun(id: string) {
    if (!confirm('Produktion wirklich löschen?')) return
    const res = await supabase.rpc('safe_delete_production_run', { p_id: id })
    if (res.error) alert(res.error.message)
    else setRuns(prev => prev.filter(x => x.id !== id))
  }

  // ---------- Anlegen ----------
  async function createRun() {
    setCreateErr(null); setBusy(true)
    try {
      if (!inputs.some(i => i.lot_id && parseFloat(i.kg) > 0)) {
        throw new Error('Mindestens ein Input‑Lot mit Menge erforderlich.')
      }
      if (!whSource) throw new Error('Quell‑Lager (für grünen Verbrauch) wählen.')

      // org_id aus Profil laden (lokal in dieser Funktion!)
      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      const orgId = prof.data?.org_id
      if (!orgId) throw new Error('Kein org_id im Profil.')

      // 1) Run
      const runIns = await supabase.from('production_runs').insert([{
        org_id: orgId,
        producer_org_id: orgId,            // explizit setzen
        happened_at: happenedAt || null
      }]).select('id').single()
      if (runIns.error) throw runIns.error
      const runId = runIns.data!.id as string

      // 2) Finished Batch (optional)
      if (productId || batchCode || mhdText) {
        const fbIns = await supabase.from('finished_batches').insert([{
          production_run_id: runId,
          product_id: productId || null,
          batch_code: batchCode || null,
          mhd_text: mhdText || null
        }])
        if (fbIns.error) throw fbIns.error
      }

      // 3) run_inputs (Dokumentation)
      const inputRows = inputs
        .filter(i => i.lot_id && parseFloat(i.kg) > 0)
        .map(i => ({ production_run_id: runId, green_lot_id: i.lot_id }))
      if (inputRows.length) {
        const riIns = await supabase.from('run_inputs').insert(inputRows)
        if (riIns.error) throw riIns.error
      }

      // 4) negative GREEN‑Moves (RLS kann blockieren → Hinweis)
      const greenMoves = inputs
        .filter(i => i.lot_id && parseFloat(i.kg) > 0)
        .map(i => ({
          org_id: orgId,
          item: 'green',
          green_lot_id: i.lot_id,
          delta_kg: -Math.abs(parseFloat(i.kg)),
          warehouse_id: whSource,
          production_run_id: runId
        }))
      if (greenMoves.length) {
        const mvIns = await supabase.from('inventory_moves').insert(greenMoves)
        if (mvIns.error) alert('Run gespeichert, aber Bestandsbuchung (GREEN) blockiert: ' + mvIns.error.message)
      }

      // Reset & Reload
      setHappenedAt(today); setWhSource('')
      setProductId(''); setVariantId('')
      setBatchCode(''); setMhdText(''); setOutKg('')
      setInputs([{ lot_id: '', kg: '' }])
      await loadListing()
    } catch (e: any) {
      setCreateErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const productVariants = useMemo(
    () => variants.filter(v => v.product_id === productId),
    [variants, productId]
  )

  if (loading) return <div>Lade…</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Produktionen</h2>

      {/* Listing */}
      <div className="flex items-center justify-between gap-3">
        <input className="border rounded px-3 py-2 w-full max-w-md text-sm"
               placeholder="Filtern (Datum, Produkt/Charge)…"
               value={q} onChange={e=>setQ(e.target.value)} />
        <div className="text-sm text-slate-500">{filteredRuns.length} von {runs.length}</div>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Datum</th>
              <th className="text-left p-2">Produkte/Chargen</th>
              <th className="text-left p-2">Inputs (Lots)</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{(r.happened_at ?? r.created_at ?? '').slice(0,10)}</td>
                <td className="p-2">{finByRun[r.id] ?? '—'}</td>
                <td className="p-2">{inpByRun[r.id] ?? 0}</td>
                <td className="p-2">
                  <button className="rounded bg-red-100 text-red-700 text-xs px-2 py-1"
                          onClick={()=>deleteRun(r.id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {filteredRuns.length === 0 && <tr><td className="p-2" colSpan={4}>Keine Produktionen gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
      {listErr && <div className="text-red-600 text-sm">{listErr}</div>}

      {/* Neues Run-Formular */}
      <div className="border rounded p-4 space-y-4">
        <h3 className="font-medium">Neuen Produktionslauf anlegen</h3>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label>Datum
            <input type="date" className="border rounded px-3 py-2 w-full"
                   value={happenedAt} onChange={e=>setHappenedAt(e.target.value)} />
          </label>
          <label>Quell‑Lager (grün)
            <select className="border rounded px-3 py-2 w-full"
                    value={whSource} onChange={e=>setWhSource(e.target.value)}>
              <option value="">— wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="col-span-1">Produkt (optional)
            <select className="border rounded px-3 py-2 w-full"
                    value={productId} onChange={e=>{ setProductId(e.target.value); setVariantId('') }}>
              <option value="">—</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="col-span-1">Variante
            <select className="border rounded px-3 py-2 w-full"
                    value={variantId} onChange={e=>setVariantId(e.target.value)} disabled={!productId}>
              <option value="">—</option>
              {productVariants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.packaging_type === 'bag' && v.net_weight_g ? `Beutel ${v.net_weight_g}g`
                   : v.packaging_type === 'capsule_pack' ? `Kapseln ${v.capsules_per_pack}×${v.grams_per_capsule}g`
                   : 'Variante'}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-1">Ausbringung (kg, optional)
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                   value={outKg} onChange={e=>setOutKg(e.target.value)} />
          </label>

          <label className="col-span-1">Charge (optional)
            <input className="border rounded px-3 py-2 w-full" value={batchCode} onChange={e=>setBatchCode(e.target.value)} />
          </label>
          <label className="col-span-1">MHD (Text, optional)
            <input className="border rounded px-3 py-2 w-full" value={mhdText} onChange={e=>setMhdText(e.target.value)} />
          </label>
        </div>

        {/* Inputs */}
        <div className="space-y-2">
          <div className="font-medium text-sm">Verwendete Rohkaffee‑Lots</div>
          {inputs.map((row, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-3 text-sm">
              <label className="col-span-3">Lot
                <select className="border rounded px-3 py-2 w-full"
                        value={row.lot_id}
                        onChange={e=>updateInput(idx, { lot_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {lots.map(l => <option key={l.id} value={l.id}>{l.short_desc ?? l.id}</option>)}
                </select>
              </label>
              <label>Menge (kg)
                <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                       value={row.kg}
                       onChange={e=>updateInput(idx, { kg: e.target.value })}/>
              </label>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="rounded bg-slate-200 px-3 py-1 text-sm" onClick={()=>addRow()}>+ Lot</button>
            {inputs.length > 1 && (
              <button className="rounded bg-slate-200 px-3 py-1 text-sm" onClick={()=>removeLast()}>– letzte Zeile</button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          {createErr && <div className="text-red-600 text-sm">{createErr}</div>}
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={createRun} disabled={busy}>
            {busy ? 'Speichere…' : 'Produktion anlegen'}
          </button>
        </div>
      </div>
    </div>
  )

  function updateInput(i: number, patch: Partial<InputRow>) {
    setInputs(prev => {
      const copy = [...prev]
      copy[i] = { ...copy[i], ...patch }
      return copy
    })
  }
  function addRow() { setInputs(prev => [...prev, { lot_id: '', kg: '' }]) }
  function removeLast() { setInputs(prev => prev.slice(0, -1)) }
}
