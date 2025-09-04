// src/pages/LotDetail.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Feature, FeatureCollection, Geometry, GeoJsonObject } from 'geojson'
import { fetchPrices, calcEurPerKgForLot, type Prices } from '@/lib/pricing'

type Species = 'arabica'|'robusta'|'other'
type LotStatus = 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null

type Lot = {
  id: string
  lot_no?: string | null
  root_lot_no?: string | null
  short_desc: string | null
  external_contract_no: string | null
  dds_reference: string | null
  origin_country: string | null
  organic: boolean
  species: Species
  status: LotStatus
  // Preise
  price_scheme: PriceScheme
  price_base_contract?: string | null
  price_fixed_eur_per_kg?: number | null
  price_fixed_usd_per_lb?: number | null
  price_diff_cents_per_lb?: number | null
  price_diff_usd_per_ton?: number | null
}

type Wh = { id: string; name: string }
type WhBalance = { warehouse_id: string; warehouse_name: string; balance_kg: number }

export default function LotDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [lot, setLot] = useState<Lot | null>(null)
  const [shortDesc, setShortDesc] = useState('')
  const [status, setStatus] = useState<LotStatus>('contracted')
  const [ddsRef, setDdsRef] = useState('')
  const [extNo, setExtNo] = useState('')

  // Preisfelder (lokale Bearbeitung)
  const [priceScheme, setPriceScheme] = useState<PriceScheme>('fixed_eur')
  const [priceBase, setPriceBase] = useState<string>('')
  const [priceEurKg, setPriceEurKg] = useState<string>('')
  const [priceUsdLb, setPriceUsdLb] = useState<string>('')
  const [diffArabica, setDiffArabica] = useState<string>('') // c/lb
  const [diffRobusta, setDiffRobusta] = useState<string>('') // USD/t

  // Marktpreise
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null })
  const livePreview = useMemo(() => {
    if (!lot) return null
    return calcEurPerKgForLot({
      species: lot.species,
      price_scheme: priceScheme,
      price_fixed_eur_per_kg: toNum(priceEurKg),
      price_fixed_usd_per_lb: toNum(priceUsdLb),
      price_diff_cents_per_lb: toNum(diffArabica),
      price_diff_usd_per_ton: toNum(diffRobusta)
    }, prices)
  }, [lot, priceScheme, priceEurKg, priceUsdLb, diffArabica, diffRobusta, prices])

  // Lager & Bestände
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [balances, setBalances] = useState<WhBalance[]>([])

  // Aufteilen / Umlagern
  const [srcWh, setSrcWh] = useState('')
  const [dstWh, setDstWh] = useState('')
  const [moveKg, setMoveKg] = useState('')
  const [newShort, setNewShort] = useState('')
  const [tSrc, setTSrc] = useState('')
  const [tDst, setTDst] = useState('')
  const [tKg, setTKg] = useState('')

  // Karte
  const mapElRef = useRef<HTMLDivElement|null>(null)
  const mapRef = useRef<L.Map|null>(null)
  const geoLayerRef = useRef<L.GeoJSON|null>(null)

  useEffect(() => { if (id) void loadAll(id) }, [id])

  async function loadAll(lotId: string) {
    const [lr, wh, bal] = await Promise.all([
      supabase.from('green_lots').select(`
        id, lot_no, root_lot_no, short_desc, status, dds_reference, external_contract_no,
        origin_country, organic, species,
        price_scheme, price_base_contract, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
        price_diff_cents_per_lb, price_diff_usd_per_ton
      `).eq('id', lotId).single(),
      supabase.from('v_my_warehouses').select('id,name').order('name'),
      supabase.rpc('rpc_green_lot_balances', { p_lot_id: lotId })
    ])

    if (!lr.error && lr.data) {
      const L = lr.data as Lot
      setLot(L)
      setShortDesc(L.short_desc ?? '')
      setStatus(L.status ?? 'contracted')
      setDdsRef(L.dds_reference ?? '')
      setExtNo(L.external_contract_no ?? '')
      setNewShort(L.short_desc ? `${L.short_desc} (Teil)` : '')

      // Preis-UI füllen
      setPriceScheme(L.price_scheme ?? 'fixed_eur')
      setPriceBase(L.price_base_contract ?? '')
      setPriceEurKg(toStr(L.price_fixed_eur_per_kg))
      setPriceUsdLb(toStr(L.price_fixed_usd_per_lb))
      setDiffArabica(toStr(L.price_diff_cents_per_lb))
      setDiffRobusta(toStr(L.price_diff_usd_per_ton))
    }
    if (!wh.error) setWarehouses((wh.data ?? []) as Wh[])

    if (!bal.error && Array.isArray(bal.data)) {
      const rows = (bal.data as any[]).map(r => ({
        warehouse_id: r.warehouse_id,
        warehouse_name: r.name ?? r.warehouse_name ?? 'Lager',
        balance_kg: Number(r.balance_kg ?? 0)
      }))
      setBalances(rows)
      const firstWithStock = rows.find(r => r.balance_kg > 0)
      if (firstWithStock) {
        setSrcWh(prev => prev || firstWithStock.warehouse_id)
        setTSrc(prev => prev || firstWithStock.warehouse_id)
      }
    }

    initMapOnce()
    await loadGeoJSON(lotId)
  }

  function initMapOnce() {
    if (mapRef.current || !mapElRef.current) return
    const m = L.map(mapElRef.current, { center: [0,0], zoom: 2, worldCopyJump: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(m)
    const layer = L.geoJSON(undefined, {
      onEachFeature: (feat, lyr) => {
        const props = (feat.properties ?? {}) as Record<string, any>
        const label = props.name || props.id || ''
        if (label) lyr.bindPopup(String(label))
      }
    })
    layer.addTo(m)
    mapRef.current = m
    geoLayerRef.current = layer
  }

  async function loadGeoJSON(lotId: string) {
    try {
      const res = await supabase.from('v_lot_plots_geojson').select('*').eq('green_lot_id', lotId)
      const features: Feature<Geometry, any>[] = []
      if (!res.error && Array.isArray(res.data)) {
        for (const row of res.data as any[]) {
          const cand = row.geojson ?? row.feature ?? row.geom_geojson ?? row.geom ?? null
          if (!cand) continue
          const f = typeof cand === 'string' ? JSON.parse(cand) : cand
          if (f?.type === 'Feature') features.push(f as Feature<Geometry, any>)
          else if (f?.type === 'FeatureCollection') features.push(...((f.features ?? []) as Feature<Geometry, any>[]))
          else if (f?.type === 'Polygon' || f?.type === 'MultiPolygon')
            features.push({ type:'Feature', properties:{}, geometry:f })
        }
      }
      if (geoLayerRef.current) {
        geoLayerRef.current.clearLayers()
        if (features.length) {
          const fc: FeatureCollection<Geometry, any> = { type:'FeatureCollection', features }
          geoLayerRef.current.addData(fc as unknown as GeoJsonObject)
          try { mapRef.current?.fitBounds(geoLayerRef.current.getBounds(), { maxZoom: 12, padding:[10,10] }) } catch {}
        }
      }
    } catch {}
  }

  async function refreshMarket() {
    const p = await fetchPrices()
    setPrices(p)
  }

  async function saveEdit() {
    if (!id) return
    const upd = await supabase.from('green_lots').update({
      short_desc: shortDesc || null,
      status,
      dds_reference: ddsRef || null,
      external_contract_no: extNo || null,
      price_scheme: priceScheme,
      price_base_contract: priceScheme === 'differential' ? (priceBase || null) : null,
      price_fixed_eur_per_kg: priceScheme === 'fixed_eur' ? toNum(priceEurKg) : null,
      price_fixed_usd_per_lb: priceScheme === 'fixed_usd' ? toNum(priceUsdLb) : null,
      price_diff_cents_per_lb: priceScheme === 'differential' && lot?.species === 'arabica' ? toNum(diffArabica) : null,
      price_diff_usd_per_ton: priceScheme === 'differential' && lot?.species === 'robusta' ? toNum(diffRobusta) : null
    }).eq('id', id)
    if (upd.error) alert(upd.error.message); else alert('Gespeichert.')
  }

  async function fixCurrentPreview() {
    if (!id) return
    if (livePreview == null) { alert('Kein Preis verfügbar.'); return }
    const upd = await supabase.from('green_lots').update({
      price_scheme: 'fixed_eur',
      price_fixed_eur_per_kg: livePreview
    }).eq('id', id)
    if (upd.error) alert(upd.error.message)
    else {
      setPriceScheme('fixed_eur')
      setPriceEurKg(String(livePreview))
      alert('Preis festgeschrieben (EUR/kg).')
    }
  }

  // Aufteilen/Umlagern (wie gehabt)
  async function doSplit() {
    if (!id) return
    const kg = parseFloat(moveKg)
    if (!srcWh || !dstWh || !isFinite(kg) || kg <= 0) { alert('Bitte Quelle, Ziel und kg angeben.'); return }
    const res = await supabase.rpc('safe_split_green_lot', {
      p_source_id: id, p_src_warehouse_id: srcWh, p_dst_warehouse_id: dstWh,
      p_move_kg: kg, p_new_short_desc: newShort || null
    })
    if (res.error) alert(res.error.message)
    else { alert('Lot aufgeteilt.'); navigate('/lots') }
  }

  async function doTransfer(all = false) {
    if (!id) return
    if (!tSrc || !tDst) { alert('Bitte Quelle & Ziel wählen.'); return }
    if (tSrc === tDst) { alert('Quelle und Ziel müssen unterschiedlich sein.'); return }
    const kg = all ? null : (isFinite(parseFloat(tKg)) ? parseFloat(tKg) : null)
    const res = await supabase.rpc('safe_transfer_green', {
      p_lot_id: id, p_src_warehouse_id: tSrc, p_dst_warehouse_id: tDst, p_move_kg: kg
    })
    if (res.error) alert(res.error.message)
    else { alert(`Umlagerung ok (${res.data} kg).`); await loadAll(id) }
  }

  async function onGeoJSONFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!id) return
    const f = e.target.files?.[0]; if (!f) return
    try {
      const txt = await f.text()
      const parsed = JSON.parse(txt)
      const res = await supabase.rpc('import_lot_geojson', { p_lot_id: id, p_geojson: parsed })
      if (res.error) throw res.error
      await loadGeoJSON(id)
      alert(`${res.data ?? 0} Feature(s) importiert.`)
    } catch (err: any) {
      alert(err.message ?? String(err))
    } finally { e.target.value = '' }
  }

  if (!lot) return <div>Lade…</div>

  // Kontraktoptionen für UI
  const contracts = useMemo(() => {
    const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z']
    const KC_CYCLE = new Set(['H','K','N','U','Z'])
    const res: { label: string; value: string }[] = []
    const d = new Date(); d.setUTCDate(1)
    while (res.length < 8) {
      const m = d.getUTCMonth(); const y = d.getUTCFullYear()
      const code = MONTH_CODES[m]
      const ok = KC_CYCLE.has(code)
      if (ok) {
        const y1 = String(y).slice(-1); const mm = String(m+1).padStart(2,'0')
        const codeStr = `KC${code}${y1}`
        res.push({ value: codeStr, label: `${mm}/${y} (${codeStr})` })
      }
      d.setUTCMonth(d.getUTCMonth()+1)
    }
    return res
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      {/* Kopfzeile */}
      <div className="text-sm text-slate-600">
        <span className="font-medium">Lot‑Nr.:</span> <span className="font-mono">{lot.lot_no ?? '—'}</span>
        {lot.root_lot_no ? <> {' · '}<span className="font-medium">Ursprung:</span> <span className="font-mono">{lot.root_lot_no}</span></> : null}
      </div>

      {/* Stammdaten */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Stammdaten bearbeiten</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Kurzbeschreibung
            <input className="border rounded px-3 py-2 w-full" value={shortDesc} onChange={e=>setShortDesc(e.target.value)} />
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full" value={status ?? 'contracted'} onChange={e=>setStatus(e.target.value as LotStatus)}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>
          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full" value={ddsRef} onChange={e=>setDdsRef(e.target.value)} />
          </label>
          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full" value={extNo} onChange={e=>setExtNo(e.target.value)} />
          </label>
        </div>
        <div className="text-xs text-slate-500">
          Bestand je Lager:&nbsp;
          {balances.length ? balances.map(b => `${b.warehouse_name}: ${fmtKg(b.balance_kg)} kg`).join(' · ') : '—'}
        </div>
      </div>

      {/* Preis */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Preis</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Preis‑Schema
            <select className="border rounded px-3 py-2 w-full"
              value={priceScheme ?? 'fixed_eur'}
              onChange={e=>setPriceScheme(e.target.value as PriceScheme)}>
              <option value="fixed_eur">Fixiert in EUR/kg</option>
              <option value="fixed_usd">Fixiert in USD/lb</option>
              <option value="differential">Differential (KC/RC)</option>
            </select>
          </label>

          {/* Basis-Kontrakt nur bei Differential */}
          {priceScheme === 'differential' && lot.species === 'arabica' && (
            <label>Basis‑Kontrakt (Monat)
              <select className="border rounded px-3 py-2 w-full"
                value={priceBase ?? ''}
                onChange={e=>setPriceBase(e.target.value)}>
                {contracts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          )}

          {priceScheme === 'fixed_eur' && (
            <label>EUR/kg
              <input className="border rounded px-3 py-2 w-full" value={priceEurKg} onChange={e=>setPriceEurKg(e.target.value)} />
            </label>
          )}

          {priceScheme === 'fixed_usd' && (
            <label>USD/lb
              <input className="border rounded px-3 py-2 w-full" value={priceUsdLb} onChange={e=>setPriceUsdLb(e.target.value)} />
            </label>
          )}

          {priceScheme === 'differential' && lot.species === 'arabica' && (
            <label>Diff. (c/lb)
              <input className="border rounded px-3 py-2 w-full" value={diffArabica} onChange={e=>setDiffArabica(e.target.value)} />
            </label>
          )}

          {priceScheme === 'differential' && lot.species === 'robusta' && (
            <label>Diff. (USD/t)
              <input className="border rounded px-3 py-2 w-full" value={diffRobusta} onChange={e=>setDiffRobusta(e.target.value)} />
            </label>
          )}
        </div>

        <div className="text-xs text-slate-500">
          FX USD→EUR: {fmt(prices.usd_eur)} · KC (USD/lb): {fmt(prices.kc_usd_per_lb)}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="rounded bg-slate-200 px-3 py-2 text-sm" onClick={refreshMarket}>
            Marktdaten aktualisieren
          </button>
          <button type="button" className="rounded bg-slate-800 text-white px-3 py-2 text-sm" onClick={saveEdit}>
            Speichern
          </button>
          <button type="button" className="rounded bg-emerald-600 text-white px-3 py-2 text-sm" onClick={fixCurrentPreview}>
            Aktuellen Preis festschreiben (EUR/kg)
          </button>
          <span className="text-sm">
            Aktueller Preis (Preview): <b>{livePreview != null ? new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' }).format(livePreview) + '/kg' : '—'}</b>
          </span>
        </div>
      </div>

      {/* Aufteilen */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Lot aufteilen (neues Lot erzeugen)</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label>Quelle
            <select className="border rounded px-3 py-2 w-full" value={srcWh} onChange={e=>setSrcWh(e.target.value)}>
              <option value="">— wählen —</option>
              {balances.filter(b => b.balance_kg > 0).map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_name} — {fmtKg(w.balance_kg)} kg
                </option>
              ))}
            </select>
          </label>
          <label>Ziel
            <select className="border rounded px-3 py-2 w-full" value={dstWh} onChange={e=>setDstWh(e.target.value)}>
              <option value="">— wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>Menge (kg)
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full" value={moveKg} onChange={e=>setMoveKg(e.target.value)} />
          </label>
          <label>Neue Bezeichnung (optional)
            <input className="border rounded px-3 py-2 w-full" value={newShort} onChange={e=>setNewShort(e.target.value)} />
          </label>
        </div>
        <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={doSplit}>Aufteilen</button>
      </div>

      {/* Umlagern */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Umlagern (ohne neues Lot)</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label>Quelle
            <select className="border rounded px-3 py-2 w-full" value={tSrc} onChange={e=>setTSrc(e.target.value)}>
              <option value="">— wählen —</option>
              {balances.filter(b => b.balance_kg > 0).map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_name} — {fmtKg(w.balance_kg)} kg
                </option>
              ))}
            </select>
          </label>
          <label>Ziel
            <select className="border rounded px-3 py-2 w-full" value={tDst} onChange={e=>setTDst(e.target.value)}>
              <option value="">— wählen —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>Menge (kg)
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                   value={tKg} onChange={e=>setTKg(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button className="rounded bg-slate-200 px-3 py-2 text-sm" type="button" onClick={()=>doTransfer(true)}>
              Alles umlagern
            </button>
          </div>
        </div>
        <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={()=>doTransfer(false)}>Umlagern</button>
      </div>

      {/* Karte & GeoJSON */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Karte & Plots (GeoJSON)</h3>
        <div className="flex items-center gap-3">
          <input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={onGeoJSONFile}/>
          <span className="text-xs text-slate-500">Feature/FeatureCollection; WGS84.</span>
        </div>
        <div ref={mapElRef} className="h-[460px] w-full border rounded" />
      </div>
    </div>
  )
}

function fmtKg(n: number) { return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n) }
function fmt(n: number | null) { return n == null ? '—' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(n) }
function toStr(n: number | null | undefined) { return n == null ? '' : String(n) }
function toNum(s: string) { const n = Number(s); return Number.isFinite(n) ? n : null }
