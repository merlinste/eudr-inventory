import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Option = { value: string; label: string }
type Product = { id: string; name: string }
type Variant = {
  id: string
  product_id: string
  packaging_type: 'weight_pack' | 'capsule_pack'
  pack_size_g: number | null
  capsules_per_pack: number | null
  grams_per_capsule: number | null
}
type Warehouse = { id: string; name: string; w_type: 'port'|'production'|'finished' }
type GreenCompact = { id: string; short_desc: string | null }

export default function Productions() {
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [lots, setLots] = useState<GreenCompact[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    product_id: '',
    variant_id: '',
    producer_org_id: '', // optional: könnt ihr später selektieren
    run_date: new Date().toISOString().slice(0,10),
    mhd_text: '',
    batch_code: '',
    output_kg: '',
    units: '',
    src_wh: '', // Standard: Produktionslager
    dst_wh: ''  // Standard: Fertiglager
  })

  // Inputs: dynamische Positionen (Lot + Menge)
  const [inputs, setInputs] = useState<{ lot_id: string; qty_kg: string }[]>([{ lot_id: '', qty_kg: '' }])

  useEffect(() => {
    let mounted = true
    async function load() {
      setErr(null)
      const [pRes, vRes, wRes, lRes] = await Promise.all([
        supabase.from('products').select('id, name').order('name'),
        supabase.from('product_variants').select('id, product_id, packaging_type, pack_size_g, capsules_per_pack, grams_per_capsule').eq('active', true),
        supabase.from('warehouses').select('id, name, w_type').order('name'),
        supabase.from('green_lots').select('id, short_desc').order('created_at', { ascending: false })
      ])
      if (!mounted) return
      if (pRes.error) setErr(pRes.error.message)
      if (vRes.error) setErr(vRes.error.message || null)
      if (wRes.error) setErr(wRes.error.message || null)
      if (lRes.error) setErr(lRes.error.message || null)
      setProducts(pRes.data ?? [])
      setVariants(vRes.data ?? [])
      setWarehouses(wRes.data ?? [])
      setLots(lRes.data ?? [])
      // Standard-Lager wählen
      const prod = wRes.data?.find(w => w.w_type === 'production')?.id ?? ''
      const fin  = wRes.data?.find(w => w.w_type === 'finished')?.id ?? ''
      setForm(f => ({ ...f, src_wh: prod, dst_wh: fin }))
    }
    load()
    return () => { mounted = false }
  }, [])

  const productOptions: Option[] = useMemo(() => products.map(p => ({ value: p.id, label: p.name })), [products])
  const variantOptions: Option[] = useMemo(
    () => variants.filter(v => v.product_id === form.product_id).map(v => ({
      value: v.id,
      label: v.packaging_type === 'weight_pack' ? `${v.pack_size_g ?? '?'} g` : `${v.capsules_per_pack ?? '?'} Kapseln × ${v.grams_per_capsule ?? '?'} g`
    })),
    [variants, form.product_id]
  )
  const whOptions: Option[] = useMemo(() => warehouses.map(w => ({ value: w.id, label: w.name })), [warehouses])
  const lotOptions: Option[] = useMemo(() => lots.map(l => ({ value: l.id, label: l.short_desc ?? l.id.slice(0,6) })), [lots])

  async function getMyOrgId(): Promise<string> {
    const { data, error } = await supabase.from('profiles').select('org_id').single()
    if (error || !data) throw error ?? new Error('org_id nicht gefunden')
    return data.org_id
  }

  function addInputRow() { setInputs(prev => [...prev, { lot_id: '', qty_kg: '' }]) }
  function updateInputRow(i: number, patch: Partial<{lot_id: string; qty_kg: string}>) {
    setInputs(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function removeInputRow(i: number) {
    setInputs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const orgId = await getMyOrgId()
      // 1) Produktionslauf
      const { data: run, error: runErr } = await supabase.from('production_runs').insert([{
        org_id: orgId,
        producer_org_id: form.producer_org_id || orgId, // solange ihr selbst verbucht
        product_id: form.product_id,
        run_date: form.run_date
      }]).select('id').single()
      if (runErr) throw runErr

      // 2) Inputs
      const validInputs = inputs.filter(r => r.lot_id && r.qty_kg && Number(r.qty_kg) > 0)
      if (validInputs.length === 0) throw new Error('Bitte mindestens einen Rohkaffee-Input mit Menge angeben.')
      const { error: inErr } = await supabase.from('run_inputs').insert(
        validInputs.map(r => ({ production_run_id: run.id, green_lot_id: r.lot_id, qty_kg: Number(r.qty_kg) }))
      )
      if (inErr) throw inErr

      // 3) Fertig-Charge anlegen (Output: entweder kg oder units setzen)
      const payload: any = {
        org_id: orgId,
        product_id: form.product_id,
        production_run_id: run.id,
        variant_id: form.variant_id || null,
        batch_code: form.batch_code || null,
        mhd_text: form.mhd_text || null
      }
      if (form.output_kg) payload.output_kg = Number(form.output_kg)
      if (!form.output_kg && form.units) payload.units = Number(form.units)

      const { data: batch, error: fbErr } = await supabase.from('finished_batches')
        .insert([payload])
        .select('id, units')
        .single()
      if (fbErr) throw fbErr

      // 4) Bewegungen: grün "out" (aus Produktionslager), fertig "in" (ins Fertiglager)
      const greenMoves = validInputs.map(r => ({
        org_id: orgId, item: 'green' as const, green_lot_id: r.lot_id,
        warehouse_id: form.src_wh, direction: 'out' as const, reason: 'production_consume' as const,
        qty_kg: Number(r.qty_kg), ref: `run:${run.id}`
      }))
      const { error: gmErr } = await supabase.from('inventory_moves').insert(greenMoves)
      if (gmErr) throw gmErr

      // Units für fertige Ware: aus der Batch lesen (Autofill-Trigger kann Units berechnen)
      const units = batch?.units
      if (!units || units <= 0) {
        console.warn('Hinweis: Units der Charge sind 0/leer – bitte Output kg/Units prüfen.')
      } else {
        const { error: fmErr } = await supabase.from('inventory_moves').insert([{
          org_id: orgId, item: 'finished' as const, finished_batch_id: batch!.id,
          warehouse_id: form.dst_wh, direction: 'in' as const, reason: 'production_output' as const,
          qty_units: units, ref: `run:${run.id}`
        }])
        if (fmErr) throw fmErr
      }

      // Erfolg -> Formular zurücksetzen
      alert('Produktion gespeichert.')
      setForm(f => ({ ...f, mhd_text: '', batch_code: '', output_kg: '', units: '' }))
      setInputs([{ lot_id: '', qty_kg: '' }])
    } catch (e:any) {
      console.error(e)
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Produktion anlegen</h2>

      <form onSubmit={onCreate} className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Produkt
            <select className="border rounded px-2 py-2 w-full"
              value={form.product_id}
              onChange={e => setForm({ ...form, product_id: e.target.value, variant_id: '' })}
              required
            >
              <option value="">— wählen —</option>
              {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm">
            Variante
            <select className="border rounded px-2 py-2 w-full"
              value={form.variant_id}
              onChange={e => setForm({ ...form, variant_id: e.target.value })}
            >
              <option value="">— optional —</option>
              {variantOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm">
            Produktionsdatum
            <input className="border rounded px-3 py-2 w-full" type="date"
              value={form.run_date} onChange={e => setForm({ ...form, run_date: e.target.value })}/>
          </label>

          <div className="text-sm grid grid-cols-2 gap-2">
            <label>
              Output (kg)
              <input className="border rounded px-3 py-2 w-full" placeholder="z. B. 125.0"
                value={form.output_kg} onChange={e => setForm({ ...form, output_kg: e.target.value, units: '' })}/>
            </label>
            <label>
              Units (Packungen)
              <input className="border rounded px-3 py-2 w-full" placeholder="falls kg nicht angegeben"
                value={form.units} onChange={e => setForm({ ...form, units: e.target.value, output_kg: '' })}/>
            </label>
          </div>

          <label className="text-sm">
            MHD (Text)
            <input className="border rounded px-3 py-2 w-full" placeholder="frei (z. B. 2026-06)"
              value={form.mhd_text} onChange={e => setForm({ ...form, mhd_text: e.target.value })}/>
          </label>
          <label className="text-sm">
            Charge (Text)
            <input className="border rounded px-3 py-2 w-full" placeholder="frei (z. B. AB123)"
              value={form.batch_code} onChange={e => setForm({ ...form, batch_code: e.target.value })}/>
          </label>

          <label className="text-sm">
            Quelle (Lager)
            <select className="border rounded px-2 py-2 w-full"
              value={form.src_wh} onChange={e => setForm({ ...form, src_wh: e.target.value })} required>
              {whOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Ziel (Lager)
            <select className="border rounded px-2 py-2 w-full"
              value={form.dst_wh} onChange={e => setForm({ ...form, dst_wh: e.target.value })} required>
              {whOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-2">
          <div className="font-medium mb-2">Rohkaffee-Inputs</div>
          <div className="space-y-2">
            {inputs.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_80px] gap-2 items-center">
                <select className="border rounded px-2 py-2"
                  value={r.lot_id} onChange={e => updateInputRow(i, { lot_id: e.target.value })}>
                  <option value="">— Lot wählen —</option>
                  {lotOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className="border rounded px-3 py-2" placeholder="Menge (kg)"
                  value={r.qty_kg} onChange={e => updateInputRow(i, { qty_kg: e.target.value })}/>
                <button type="button" className="text-sm text-slate-700 underline" onClick={() => removeInputRow(i)}>entf.</button>
              </div>
            ))}
            <button type="button" className="rounded bg-slate-200 px-3 py-1 text-sm" onClick={addInputRow}>+ Zeile</button>
          </div>
        </div>

        <div className="text-right">
          <button disabled={busy} className="rounded bg-green-700 text-white px-3 py-1.5 text-sm">
            {busy ? 'Speichere…' : 'Produktion speichern'}
          </button>
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}
      </form>
    </div>
  )
}
