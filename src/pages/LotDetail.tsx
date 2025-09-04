// src/pages/LotDetail.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, GeoJsonObject, Geometry } from 'geojson';
import { Prices, fetchPrices, calcEurPerKgForLot, fmtEurPerKg } from '@/lib/pricing';

type Species = 'arabica'|'robusta'|'other';
type LotStatus = 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null;
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null;

type Lot = {
  id: string;
  lot_no?: string | null;
  root_lot_no?: string | null;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean;
  species: Species;
  status: LotStatus;
  dds_reference?: string | null;
  external_contract_no?: string | null;

  price_scheme: PriceScheme;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
  price_diff_usd_per_ton: number | null;
};

type Wh = { id: string; name: string };
type WhBalance = { warehouse_id: string; warehouse_name: string; balance_kg: number };

export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Stammdaten
  const [lot, setLot] = useState<Lot | null>(null);
  const [shortDesc, setShortDesc] = useState('');
  const [status, setStatus] = useState<LotStatus>('contracted');
  const [ddsRef, setDdsRef] = useState('');
  const [extNo, setExtNo] = useState('');

  // Preise
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });

  // Lager & Bestände
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [balances, setBalances] = useState<WhBalance[]>([]);

  // Aufteilen (neues Lot)
  const [srcWh, setSrcWh] = useState('');
  const [dstWh, setDstWh] = useState('');
  const [moveKg, setMoveKg] = useState('');
  const [newShort, setNewShort] = useState('');

  // Umlagern
  const [tSrc, setTSrc] = useState('');
  const [tDst, setTDst] = useState('');
  const [tKg, setTKg] = useState('');

  // Karte
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const [areaHa, setAreaHa] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    void loadAll(id);
  }, [id]);

  async function loadAll(lotId: string) {
    const [lr, wh, bal, p] = await Promise.all([
      supabase
        .from('green_lots')
        .select(
          `id, lot_no, root_lot_no, short_desc, status, dds_reference, external_contract_no,
           species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
           price_diff_cents_per_lb, price_diff_usd_per_ton`
        )
        .eq('id', lotId)
        .single(),
      supabase.from('v_my_warehouses').select('id,name').order('name'),
      supabase.rpc('rpc_green_lot_balances', { p_lot_id: lotId }),
      fetchPrices(),
    ]);

    if (!lr.error && lr.data) {
      const L = lr.data as Lot;
      setLot(L);
      setShortDesc(L.short_desc ?? '');
      setStatus((L.status ?? 'contracted') as LotStatus);
      setDdsRef(L.dds_reference ?? '');
      setExtNo(L.external_contract_no ?? '');
      setNewShort(L.short_desc ? `${L.short_desc} (Teil)` : '');
    }
    if (!wh.error) setWarehouses((wh.data ?? []) as Wh[]);

    if (!bal.error && Array.isArray(bal.data)) {
      const rows = (bal.data as any[]).map(r => ({
        warehouse_id: r.warehouse_id as string,
        warehouse_name: (r.name ?? r.warehouse_name ?? 'Lager') as string,
        balance_kg: Number(r.balance_kg ?? 0),
      }));
      setBalances(rows);
      const firstWithStock = rows.find(r => r.balance_kg > 0);
      if (firstWithStock) {
        setSrcWh(prev => prev || firstWithStock.warehouse_id);
        setTSrc(prev => prev || firstWithStock.warehouse_id);
      }
    }

    setPrices(p);

    initMapOnce();
    await loadGeoJSON(lotId);
    await refreshAreaServer(lotId);
  }

  function initMapOnce() {
    if (mapRef.current || !mapElRef.current) return;
    const m = L.map(mapElRef.current, { center: [0, 0], zoom: 2, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
    }).addTo(m);
    const layer = L.geoJSON(undefined, {
      onEachFeature: (feat, lyr) => {
        const props = (feat.properties ?? {}) as Record<string, any>;
        const label = props.name || props.id || '';
        if (label) lyr.bindPopup(String(label));
      },
    });
    layer.addTo(m);
    mapRef.current = m;
    geoLayerRef.current = layer;
  }

  async function loadGeoJSON(lotId: string) {
    try {
      const res = await supabase
        .from('v_lot_plots_geojson')
        .select('*')
        .eq('green_lot_id', lotId);
      const features: Feature<Geometry, any>[] = [];
      if (!res.error && Array.isArray(res.data)) {
        for (const row of res.data as any[]) {
          const cand = row.geojson ?? row.feature ?? row.geom_geojson ?? row.geom ?? null;
          if (!cand) continue;
          const f = typeof cand === 'string' ? JSON.parse(cand) : cand;
          if (f?.type === 'Feature') features.push(f as Feature<Geometry, any>);
          else if (f?.type === 'FeatureCollection') features.push(...((f.features ?? []) as Feature<Geometry, any>[]));
          else if (f?.type === 'Polygon' || f?.type === 'MultiPolygon')
            features.push({ type: 'Feature', properties: {}, geometry: f });
        }
      }
      if (geoLayerRef.current) {
        geoLayerRef.current.clearLayers();
        if (features.length) {
          const fc: FeatureCollection<Geometry, any> = { type: 'FeatureCollection', features };
          geoLayerRef.current.addData(fc as unknown as GeoJsonObject);
          try {
            mapRef.current?.fitBounds(geoLayerRef.current.getBounds(), { maxZoom: 12, padding: [10, 10] });
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Preis-Vorschau
  const previewEurKg = useMemo(() => {
    if (!lot) return null;
    return calcEurPerKgForLot(prices, {
      species: lot.species,
      scheme: lot.price_scheme,
      fixed_eur_per_kg: lot.price_fixed_eur_per_kg,
      fixed_usd_per_lb: lot.price_fixed_usd_per_lb,
      diff_cents_per_lb: lot.price_diff_cents_per_lb,
      diff_usd_per_ton: lot.price_diff_usd_per_ton,
    });
  }, [lot, prices]);

  async function refreshMarket() {
    const p = await fetchPrices();
    setPrices(p);
  }

  // ---- Stammdaten speichern
  async function saveEdit() {
    if (!id) return;
    const upd = await supabase
      .from('green_lots')
      .update({
        short_desc: shortDesc || null,
        status,
        dds_reference: ddsRef || null,
        external_contract_no: extNo || null,
      })
      .eq('id', id);
    if (upd.error) alert(upd.error.message);
    else alert('Gespeichert.');
  }

  // ---- Split und Umlagern
  const sourceOptions = useMemo(() => balances.filter(b => b.balance_kg > 0), [balances]);

  async function doSplit() {
    if (!id) return;
    const kg = parseFloat(moveKg);
    if (!srcWh || !dstWh || !isFinite(kg) || kg <= 0) { alert('Bitte Quelle, Ziel und kg angeben.'); return; }
    const res = await supabase.rpc('safe_split_green_lot', {
      p_source_id: id, p_src_warehouse_id: srcWh, p_dst_warehouse_id: dstWh,
      p_move_kg: kg, p_new_short_desc: newShort || null,
    });
    if (res.error) alert(res.error.message);
    else { alert('Lot aufgeteilt.'); navigate('/lots'); }
  }

  async function doTransfer(all = false) {
    if (!id) return;
    if (!tSrc || !tDst) { alert('Bitte Quelle & Ziel wählen.'); return; }
    if (tSrc === tDst) { alert('Quelle und Ziel müssen unterschiedlich sein.'); return; }
    const kg = all ? null : (isFinite(parseFloat(tKg)) ? parseFloat(tKg) : null);
    const res = await supabase.rpc('safe_transfer_green', {
      p_lot_id: id, p_src_warehouse_id: tSrc, p_dst_warehouse_id: tDst, p_move_kg: kg,
    });
    if (res.error) alert(res.error.message);
    else { alert(`Umlagerung ok (${res.data} kg).`); await loadAll(id!); }
  }

  // ---- GeoJSON Upload + Fläche
  async function onGeoJSONFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!id) return;
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const res = await supabase.rpc('import_lot_geojson', { p_lot_id: id, p_geojson: parsed });
      if (res.error) throw res.error;
      await loadGeoJSON(id);
      await refreshAreaServer(id);
      alert(`${res.data ?? 0} Feature(s) importiert.`);
    } catch (err: any) {
      // Fallback: lokal anzeigen, Fläche lokal berechnen
      try {
        const parsed = JSON.parse(await (await f.text()).toString());
        drawLocal(parsed);
        const ha = areaHaLocal(parsed);
        setAreaHa(ha);
        alert((err?.message ?? String(err)) + '\nGeoJSON lokal dargestellt (Fläche *ungefähre* Berechnung).');
      } catch {}
    } finally { e.target.value = ''; }
  }

  function drawLocal(geojson: any) {
    if (!geoLayerRef.current) return;
    geoLayerRef.current.clearLayers();
    const toAdd: FeatureCollection<Geometry, any> =
      geojson?.type === 'FeatureCollection'
        ? geojson
        : geojson?.type === 'Feature'
        ? { type: 'FeatureCollection', features: [geojson] }
        : { type: 'FeatureCollection', features: [] };
    geoLayerRef.current.addData(toAdd as unknown as GeoJsonObject);
    try { mapRef.current?.fitBounds(geoLayerRef.current.getBounds(), { maxZoom: 12, padding: [10,10] }); } catch {}
  }

  async function refreshAreaServer(lotId: string) {
    try {
      const r = await supabase.rpc('lot_plots_area_ha', { p_lot_id: lotId });
      if (!r.error && typeof r.data === 'number') {
        setAreaHa(r.data);
        return;
      }
    } catch {}
    // Serverfunktion nicht vorhanden → nicht stören
  }

  // einfache geodätische Flächen-Approximation (Fallback)
  function areaHaLocal(gj: any): number | null {
    const fc: FeatureCollection = gj?.type === 'FeatureCollection'
      ? gj
      : gj?.type === 'Feature'
      ? { type: 'FeatureCollection', features: [gj] }
      : { type: 'FeatureCollection', features: [] };

    let sum = 0;
    for (const f of fc.features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') sum += polygonArea(g.coordinates);
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) sum += polygonArea(poly);
    }
    // m² → ha
    return sum > 0 ? Math.round((sum / 10000) * 100) / 100 : null;

    function polygonArea(rings: number[][][]) {
      // äußeren Ring – Löcher abziehen
      let area = 0;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const a = Math.abs(ringArea(ring));
        area += i === 0 ? a : -a;
      }
      return area;
    }
    function ringArea(coords: number[][]) {
      // Algorithmus nach Turf.js (sphärische Fläche), Lizenz-kompatibel sinngemäß nachimplementiert
      const R = 6378137; // Erdradius
      let sum = 0;
      if (coords.length < 3) return 0;
      for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i].map(rad);
        const [lon2, lat2] = coords[i + 1].map(rad);
        sum += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
      }
      return Math.abs(sum * (R * R) / 2);
      function rad(d: number) { return (d * Math.PI) / 180; }
    }
  }

  // ---- UI ----
  if (!lot) return <div className="p-3">Lade…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      {/* Meta */}
      <div className="text-sm text-slate-600">
        <span className="font-medium">Lot‑Nr.:</span> <span className="font-mono">{lot.lot_no ?? '—'}</span>
        {' · '}
        <span className="font-medium">Ursprung:</span> <span className="font-mono">{lot.root_lot_no ?? '—'}</span>
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
          {balances.length
            ? balances.map(b => `${b.warehouse_name}: ${fmtInt(b.balance_kg)} kg`).join(' · ')
            : '—'}
        </div>
        <div className="flex justify-end">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={saveEdit}>Speichern</button>
        </div>
      </div>

      {/* Preis-Vorschau */}
      <div className="border rounded p-4 space-y-2">
        <h3 className="font-medium">Preis</h3>
        <div className="text-sm text-slate-600">
          FX USD→EUR: {prices.usd_eur ?? '—'} · KC (USD/lb): {prices.kc_usd_per_lb ?? '—'} · RC (USD/t): {prices.rc_usd_per_ton ?? '—'}
        </div>
        <div className="text-sm">
          Aktueller Preis (Preview): <span className="font-semibold">{fmtEurPerKg(previewEurKg)} EUR/kg</span>
        </div>
        <div>
          <button className="px-3 py-2 rounded bg-slate-200 text-sm" onClick={refreshMarket}>Marktdaten aktualisieren</button>
        </div>
      </div>

      {/* Aufteilen (neues Lot) */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Lot aufteilen (neues Lot erzeugen)</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label>Quelle
            <select className="border rounded px-3 py-2 w-full" value={srcWh} onChange={e=>setSrcWh(e.target.value)}>
              <option value="">— wählen —</option>
              {sourceOptions.map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_name} — {fmtInt(w.balance_kg)} kg
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
              {sourceOptions.map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_name} — {fmtInt(w.balance_kg)} kg
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
            <input type="number" step="0.01" className="border rounded px-3 py-2 w-full" value={tKg} onChange={e=>setTKg(e.target.value)} />
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
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Karte & Plots (GeoJSON)</h3>
          <div className="text-sm text-slate-600">
            {areaHa != null ? <>Gesamtfläche: <span className="font-semibold">{areaHa.toLocaleString('de-DE', { maximumFractionDigits: 2 })}</span> ha</> : '—'}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={onGeoJSONFile}/>
          <span className="text-xs text-slate-500">Feature/FeatureCollection; Koordinaten in WGS84.</span>
          <button className="px-3 py-2 rounded bg-slate-200 text-sm" onClick={()=>id && loadGeoJSON(id)}>
            Neu laden
          </button>
        </div>
        <div ref={mapElRef} className="h-[460px] w-full border rounded" />
      </div>
    </div>
  );
}

// ------- kleine Helfer -------
function fmtInt(n: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
}
