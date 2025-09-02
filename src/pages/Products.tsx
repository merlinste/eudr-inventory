import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Product = {
  id: string
  name: string
  sku: string
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
  const [skuEB, setSkuEB] = useState('')          // → wird auch in products.sku geschrieben (Not-Null)
  const [skuSup, setSkuSup] = useState('')
  const [organic, setOrganic] = useState(false)
  const [isGround, setIsGround] = useState(false)
  const [isWholeBean, setIsWholeBean] = useState(true)

  // Beutel-Varianten
  const [w250, setW250] = useState(true)
  const [w500, setW500] = useState(false)
  const [w1000, setW1000] = useState(false)
  const [wCustom, setWCustom] = useState<number | ''>('')

  // Optional: Kapseln
  const [mkCaps, setMkCaps] = useState(false)
  const [capsPerPack, setCapsPerPack] = useState(10)
  const [gramsPerCap, setGramsPerCap] = useState(5.2)

  async function load() {
    setLoading(true); setErr(null)
    const p = await supabase.from('products').select('id,name,sku,organic,is_ground,is_whole_bean,sku_earlybird,sku_supplier').order('name')
    if (p.error) setErr(p.error.message)
    setProducts((p.data ?? []) as Product[])

    const v = await supabase.from('product_variants').select('id,product_id,packaging_type,net_weight_g,capsules_per_pack,grams_per_capsule')
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
      if (!pname.trim()) throw new Error('Bitte Produktname eingeben.')
      if (!skuEB.trim()) throw new Error('Bitte Artikelnummer (earlybird) eingeben.')
      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      if (!prof.data?.org_id) throw new Error('Keine Organisation gefunden (profiles.org_id).')

      // Produkt anlegen (sku = EB-Artikelnummer, erfüllt Not-Null)
      const insP = await supabase.from('products').insert([{
        org_id: prof.data.org_id,
        name: pname.trim(),
        sku: skuEB.trim(),
        organic, is_ground: isGround, is_whole_bean: isWholeBean,
        sku_earlybird: skuEB.trim(),
        sku_supplier: skuSup || null
      }]).select('id').single()
      if (insP.error) throw insP.error

      const toInsert: any[] = []
      const weights = [
        w250 ? 250 : null,
        w500 ? 500 : null,
        w1000 ? 1000 : null,
        typeof wCustom === 'number' && wCustom > 0 ? wCustom : null
      ].filter(Boolean) as number[]

      for (const g of weights) {
        toInsert.push({ product_id: insP.data!.id, packaging_type: 'bag', net_weight_g: g })
      }
      if (mkCaps) {
        toInsert.push({
          product_id: insP.data!.id,
          packaging_type: 'capsule_pack',
          capsules_per_pack: capsPerPack,
          grams_per_capsule: gramsPerCap
        })
      }
      if (toInsert.length) {
        const vRes = await supabase.from('product_variants').insert(toInsert)
        if (vRes.error) throw vRes.error
      }

      // Reset
      setPname(''); setSkuEB(''); setSkuSup('')
      setOrganic(false); setIsGround(false); setIsWholeBean(true)
      setW250(true); setW500(false); setW1000(false); setWCustom('')
      setMkCaps(false); setCapsPerPack(10); setGramsPerCap(5.2)
      await load()
    } catch (e:any) { setErr(e.message ?? String(e)) }
  }

  async function deleteProduct(id: string) {
    if (!confirm('Wirklich löschen? Dies entfernt auch Varianten.')) return
    setErr(null)
    const res = await supabase.rpc('safe_delete_product', { p_id: id })
    if (res.error) setErr(res.error.message)
    else await load()
  }

  if (loading) return <div>Lade…</div>

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
          <label>Artikelnummer (earlybird)
            <input className="border rounded px-3 py-2 w-full" value={skuEB}
                   onChange={e=>setSkuEB(e.target.value)} placeholder="Pflichtfeld"/>
          </label>
          <label>Artikelnummer (Lieferant)
            <input className="border rounded px-3 py-2 w-full" value={skuSup}
                   onChange={e=>setSkuSup(e.target.value)} />
          </label>

          <label className="col-span-2 flex items-center gap-4">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={isWholeBean} onChange={e=>setIsWholeBean(e.target.checked)} />
              Ganze Bohne
            </span>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={isGround} onChange={e=>setIsGround(e.target.checked)} />
              Gemahlen
            </span>
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={organic} onChange={e=>setOrganic(e.target.checked)} />
              Bio
            </span>
          </label>
        </div>

        <div className="mt-2 text-sm">
          <div className="font-medium mb-1">Beutel‑Varianten</div>
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
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Produkt</th>
                <th className="text-left p-2">Eigenschaften</th>
                <th className="text-left p-2">Varianten</th>
                <th className="text-left p-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t align-top">
                  <td className="p-2">{p.sku}</td>
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
                  <td className="p-2">
                    <button className="rounded bg-red-100 text-red-700 text-xs px-2 py-1"
                            onClick={()=>deleteProduct(p.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
              {products.length===0 && <tr><td colSpan={5} className="p-2">Noch keine Produkte.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
