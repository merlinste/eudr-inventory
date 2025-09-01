import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import L, { GeoJSON as LGeoJSON } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Lot = { id: string; short_desc: string | null; origin_country: string | null }
type PlotRow = { plot_id: string; geojson: any; area_ha: number | null }
type Farm = { id: string; name: string }

export default function LotDetail() {
  const { id } = useParams<{ id: string }>()
  const [lot, setLot] = useState<Lot | null>(null)
  const [plots, setPlots] = useState<PlotRow[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [farmId, setFarmId] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<LGeoJSON | null>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)

  // Karte initialisieren
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    mapRef.current = L.map(mapDivRef.current).setView([0, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapRef.current)
    layerRef.current = L.geoJSON().addTo(mapRef.current)
  }, [])

  // Daten laden
  async function reload() {
    if (!id) return
    setErr(null)
    const [lotRes, plotRes, farmRes] = await Promise.all([
      supabase.from('green_lots').select('id, short_desc, origin_country').eq('id', id).single(),
      supabase.from('v_lot_plots_geojson').select('plot_id, geojson, area_ha').eq('green_lot_id', id),
      supabase.from('farms').select('id, name').order('name')
    ])
    if (lotRes.error) setErr(lotRes.error.message)
    if (plotRes.error) setErr(plotRes.error.message || null)
    if (farmRes.error) setErr(farmRes.error.message || null)
    setLot(lotRes.data ?? null)
    setPlots(plotRes.data ?? [])
    setFarms(farmRes.data ?? [])
  }
  useEffect(() => { reload() }, [id]) // eslint-disable-line

  // Plots in Karte darstellen
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    if (plots.length > 0) {
      const gj = {
        type: 'FeatureCollection',
        features: plots.map(p => ({ type: 'Feature', geometry: p.geojson, properties: { plot_id: p.plot_id } }))
      } as any
      const gjLayer = L.geoJSON(gj)
      gjLayer.addTo(map)
      layerRef.current = gjLayer
      try { map.fitBounds(gjLayer.getBounds(), { padding: [20, 20] }) } catch { /* ignore */ }
    }
  }, [plots])

  async function ensureFarm(): Promise<string> {
    if (farmId) return farmId
    if (farms[0]) { setFarmId(farms[0].id); return farms[0].id }
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
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
      const features: any[] =
        json.type === 'FeatureCollection' ? json.features :
        json.type === 'Feature' ? [json] : [json]

      for (const feat of features) {
        const { error } = await supabase.rpc('import_geojson_for_lot', {
          p_green_lot_id: id,
          p_farm_id: fid,
          p_geojson: feat
        })
        if (error) throw error
      }
      await supabase.rpc('recalc_lot_areas', { p_green_lot_id: id }) // gleich Flächen setzen
      await reload()
      alert('GeoJSON importiert.')
    } catch (e:any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function recalcAreas() {
    try {
      setBusy(true); setErr(null)
      await supabase.rpc('recalc_lot_areas', { p_green_lot_id: id })
      await reload()
    } catch (e:any) {
      setErr(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  function exportGeoJSON() {
    const fc = {
      type: 'FeatureCollection',
      features: plots.map(p => ({ type: 'Feature', geometry: p.geojson, properties: { plot_id: p.plot_id, area_ha: p.area_ha } }))
    }
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `lot_${id}.geojson`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!id) return <div>Kein Lot gewählt.</div>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Lot‑Details</h2>
      {lot ? (
        <div className="text-sm text-slate-700">
          <div><b>Lot:</b> {lot.short_desc ?? lot.id}</div>
          <div><b>Herkunft:</b> {lot.origin_country ?? '–'}</div>
        </div>
      ) : <div>Lade Lot…</div>}

      <div className="flex gap-3">
        <button onClick={recalcAreas} className="rounded bg-slate-200 px-3 py-1 text-sm">Flächen berechnen/aktualisieren</button>
        <button onClick={exportGeoJSON} className="rounded bg-slate-200 px-3 py-1 text-sm">GeoJSON exportieren</button>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-4">
        <div><div ref={mapDivRef} className="border rounded overflow-hidden leaflet-container" /></div>
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
    </div>
  )
}
