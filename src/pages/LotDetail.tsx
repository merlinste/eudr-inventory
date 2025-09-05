import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Prices, fetchPrices, calcEurPerKgForLot, fmtEurPerKg } from '@/lib/pricing'

type Lot = {
  id: string
  org_id: string
  lot_no: string | null
  short_desc: string | null
  origin_country: string | null
  organic: boolean
  species: 'arabica'|'robusta'|'other'|null
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
  dds_reference: string | null
  external_contract_no: string | null
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null
  price_fixed_eur_per_kg: number | null
  price_fixed_usd_per_lb: number | null
  price_diff_cents_per_lb: number | null
  price_base_contract: string | null
}

export default function LotDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [lot, setLot] = useState<Lot | null>(null)
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null })
  const [shortDesc, setShortDesc] = useState('')
  const [status, setStatus] = useState<Lot['status']>('contracted')
  const [dds, setDds] = useState('')
  const [extNo, setExtNo] = useState('')

  // Leaflet
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => { if (id) void load(id) }, [id])

  async function load(lotId: string) {
    const { data, error } = await supabase.from('green_lots')
      .select('id, org_id, lot_no, short_desc, origin_country, organic, species, status, dds_reference, external_contract_no, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_base_contract')
      .eq('id', lotId).single()
    if (error) { alert(error.message); return }
    setLot(data as Lot)
    setShortDesc(data.short_desc ?? '')
    setStatus((data.status ?? 'contracted') as Lot['status'])
    setDds(data.dds_reference ?? '')
    setExtNo(data.external_contract_no ?? '')
    initMap()
    await loadGeo(lotId)
  }

  function initMap(){
    if (mapRef.current || !mapEl.current) return
    const m = L.map(mapEl.current, { center: [0,0], zoom: 2, worldCopyJump: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(m)
    const g = L.geoJSON(undefined, {
      onEachFeature: (f, l) => {
        const name = (f.properties as any)?.name ?? ''
        if (name) l.bindPopup(name)
      }
    })
    g.addTo(m)
    mapRef.current = m
    layerRef.current = g
  }

  async function loadGeo(lotId: string){
    const res = await supabase.from('v_lot_plots_geojson')
      .select('geojson, name').eq('green_lot_id', lotId)
    if (res.error) return
    const feats: any[] = []
    for (const r of (res.data ?? [])) {
      const g = typeof r.geojson === 'string' ? JSON.parse(r.geojson) : r.geojson
      if (!g) continue
      if (g.type === 'Feature') feats.push(g)
      else if (g.type === 'FeatureCollection') feats.push(...(g.features ?? []))
      else if (g.type === 'Polygon' || g.type === 'MultiPolygon') feats.push({ type:'Feature', properties:{ name:r.name }, geometry:g })
    }
    if (layerRef.current) {
      layerRef.current.clearLayers()
      if (feats.length) {
        layerRef.current.addData({ type:'FeatureCollection', features: feats } as any)
        try { mapRef.current?.fitBounds(layerRef.current.getBounds(), { maxZoom: 12, padding:[10,10] }) } catch {}
      }
    }
  }

  async function save() {
    if (!lot) return
    const { error } = await supabase.from('green_lots').update({
      short_desc: shortDesc || null,
      status,
      dds_reference: dds || null,
      external_contract_no: extNo || null
    }).eq('id', lot.id)
    if (error) alert(error.message); else alert('Gespeichert.')
  }

  async function refreshPrices() {
    const p = await fetchPrices(lot?.price_base_contract ?? null)
    setPrices(p)
  }

  if (!lot) return <div>Lade…</div>

  const eurPerKg = calcEurPerKgForLot(lot, prices)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      <div className="border rounded p-4 space-y-3">
        <div className="text-sm text-slate-600">
          <span className="font-medium">Lot‑Nr.:</span> <span className="font-mono">{lot.lot_no ?? '—'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Kurzbeschreibung
            <input className="border rounded px-3 py-2 w-full" value={shortDesc} onChange={e=>setShortDesc(e.target.value)} />
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full" value={status ?? 'contracted'} onChange={e=>setStatus(e.target.value as Lot['status'])}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>
          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full" value={dds} onChange={e=>setDds(e.target.value)} />
          </label>
          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full" value={extNo} onChange={e=>setExtNo(e.target.value)} />
          </label>
        </div>

        {/* Preisblock (Preview) */}
        <div className="mt-2 text-sm">
          <div className="mb-2 text-slate-600">
            Preisvorschau: <span className="font-medium">{fmtEurPerKg(eurPerKg)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded bg-slate-200 px-3 py-2 text-sm" onClick={refreshPrices}>Marktdaten aktualisieren</button>
            <div className="text-xs text-slate-500">
              USD→EUR: {prices.usd_eur ?? '—'} · KC (USD/lb): {prices.kc_usd_per_lb ?? '—'}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={save}>Speichern</button>
        </div>
      </div>

      {/* Dateien – UI-Hook (siehe Storage-Abschnitt unten) */}
      {lot.org_id && (
        <div className="border rounded p-4">
          <h3 className="font-medium mb-2">Dateien</h3>
          <LotFiles lotId={lot.id} orgId={lot.org_id} />
        </div>
      )}

      {/* Karte */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Karte & Plots (GeoJSON)</h3>
        <div className="text-xs text-slate-500">Feature/FeatureCollection; WGS84.</div>
        <input type="file" accept=".json,.geojson,application/geo+json,application/json"
               onChange={onFile} />
        <div ref={mapEl} className="h-[460px] w-full border rounded" />
      </div>
    </div>
  )

  async function onFile(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]; if (!f || !lot) return
    try{
      const txt = await f.text()
      const parsed = JSON.parse(txt)
      const { error, data } = await supabase.rpc('import_lot_geojson', { p_lot_id: lot.id, p_geojson: parsed })
      if (error) throw error
      await loadGeo(lot.id)
      alert(`${data ?? 0} Feature(s) importiert.`)
    }catch(err:any){
      alert(err.message ?? String(err))
    }finally{
      e.target.value = ''
    }
  }
}

/** Minimaler Datei-Bereich; echte Upload-Funktion unten freischalten, wenn Storage aktiv ist */
function LotFiles({ lotId, orgId }:{ lotId:string, orgId:string }){
  // Platzhalter bis Storage-Bucket steht
  return (
    <div className="text-sm text-slate-500">
      Datei‑Uploads aktivieren: siehe Abschnitt „Storage aktivieren“ weiter unten.
    </div>
  )
}
