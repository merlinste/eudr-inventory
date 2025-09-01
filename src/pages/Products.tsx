import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Product = { id: string; name: string }
type Variant = {
  id: string; product_id: string;
  packaging_type: 'capsule_pack'|'other'|null;
  capsules_per_pack: number | null;
  grams_per_capsule: number | null;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Record<string, Variant[]>>({})
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  // Neues Produkt + Variante
  const [pname, setPname] = useState('')
  const [mkVariant, setMkVariant] = useState(false)
  const [capsPerPack, setCapsPerPack] = useState(10)
  const [gramsPerCap, setGramsPerCap] = useState(5.2)

  async function load() {
    setLoading(true); setErr(null)
    const p = await supabase.from('products').select('id,name').order('name')
    if (p.error) setErr(p.error.message)
    setProducts((p.data ?? []) as Product[])

    const v = await supabase.from('product_variants').select('id,product_id,packaging_type,capsules_per_pack,grams_per_capsule')
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
      const insP = await supabase.from('products').insert([{ org_id: prof.data?.org_id, name: pname.trim() }]).select('id').single()
      if (insP.error) throw insP.error
      if (mkVariant) {
        const vRes = await supabase.from('product_variants').insert([{
          product_id: insP.data!.id,
          packaging_type: 'capsule_pack',
          capsules_per_pack: capsPerPack,
          grams_per_capsule: gramsPerCap
        }])
        if (vRes.error) throw vRes.error
      }
      setPname(''); setMkVariant(false); setCapsPerPack(10); setGramsPerCap(5.2)
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
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={mkVariant} onChange={e=>setMkVariant(e.target.checked)} />
            sofort eine Kapsel‑Variante anlegen
          </label>
          {mkVariant && (
            <>
              <label>Kapseln pro Packung
                <input type="number" className="border rounded px-3 py-2 w-full"
                       value={capsPerPack} onChange={e=>setCapsPerPack(parseInt(e.target.value||'0'))}/>
              </label>
              <label>Gramm je Kapsel
                <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                       value={gramsPerCap} onChange={e=>setGramsPerCap(parseFloat(e.target.value||'0'))}/>
              </label>
            </>
          )}
        </div>
        <div className="text-right">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={createProduct}>Anlegen</button>
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
                <th className="text-left p-2">Varianten</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">
                    {(variants[p.id] ?? []).length === 0 && <span className="text-slate-500">—</span>}
                    {(variants[p.id] ?? []).map(v => (
                      <div key={v.id}>
                        {v.packaging_type === 'capsule_pack'
                          ? `Kapseln: ${v.capsules_per_pack} × ${v.grams_per_capsule} g`
                          : 'Variante'}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {products.length===0 && <tr><td colSpan={2} className="p-2">Noch keine Produkte.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
