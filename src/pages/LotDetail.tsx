import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import L, { GeoJSON as LGeoJSON } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Lot = { id: string; short_desc: string | null; origin_country: string | null }
type PlotRow = { plot_id: string; geojson: any; area_ha: number | null }
type Farm = { id: string; name: string }
type EudrPkg = { dds_reference: string | null; production_start: string | null; production_end: string | null }
type UsageRow = { finished_batch_id: string; product_name: string; batch_code: string | null; mhd_text: string | null; run_date: string | null }

export default function LotDetail() {
  const nav = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<'map' | 'eudr'>('map')

  const [lot, setLot] = useState<Lot | null>(null)
  const [plots, setPlots] = useState<PlotRow[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [farmId, setFarmId] = useState<string>('')
  const [eudr, setEudr] = useState<EudrPkg | null>(null)
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Leaflet
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<LGeoJSON | null>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)

  // Init map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    mapRef.current = L.map(mapDivRef.current).setView([0, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapRef.current)
    layerRef.current = L.geoJSON().addTo(mapRef.current)
  }, [])

  async function reload() {
    if (!id) return
    setErr(null)
    const [lotRes, plotRes, farmRes, eudrRes, usageRes] = await Promise.all([
      supabase.from('green_lots').select('id, short_desc, origin_country').eq('id', id).maybeSingle(),
      supabase.from('v_lot_plots_geojson').select('plot_id, geojson, area_ha').eq('green_lot_id', id),
      supabase.from('farms').select('id, name').order('name'),
      supabase.from('eudr_packages').select('dds_reference, production_start, production_end').eq('green_lot_id', id).maybeSingle(),
      supabase.from('v_lot_batch_usage').select('finished_batch_id, product_name, batch_code, mhd_text, run_date').eq('green_lot_id', id).order('run_date', { ascending: false })
    ])
    if (lotRes.error) setErr(lotRes.error.message)
    if (plotRes.error) setErr(plotRes.error.message || null)
    if (farmRes.error) setErr(farmRes.error.message || null)
    if (eudrRes.error) setErr(eudrRes.error.message || null)
    if (usageRes.error) setErr(usageRes.error.message || null)

    setLot(lotRes.data ?? null)
    setPlots(plotRes.data ?? [])
    setFarms(farmRes.data ?? [])
    setEudr(eudrRes.data ?? null)
    setUsage(usageRes.data ?? [])
  }
  useEffect(() => { reload() }, [id]) // eslint-disable-line

  // Render plots on map
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    if (plots.length > 0) {
      const fc = { type: 'FeatureCollection', features: plots.map(p => ({ type:'Feature', geometry: p.geojson, properties: { plot_id: p.plot_id } })) } as any
      const gjLayer = L.geoJSON(fc)
      gjLayer.addTo(map)
      ;(layerRef as any).current = gjLayer
      try { map.fitBounds(gjLayer.getBounds(), { padding: [20,20] }) } catch {}
    }
  }, [plots])

  async function ensureFarm(): Promise<string> {
    if (farmId) return farmId
    if (farms[0]) { setFarmId(farms[0].id); return farms[0].id }
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const name = `Upload Farm (${lot?.short_desc ?? id?.slice(0,6)})`
    const { data, error } = await supabase.from('farms')
      .insert([{ org_id: prof?.org_id, name, country: lot?.origin_country ?? null }])
      .select('id').single()
    if (error) throw error
    setFarms([{ id: data!.id, name }]); setFarmId(data!.id)
    return data!.id
  }

  async function onFileChosen(file: File) {
    try {
      setBusy(true); setErr(null)
      const text = await file.text()
      const json = JSON.parse(text)
      const fid = await ensureFarm()
      const features: any[] = json.type === 'FeatureCollection' ? json.features : (json.type === 'Feature' ? [json] : [json])
      for (const feat of features) {
        const { error } = await supabase.rpc('import_geojson_for_lot', { p_green_lot_id: id, p_farm_id: fid, p_geojson: feat })
        if (error) throw error
      }
      await supabase.rpc('recalc_lot_areas', { p_green_lot_id: id })
      await reload()
      alert('GeoJSON importiert.')
    } catch (e:any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  function exportGeoJSON() {
    const fc = { type: 'FeatureCollection', features: plots.map(p => ({ type:'Feature', geometry: p.geojson, properties:{ plot_id: p.plot_id, area_ha: p.area_ha } })) }
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `lot_${id}.geojson`; a.click(); URL.revokeObjectURL(url)
  }

  async function recalcAreas() {
    setBusy(true); setErr(null)
    await supabase.rpc('recalc_lot_areas', { p_green_lot_id: id })
    await reload()
    setBusy(false)
  }

  // EUDR
  const [form, setForm] = useState({ dds_reference: '', production_start: '', production_end: '' })
  useEffect(() => {
    setForm({
      dds_reference: eudr?.dds_reference ?? '',
      production_start: eudr?.production_start ?? '',
      production_end: eudr?.production_end ?? ''
    })
  }, [eudr])

  async function saveEudr() {
    try {
      setBusy(true); setErr(null)
      if (!id) throw new Error('Kein Lot')
      if (eudr) {
        const { error } = await supabase.from('eudr_packages').update({
          dds_reference: form.dds_reference || null,
          production_start: form.production_start || null,
          production_end: form.production_end || null
        }).eq('green_lot_id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('eudr_packages').insert([{
          green_lot_id: id,
          dds_reference: form.dds_reference || null,
          production_start: form.production_start || null,
          production_end: form.production_end || null
        }])
        if (error) throw error
      }
      await reload()
    } catch (e:any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!id) return <div>Kein Lot gewählt.</div>

  return (
    <div className="space-y-4">
      {/* Breadcrumb / zurück */}
      <div className="text-sm">
        <button onClick={()=>nav(-1)} className="text-sky-700 underline">← zurück</button>
        <span className="mx-2 text-slate-400">·</span>
        <Link to="/lots" className="text-sky-700 underline">Zur Liste</Link>
      </div>

      <h2 className="text-lg font-medium">Lot‑Details</h2>
      {lot ? (
        <div className="text-sm text-slate-700">
          <div><b>Lot:</b> {lot.short_desc ?? lot.id}</div>
          <div><b>Herkunft:</b> {lot.origin_country ?? '–'}</div>
        </div>
      ) : <div>Lade Lot…</div>}

      {/* Tabs */}
      <div className="flex gap-2 text-sm">
        <button onClick={()=>setTab('map')} className={'px-3 py-1 rounded ' + (tab==='map'?'bg-slate-200':'bg-slate-100')}>Karte</button>
        <button onClick={()=>setTab('eudr')} className={'px-3 py-1 rounded ' + (tab==='eudr'?'bg-slate-200':'bg-slate-100')}>EUDR</button>
      </div>

      {tab==='map' && (
        <>
          <div className="flex gap-3">
            <button onClick={recalcAreas} className="rounded bg-slate-200 px-3 py-1 text-sm">Flächen berechnen/aktualisieren</button>
            <button onClick={exportGeoJSON} className="rounded bg-slate-200 px-3 py-1 text-sm">GeoJSON exportieren</button>
          </div>
          <div className="grid grid-cols-[1fr_300px] gap-4">
            <div><div ref={mapDivRef} className="border rounded overflow-hidden leaflet-container" style={{height:'520px'}} /></div>
            <div className="space-y-3">
              <div className="text-sm">
                <label className="block mb-1 font-medium">Farm für neue Plots</label>
                <select className="border rounded px-2 py-2 w-full" value={farmId} onChange={e=>setFarmId(e.target.value)}>
                  <option value="">(automatisch anlegen)</option>
                  {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="text-sm">
                <label className="block mb-1 font-medium">GeoJSON hochladen</label>
                <input type="file" accept=".geojson,application/geo+json,application/json"
                  onChange={e => { const file = e.target.files?.[0]; if (file) onFileChosen(file) }}/>
              </div>
              <div className="text-sm">
                <div className="font-medium mb-1">Vorhandene Plots</div>
                <ul className="list-disc pl-5">
                  {plots.map(p => <li key={p.plot_id}>{p.plot_id.slice(0,8)}… {p.area_ha != null ? `(${p.area_ha} ha)` : ''}</li>)}
                  {plots.length === 0 && <li>Keine Plots verknüpft.</li>}
                </ul>
              </div>
              {err && <div className="text-red-600 text-sm">{err}</div>}
              {busy && <div className="text-sm">Bitte warten…</div>}
            </div>
          </div>
        </>
      )}

      {tab==='eudr' && (
        <div className="grid grid-cols-[1fr] gap-6">
          <section className="border rounded p-4 space-y-3">
            <h3 className="font-medium mb-1">DDS‑Referenz & Produktionsfenster</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label> DDS‑Referenz
                <input className="border rounded px-3 py-2 w-full" placeholder="z. B. EUDR‑REF‑123"
                  value={form.dds_reference} onChange={e=>setForm({...form, dds_reference: e.target.value})}/>
              </label>
              <label> Produktion Start
                <input type="date" className="border rounded px-3 py-2 w-full"
                  value={form.production_start ?? ''} onChange={e=>setForm({...form, production_start: e.target.value})}/>
              </label>
              <label> Produktion Ende
                <input type="date" className="border rounded px-3 py-2 w-full"
                  value={form.production_end ?? ''} onChange={e=>setForm({...form, production_end: e.target.value})}/>
              </label>
            </div>
            <div className="text-right">
              <button onClick={saveEudr} className="rounded bg-green-700 text-white px-3 py-1.5 text-sm" disabled={busy}>
                Speichern
              </button>
            </div>
            {err && <div className="text-red-600 text-sm">{err}</div>}
          </section>

          <section className="border rounded p-4">
            <div className="font-medium">Verwendungen in Fertig‑Chargen</div>
            <table className="w-full border mt-3 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Produkt</th>
                  <th className="p-2 text-left">Charge</th>
                  <th className="p-2 text-left">MHD</th>
                  <th className="p-2 text-left">Datum</th>
                </tr>
              </thead>
              <tbody>
                {usage.map(u => (
                  <tr key={u.finished_batch_id} className="border-t">
                    <td className="p-2">{u.product_name}</td>
                    <td className="p-2">{u.batch_code ?? '–'}</td>
                    <td className="p-2">{u.mhd_text ?? '–'}</td>
                    <td className="p-2">{u.run_date ?? '–'}</td>
                  </tr>
                ))}
                {usage.length === 0 && (
                  <tr><td colSpan={4} className="p-2 text-slate-500">Keine Verwendungen gefunden.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  )
}
