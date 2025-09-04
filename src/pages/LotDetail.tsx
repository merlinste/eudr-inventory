// src/pages/LotDetail.tsx
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, Geometry, GeoJsonObject } from 'geojson';

type Lot = {
  id: string;
  short_desc: string | null;
  status: 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null;
  dds_reference: string | null;
  external_contract_no: string | null;
  species: 'arabica'|'robusta'|'other'|null;

  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null;
  price_base_contract: 'kc'|'rc'|null;
  price_fixed_eur_per_kg: number|null;
  price_fixed_usd_per_lb: number|null;
  price_diff_cents_per_lb: number|null;   // KC
  price_diff_usd_per_ton: number|null;    // RC
  price_fixed_at: string|null;
};

type Wh = { id: string; name: string };
type WhBalance = { warehouse_id: string; warehouse_name: string; balance_kg: number };
type Prices = { usd_eur: number|null; kc_usd_per_lb: number|null; rc_usd_per_ton: number|null };

const LB_PER_KG = 2.2046226218;

export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lot, setLot] = useState<Lot | null>(null);

  // Stammdaten
  const [shortDesc, setShortDesc] = useState('');
  const [status, setStatus] = useState<Lot['status']>('contracted');
  const [ddsRef, setDdsRef] = useState('');
  const [extNo, setExtNo] = useState('');

  // Preis
  const [scheme, setScheme] = useState<Lot['price_scheme']>(null);
  const [base, setBase] = useState<Lot['price_base_contract']>('kc');
  const [fixEurKg, setFixEurKg] = useState<string>('');
  const [fixUsdLb, setFixUsdLb] = useState<string>('');
  const [diffCLb, setDiffCLb] = useState<string>('');       // c/lb (KC)
  const [diffUsdTon, setDiffUsdTon] = useState<string>(''); // USD/t (RC)
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });

  // Lager & Bestände
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [balances, setBalances] = useState<WhBalance[]>([]);

  // Aufteilen & Umlagern
  const [srcWh, setSrcWh] = useState('');
  const [dstWh, setDstWh] = useState('');
  const [moveKg, setMoveKg] = useState('');
  const [newShort, setNewShort] = useState('');
  const [tSrc, setTSrc] = useState('');
  const [tDst, setTDst] = useState('');
  const [tKg, setTKg] = useState('');

  // Karte
  const mapElRef = useRef<HTMLDivElement|null>(null);
  const mapRef = useRef<L.Map|null>(null);
  const geoLayerRef = useRef<L.GeoJSON|null>(null);

  useEffect(() => { if (id) void loadAll(id); }, [id]);

  async function loadAll(lotId: string) {
    const [lr, wh, bal] = await Promise.all([
      supabase.from('green_lots').select(
        'id, short_desc, status, dds_reference, external_contract_no, species, ' +
        'price_scheme, price_base_contract, price_fixed_eur_per_kg, price_fixed_usd_per_lb, ' +
        'price_diff_cents_per_lb, price_diff_usd_per_ton, price_fixed_at'
      ).eq('id', lotId).single(),
      supabase.from('v_my_warehouses').select('id,name').order('name'),
      supabase.rpc('rpc_green_lot_balances', { p_lot_id: lotId })
    ]);

    if (!lr.error && lr.data) {
      const d = lr.data as unknown as Lot;
      setLot(d);
      setShortDesc(d.short_desc ?? '');
      setStatus((d.status ?? 'contracted') as any);
      setDdsRef(d.dds_reference ?? '');
      setExtNo(d.external_contract_no ?? '');
      setNewShort(d.short_desc ? `${d.short_desc} (Teil)` : '');

      setScheme(d.price_scheme ?? null);
      setBase((d.price_base_contract ?? 'kc') as any);
      setFixEurKg(numOrEmpty(d.price_fixed_eur_per_kg));
      setFixUsdLb(numOrEmpty(d.price_fixed_usd_per_lb));
      setDiffCLb(numOrEmpty(d.price_diff_cents_per_lb));
      setDiffUsdTon(numOrEmpty(d.price_diff_usd_per_ton));
    }
    if (!wh.error) setWarehouses((wh.data ?? []) as Wh[]);

    if (!bal.error && Array.isArray(bal.data)) {
      const rows = (bal.data as any[]).map(r => ({
        warehouse_id: r.warehouse_id,
        warehouse_name: r.name ?? r.warehouse_name ?? 'Lager',
        balance_kg: Number(r.balance_kg ?? 0)
      }));
      setBalances(rows);
      const firstWithStock = rows.find(r => r.balance_kg > 0);
      if (firstWithStock) {
        setSrcWh(prev => prev || firstWithStock.warehouse_id);
        setTSrc(prev => prev || firstWithStock.warehouse_id);
      }
    }

    initMapOnce();
    await loadGeoJSON(lotId);
    await refreshPrices(); // für Preis-Preview
  }

  function initMapOnce() {
    if (mapRef.current || !mapElRef.current) return;
    const m = L.map(mapElRef.current, { center: [0,0], zoom: 2, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(m);
    const layer = L.geoJSON(undefined, {
      onEachFeature: (feat, lyr) => {
        const props = (feat.properties ?? {}) as Record<string, any>;
        const label = props.name || props.id || '';
        if (label) lyr.bindPopup(String(label));
      }
    });
    layer.addTo(m);
    mapRef.current = m; geoLayerRef.current = layer;
  }

  async function loadGeoJSON(lotId: string) {
    try {
      const res = await supabase.from('v_lot_plots_geojson').select('*').eq('green_lot_id', lotId);
      const features: Feature<Geometry, any>[] = [];
      if (!res.error && Array.isArray(res.data)) {
        for (const row of res.data as any[]) {
          const cand = row.geojson ?? row.feature ?? row.geom_geojson ?? row.geom ?? null;
          if (!cand) continue;
          const f = typeof cand === 'string' ? JSON.parse(cand) : cand;
          if (f?.type === 'Feature') features.push(f as Feature<Geometry, any>);
          else if (f?.type === 'FeatureCollection') features.push(...((f.features ?? []) as Feature<Geometry, any>[]));
          else if (f?.type === 'Polygon' || f?.type === 'MultiPolygon') features.push({ type:'Feature', properties:{}, geometry:f });
        }
      }
      if (geoLayerRef.current) {
        geoLayerRef.current.clearLayers();
        if (features.length) {
          const fc: FeatureCollection<Geometry, any> = { type:'FeatureCollection', features };
          geoLayerRef.current.addData(fc as unknown as GeoJsonObject);
          try { mapRef.current?.fitBounds(geoLayerRef.current.getBounds(), { maxZoom: 12, padding:[10,10] }); } catch {}
        }
      }
    } catch {}
  }

  async function onGeoJSONFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!id) return;
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      const res = await supabase.rpc('import_lot_geojson', { p_lot_id: id, p_geojson: parsed });
      if (res.error) throw res.error;
      await loadGeoJSON(id);
      alert(`${res.data ?? 0} Feature(s) importiert.`);
    } catch (err: any) {
      alert(err.message ?? String(err));
    } finally {
      e.target.value = '';
    }
  }

  async function refreshPrices() {
    try {
      const r = await fetch('/.netlify/functions/prices');
      const j = await r.json();
      setPrices({
        usd_eur: finite(j?.usd_eur),
        kc_usd_per_lb: finite(j?.kc_usd_per_lb),
        rc_usd_per_ton: finite(j?.rc_usd_per_ton),
      });
    } catch {
      setPrices({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
    }
  }

  async function saveEdit() {
    if (!id) return;
    const upd = await supabase.from('green_lots').update({
      short_desc: shortDesc || null,
      status,
      dds_reference: ddsRef || null,
      external_contract_no: extNo || null,

      price_scheme: scheme,
      price_base_contract: base,
      price_fixed_eur_per_kg: emptyToNull(fixEurKg),
      price_fixed_usd_per_lb: emptyToNull(fixUsdLb),
      price_diff_cents_per_lb: emptyToNull(diffCLb),
      price_diff_usd_per_ton: emptyToNull(diffUsdTon),
    }).eq('id', id);

    if (upd.error) alert(upd.error.message); else alert('Gespeichert.');
  }

  // „Festschreiben“: berechne EUR/kg als Zahl und speichere als fixierten EUR-Preis
  async function freezeCurrentPrice() {
    if (!id) return;
    const value = computeEurPerKgRaw({
      price_scheme: 'differential',
      price_base_contract: base || 'kc',
      price_fixed_eur_per_kg: null,
      price_fixed_usd_per_lb: null,
      price_diff_cents_per_lb: toNum(diffCLb) ?? 0,
      price_diff_usd_per_ton: toNum(diffUsdTon) ?? 0
    }, prices);

    if (value == null) {
      alert('Kein aktueller Preis berechenbar (Marktdaten/Differential prüfen).');
      return;
    }

    const upd = await supabase.from('green_lots').update({
      price_scheme: 'fixed_eur',
      price_fixed_eur_per_kg: value,
      price_fixed_at: new Date().toISOString()
    }).eq('id', id);

    if (upd.error) alert(upd.error.message);
    else {
      setScheme('fixed_eur');
      setFixEurKg(String(value));
      alert('Preis als EUR/kg festgeschrieben.');
    }
  }

  const sourceOptions = useMemo(() => balances.filter(b => b.balance_kg > 0), [balances]);

  async function doSplit() {
    if (!id) return;
    const kg = parseFloat(moveKg);
    if (!srcWh || !dstWh || !isFinite(kg) || kg <= 0) { alert('Bitte Quelle, Ziel und kg angeben.'); return; }
    const res = await supabase.rpc('safe_split_green_lot', {
      p_source_id: id, p_src_warehouse_id: srcWh, p_dst_warehouse_id: dstWh,
      p_move_kg: kg, p_new_short_desc: newShort || null
    });
    if (res.error) alert(res.error.message); else { alert('Lot aufgeteilt.'); navigate('/lots'); }
  }

  async function doTransfer(all = false) {
    if (!id) return;
    if (!tSrc || !tDst) { alert('Bitte Quelle & Ziel wählen.'); return; }
    if (tSrc === tDst) { alert('Quelle und Ziel müssen unterschiedlich sein.'); return; }
    const kg = all ? null : (isFinite(parseFloat(tKg)) ? parseFloat(tKg) : null);
    const res = await supabase.rpc('safe_transfer_green', {
      p_lot_id: id, p_src_warehouse_id: tSrc, p_dst_warehouse_id: tDst, p_move_kg: kg
    });
    if (res.error) alert(res.error.message); else { alert(`Umlagerung ok (${res.data} kg).`); await loadAll(id!); }
  }

  if (!lot) return <div>Lade…</div>;

  const pricePreview = computeEurPerKgFormatted({
    price_scheme: scheme,
    price_base_contract: base,
    price_fixed_eur_per_kg: toNum(fixEurKg),
    price_fixed_usd_per_lb: toNum(fixUsdLb),
    price_diff_cents_per_lb: toNum(diffCLb),
    price_diff_usd_per_ton: toNum(diffUsdTon)
  }, prices);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      {/* Stammdaten */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Stammdaten bearbeiten</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Kurzbeschreibung
            <input className="border rounded px-3 py-2 w-full" value={shortDesc} onChange={e=>setShortDesc(e.target.value)} />
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full" value={status ?? 'contracted'} onChange={e=>setStatus(e.target.value as any)}>
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
            ? balances.map(b => `${b.warehouse_name}: ${fmtKg(b.balance_kg)} kg`).join(' · ')
            : '—'}
        </div>
      </div>

      {/* Preis */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Preis</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Preis‑Schema
            <select className="border rounded px-3 py-2 w-full" value={scheme ?? ''} onChange={e=>setScheme((e.target.value || null) as any)}>
              <option value="">— wählen —</option>
              <option value="fixed_eur">Fixiert in EUR/kg</option>
              <option value="fixed_usd">Fixiert in USD/lb</option>
              <option value="differential">Differential (KC/RC)</option>
            </select>
          </label>

          {scheme === 'differential' && (
            <label>Basis‑Kontrakt
              <select className="border rounded px-3 py-2 w-full" value={base ?? 'kc'} onChange={e=>setBase(e.target.value as any)}>
                <option value="kc">KC (Arabica)</option>
                <option value="rc">RC (Robusta)</option>
              </select>
            </label>
          )}

          {scheme === 'fixed_eur' && (
            <label>Fixpreis EUR/kg
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                     value={fixEurKg} onChange={e=>setFixEurKg(e.target.value)} />
            </label>
          )}

          {scheme === 'fixed_usd' && (
            <label>Fixpreis USD/lb
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                     value={fixUsdLb} onChange={e=>setFixUsdLb(e.target.value)} />
            </label>
          )}

          {scheme === 'differential' && base === 'kc' && (
            <label>Differential (c/lb, ±)
              <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                     value={diffCLb} onChange={e=>setDiffCLb(e.target.value)} />
            </label>
          )}

          {scheme === 'differential' && base === 'rc' && (
            <label>Differential (USD/t, ±)
              <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                     value={diffUsdTon} onChange={e=>setDiffUsdTon(e.target.value)} />
            </label>
          )}
        </div>

        <div className="text-xs text-slate-500">
          FX USD→EUR: {fmtMaybe(prices.usd_eur, 4, '—')} · KC: {fmtMaybe(prices.kc_usd_per_lb, 4, '—')} USD/lb · RC: {fmtMaybe(prices.rc_usd_per_ton, 0, '—')} USD/t
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-slate-600">Aktueller Preis (Preview): </span>
            <span className="font-medium">{pricePreview ? `${pricePreview} EUR/kg` : '—'}</span>
            {lot?.price_fixed_at ? (
              <span className="ml-2 text-slate-500">· fixiert am {new Date(lot.price_fixed_at).toLocaleString('de-DE')}</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-slate-200 px-3 py-2 text-sm" type="button" onClick={refreshPrices}>
              Marktdaten aktualisieren
            </button>
            <button className="rounded bg-slate-800 text-white px-3 py-2 text-sm" type="button" onClick={saveEdit}>
              Speichern
            </button>
            <button className="rounded bg-emerald-600 text-white px-3 py-2 text-sm" type="button" onClick={freezeCurrentPrice}>
              Aktuellen Preis festschreiben (EUR/kg)
            </button>
          </div>
        </div>
      </div>

      {/* Aufteilen */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Lot aufteilen (neues Lot erzeugen)</h3>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <label>Quelle
            <select className="border rounded px-3 py-2 w-full" value={srcWh} onChange={e=>setSrcWh(e.target.value)}>
              <option value="">— wählen —</option>
              {sourceOptions.map(w => (
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
              {sourceOptions.map(w => (
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

      {/* Karte + GeoJSON Upload */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Karte & Plots (GeoJSON)</h3>
        <div className="flex items-center gap-3">
          <input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={onGeoJSONFile}/>
          <span className="text-xs text-slate-500">Feature/FeatureCollection; WGS84.</span>
        </div>
        <div ref={mapElRef} className="h-[460px] w-full border rounded" />
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function finite(x: any): number|null { const n = Number(x); return Number.isFinite(n) ? n : null; }
function toNum(v: any): number | null { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? Number(n) : null; }
function numOrEmpty(n: number|null|undefined) { return n == null ? '' : String(n); }
function emptyToNull(s: string) { return s.trim() === '' ? null : Number(s); }
function fmtKg(n: number | null | undefined) { const v = Number(n ?? 0); return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(v); }
function fmtMaybe(n: number | null, digits = 2, dash = '—') {
  if (n == null || !Number.isFinite(n)) return dash;
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

// helper/contractMonths.ts
export type ContractChoice = { code: string; label: string; monthDate: string }; // YYYY-MM-01

const monthCode = (m: number) => ['','F','G','H','J','K','M','N','Q','U','V','X','Z'][m]; // 1..12
const allowed = {
  kc: [3,5,7,9,12],          // H K N U Z
  rc: [1,3,5,7,9,11],        // F H K N U X
};

export function nextContracts(base: 'kc'|'rc', count = 8): ContractChoice[] {
  const today = new Date();
  let y = today.getUTCFullYear(), m = today.getUTCMonth()+1;
  const out: ContractChoice[] = [];
  while (out.length < count) {
    m++;
    if (m > 12) { m = 1; y++; }
    if (!allowed[base].includes(m)) continue;
    const code = (base === 'kc' ? 'KC' : 'RC') + monthCode(m) + String(y).slice(-1);
    const label = `${String(m).padStart(2,'0')}/${y} (${code})`;
    out.push({ code, label, monthDate: `${y}-${String(m).padStart(2,'0')}-01` });
  }
  return out;
}

// Rohwert (Zahl) berechnen
function computeEurPerKgRaw(lp: {
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null|undefined;
  price_base_contract: 'kc'|'rc'|null|undefined;
  price_fixed_eur_per_kg: number|null|undefined;
  price_fixed_usd_per_lb: number|null|undefined;
  price_diff_cents_per_lb: number|null|undefined;
  price_diff_usd_per_ton: number|null|undefined;
}, px: Prices): number | null {
  if (!lp?.price_scheme) return null;
  let eurPerKg: number | null = null;

  if (lp.price_scheme === 'fixed_eur') eurPerKg = lp.price_fixed_eur_per_kg ?? null;

  if (lp.price_scheme === 'fixed_usd') {
    if (lp.price_fixed_usd_per_lb != null && px.usd_eur != null) {
      const eurPerLb = lp.price_fixed_usd_per_lb * px.usd_eur;
      eurPerKg = eurPerLb * LB_PER_KG;
    }
  }

  if (lp.price_scheme === 'differential') {
    const base = lp.price_base_contract ?? 'kc';
    if (base === 'kc') {
      if (px.kc_usd_per_lb != null && px.usd_eur != null) {
        const diffUsdPerLb = (lp.price_diff_cents_per_lb ?? 0) / 100;
        const usdPerLb = px.kc_usd_per_lb + diffUsdPerLb;
        eurPerKg = usdPerLb * px.usd_eur * LB_PER_KG;
      }
    } else {
      if (px.rc_usd_per_ton != null && px.usd_eur != null) {
        const usdPerTon = px.rc_usd_per_ton + (lp.price_diff_usd_per_ton ?? 0);
        const eurPerTon = usdPerTon * px.usd_eur;
        eurPerKg = eurPerTon / 1000;
      }
    }
  }
  return Number.isFinite(eurPerKg) ? eurPerKg! : null;
}

// Formatierte Anzeige
function computeEurPerKgFormatted(lp: any, px: Prices): string | null {
  const v = computeEurPerKgRaw(lp, px);
  if (v == null) return null;
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
