// src/pages/Products.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Product = {
  id: string
  name: string
  organic: boolean
  is_ground: boolean
  is_whole_bean: boolean
  sku_earlybird: string | null
  sku_supplier: string | null
}
type Variant = {
  id: string
  product_id: string
  packaging_type: 'bag' | 'capsule_pack' | 'other' | null
  net_weight_g: number | null
  capsules_per_pack: number | null
  grams_per_capsule: number | null
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Record<string, Variant[]>>({})
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  // Neues Produkt + Varianten
  const [pname, setPname] = useState('')
  const [organic, setOrganic] = useState(false)
  const [isGround, setIsGround] = useState(false)
  const [isWholeBean, setIsWholeBean] = useState(true)
  const [skuEB, setSkuEB] = useState('')
  const [skuSup, setSkuSup] = useState('')

  // Beutel-Varianten
  const [w250, setW250] = useState(true)
  const [w500, setW500] = useState(false)
  const [w1000, setW1000] = useState(false)
  const [wCustom, setWCustom] = useState<number | ''>('')

  // Optional: Kapsel-Variante
  const [mkCaps, setMkCaps] = useState(false)
  const [capsPerPack, setCapsPerPack] = useState(10)
  const [gramsPerCap, setGramsPerCap] = useState(5.2)

  async function load() {
    setLoading(true); setErr(null)
    const p = await supabase.from('products').select('id,name,organic,is_ground,is_whole_bean,sku_earlybird,sku_supplier').order('name')
    if (p.error) setErr(p.error.message)
    setProducts((p.data ?? []) as Product[])

    const v = await supabase.from('product_variants')
      .select('id,product_id,packaging_type,net_weight_g,capsules_per_pack,grams_per_capsule')
    if (v.error) setErr(v.error.message || null)
    const grouped: Record<string, Variant[]> = {}
    for (const row of (v.data ?? []) as Variant[]) {
      grouped[row.product_id] = grouped[row.product_id] || []
      grouped[row.product_id].push(row)
    }
    setVariants(grouped); setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  async function createProduct() {
    setErr(null)
    try {
      if (!pname.trim()) { setErr('Bitte Produktname eingeben.'); return }
      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      if (!prof.data?.org_id) throw new Error('Keine Organisation gefunden (profiles.org_id).')

      // 1) Produkt anlegen (mit org_id für RLS)
      const insP = await supabase.from('products').insert([{
        org_id: prof.data.org_id,
        name: pname.trim(),
        organic,
        is_ground: isGround,
        is_whole_bean: isWholeBean,
        sku_earlybird: skuEB || null,
        sku_supplier: skuSup || null
      }]).select('id').single()
      if (insP.error) throw insP.error

      const toInsert: any[] = []

      // 2) Beutel-Varianten (250/500/1000/custom)
      const weights = [
        w250 ? 250 : null,
        w500 ? 500 : null,
        w1000 ? 1000 : null,
        typeof wCustom === 'number' && wCustom > 0 ? wCustom : null
      ].filter(Boolean) as number[]

      for (const g of weights) {
        toInsert.push({
          product_id: insP.data!.id,
          packaging_type: 'bag',
          net_weight_g: g,
          capsules_per_pack: null,
          grams_per_capsule: null
        })
      }

      // 3) Optionale Kapsel-Variante
      if (mkCaps) {
        toInsert.push({
          product_id: insP.data!.id,
          packaging_type: 'capsule_pack',
          net_weight_g: null,
          capsules_per_pack: capsPerPack,
          grams_per_capsule: gramsPerCap
        })
      }

      if (toInsert.length > 0) {
        const vRes = await supabase.from('product_variants').insert(toInsert)
        if (vRes.error) throw vRes.error
      }

      // Reset + Reload
      setPname(''); setOrganic(false); setIsGround(false); setIsWholeBean(true)
      setSkuEB(''); setSkuSup('')
      setW250(true); setW500(false); setW1000(false); setWCustom('')
      setMkCaps(false); setCapsPerPack(10); setGramsPerCap(5.2)
      await load()
    } catch (e:any) { setErr(e.message ?? String(e)) }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Produkte & Varianten</h2>

      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Neues Produkt</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2">Name
            <input className="border rounded px-3 py-2 w-full" value={pname}
                   onChange={e=>setPname(e.target.value)} placeholder="z. B. Earlybird Espresso"/>
          </label>

          <label className="col-span-1 flex items-center gap-2">
            <input type="checkbox" checked={organic} onChange={e=>setOrganic(e.target.checked)} />
            Bio
          </label>

          <div className="col-span-1 flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isWholeBean} onChange={e=>setIsWholeBean(e.target.checked)} />
              Ganze Bohne
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isGround} onChange={e=>setIsGround(e.target.checked)} />
              Gemahlen
            </label>
          </div>

          <label>Artikelnummer (earlybird)
            <input className="border rounded px-3 py-2 w-full" value={skuEB} onChange={e=>setSkuEB(e.target.value)} />
          </label>
          <label>Artikelnummer (Lieferant)
            <input className="border rounded px-3 py-2 w-full" value={skuSup} onChange={e=>setSkuSup(e.target.value)} />
          </label>
        </div>

        <div className="mt-2 text-sm">
          <div className="font-medium mb-1">Beutel‑Varianten anlegen</div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2"><input type="checkbox" checked={w250} onChange={e=>setW250(e.target.checked)} />250 g</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={w500} onChange={e=>setW500(e.target.checked)} />500 g</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={w1000} onChange={e=>setW1000(e.target.checked)} />1000 g</label>
            <label className="flex items-center gap-2">
              <span>frei (g)</span>
              <input type="number" className="border rounded px-2 py-1 w-24"
                     value={wCustom} onChange={e=>setWCustom(e.target.value ? parseInt(e.target.value,10) : '')} />
            </label>
          </div>
        </div>

        <div className="mt-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mkCaps} onChange={e=>setMkCaps(e.target.checked)} />
            zusätzlich eine Kapsel‑Variante anlegen
          </label>
          {mkCaps && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label>Kapseln pro Packung
                <input type="number" className="border rounded px-3 py-2 w-full"
                       value={capsPerPack} onChange={e=>setCapsPerPack(parseInt(e.target.value||'0',10))}/>
              </label>
              <label>Gramm je Kapsel
                <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                       value={gramsPerCap} onChange={e=>setGramsPerCap(parseFloat(e.target.value||'0'))}/>
              </label>
            </div>
          )}
        </div>

        <div className="text-right mt-3">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={createProduct}>
            Anlegen
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>

      <div className="border rounded p-4">
        <h3 className="font-medium mb-2">Bestehende Produkte</h3>
        {loading ? <div>Lade…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2">Produkt</th>
                <th className="text-left p-2">Eigenschaften</th>
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Varianten</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t align-top">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">
                    {p.organic ? 'Bio' : 'Konventionell'}
                    {' · '}
                    {[
                      p.is_whole_bean ? 'Ganze Bohne' : null,
                      p.is_ground ? 'Gemahlen' : null
                    ].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="p-2">
                    <div className="text-xs text-slate-700">
                      {p.sku_earlybird ? <>EB: {p.sku_earlybird}<br/></> : null}
                      {p.sku_supplier ? <>Lief.: {p.sku_supplier}</> : '—'}
                    </div>
                  </td>
                  <td className="p-2">
                    {(variants[p.id] ?? []).length === 0 && <span className="text-slate-500">—</span>}
                    {(variants[p.id] ?? []).map(v => (
                      <div key={v.id}>
                        {v.packaging_type === 'bag' && v.net_weight_g
                          ? `Beutel ${v.net_weight_g} g`
                          : v.packaging_type === 'capsule_pack'
                            ? `Kapseln: ${v.capsules_per_pack} × ${v.grams_per_capsule} g`
                            : 'Variante'}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {products.length===0 && <tr><td colSpan={4} className="p-2">Noch keine Produkte.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
