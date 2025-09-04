// src/pages/LotDetail.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { fetchPrices } from '@/lib/pricing'; // liefert { usd_eur, kc_usd_per_lb, rc_usd_per_ton }
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ---- Typen (schlank und defensiv) ------------------------------------------
type LotStatus =
  | 'contracted' | 'price_fixed' | 'at_port'
  | 'at_production_wh' | 'produced' | 'closed' | null;

type Species = 'arabica'|'robusta'|'other';
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null;

type Lot = {
  id: string;
  lot_no?: string | null;
  root_lot_no?: string | null;
  short_desc: string | null;
  external_contract_no: string | null;
  dds_reference: string | null;
  origin_country: string | null;
  organic: boolean;
  species: Species;
  status: LotStatus;

  price_scheme: PriceScheme;
  price_base_contract: string | null;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;   // Arabica
  price_diff_usd_per_ton: number | null;    // Robusta
};

type Wh = { id: string; name: string };
type WhBalance = { warehouse_id: string; warehouse_name: string; balance_kg: number };

type Prices = { usd_eur: number | null; kc_usd_per_lb: number | null; rc_usd_per_ton: number | null };

// ---- Hilfen -----------------------------------------------------------------
const fmtKg = (n: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n);

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);

// 1 lb in kg
const LB_TO_KG = 0.45359237;

// ---- Komponente -------------------------------------------------------------
export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // --- alle Hooks ganz oben (nie bedingt!) -----------------------------------
  const [lot, setLot] = useState<Lot | null>(null);

  // Stammdaten-Form
  const [shortDesc, setShortDesc]   = useState('');
  const [status, setStatus]         = useState<LotStatus>('contracted');
  const [ddsRef, setDdsRef]         = useState('');
  const [extNo, setExtNo]           = useState('');

  // Preis-Form
  const [priceScheme, setPriceScheme] = useState<PriceScheme>(null);
  const [baseContract, setBaseContract] = useState<string>('');
  const [fixedEur, setFixedEur] = useState<string>('');       // Eingabe (EUR/kg)
  const [fixedUsd, setFixedUsd] = useState<string>('');       // Eingabe (USD/lb)
  const [diffClb, setDiffClb]   = useState<string>('');       // Arabica (c/lb)
  const [diffUsdT, setDiffUsdT] = useState<string>('');       // Robusta (USD/t)

  // Marktpreise (FX, KC, RC)
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
  const [previewEurKg, setPreviewEurKg] = useState<number | null>(null);

  // Lager
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [balances, setBalances]     = useState<WhBalance[]>([]);

  // Leaflet
  const mapElRef     = useRef<HTMLDivElement | null>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const geoLayerRef  = useRef<L.GeoJSON | null>(null);

  // --- Daten laden -----------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    void loadAll(id);
  }, [id]);

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
    ]);

    if (!lr.error && lr.data) {
      const d = lr.data as unknown as Lot;
      setLot(d);

      // Stammdaten
      setShortDesc(d.short_desc ?? '');
      setStatus((d.status ?? 'contracted') as LotStatus);
      setDdsRef(d.dds_reference ?? '');
      setExtNo(d.external_contract_no ?? '');

      // Preise
      setPriceScheme(d.price_scheme ?? null);
      setBaseContract(d.price_base_contract ?? '');
      setFixedEur(d.price_fixed_eur_per_kg?.toString() ?? '');
      setFixedUsd(d.price_fixed_usd_per_lb?.toString() ?? '');
      setDiffClb(d.price_diff_cents_per_lb?.toString() ?? '');
      setDiffUsdT(d.price_diff_usd_per_ton?.toString() ?? '');
    }

    if (!wh.error) setWarehouses((wh.data ?? []) as Wh[]);

    if (!bal.error && Array.isArray(bal.data)) {
      const rows = (bal.data as any[]).map(r => ({
        warehouse_id: r.warehouse_id,
        warehouse_name: r.name ?? r.warehouse_name ?? 'Lager',
        balance_kg: Number(r.balance_kg ?? 0)
      }));
      setBalances(rows);
    }

    initMapOnce();
    await loadGeoJSON(lotId);
  }

  // --- Leaflet ---------------------------------------------------------------
  function initMapOnce() {
    if (mapRef.current || !mapElRef.current) return;
    const m = L.map(mapElRef.current, { center: [0,0], zoom: 2, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(m);
    const layer = L.geoJSON(undefined, {
      onEachFeature: (feat, lyr) => {
        const props = (feat.properties ?? {}) as Record<string, any>;
        const label = props.name || props.id || '';
        if (label) lyr.bindPopup(String(label));
      }
    });
    layer.addTo(m);
    mapRef.current = m;
    geoLayerRef.current = layer;
  }

  async function loadGeoJSON(lotId: string) {
    try {
      const res = await supabase.from('v_lot_plots_geojson').select('*').eq('green_lot_id', lotId);
      const features: any[] = [];
      if (!res.error && Array.isArray(res.data)) {
        for (const row of res.data as any[]) {
          const cand = row.geojson ?? row.feature ?? row.geom_geojson ?? row.geom ?? null;
          if (!cand) continue;
          const f = typeof cand === 'string' ? JSON.parse(cand) : cand;
          if (f?.type === 'Feature') features.push(f);
          else if (f?.type === 'FeatureCollection') features.push(...(f.features ?? []));
          else if (f?.type === 'Polygon' || f?.type === 'MultiPolygon') features.push({ type:'Feature', properties:{}, geometry:f });
        }
      }
      if (geoLayerRef.current) {
        geoLayerRef.current.clearLayers();
        if (features.length) {
          geoLayerRef.current.addData({ type:'FeatureCollection', features } as any);
          try { mapRef.current?.fitBounds(geoLayerRef.current.getBounds(), { maxZoom: 12, padding:[10,10] }); } catch {}
        }
      }
    } catch (e) {
      console.error(e);
    }
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

  // --- Speichern / Preise ----------------------------------------------------
  async function saveEdit() {
    if (!id) return;
    const upd = await supabase.from('green_lots').update({
      short_desc: shortDesc || null,
      status,
      dds_reference: ddsRef || null,
      external_contract_no: extNo || null,
      price_scheme: priceScheme,
      price_base_contract: baseContract || null,
      price_fixed_eur_per_kg: fixedEur ? Number(fixedEur) : null,
      price_fixed_usd_per_lb: fixedUsd ? Number(fixedUsd) : null,
      price_diff_cents_per_lb: diffClb ? Number(diffClb) : null,
      price_diff_usd_per_ton: diffUsdT ? Number(diffUsdT) : null
    }).eq('id', id);
    if (upd.error) alert(upd.error.message);
    else alert('Gespeichert.');
  }

  async function refreshMarket() {
    const p = await fetchPrices();
    setPrices(p);
    // Vorschau berechnen
    const eurkg = computePreviewEURkg(
      lot?.species ?? 'arabica',
      priceScheme,
      p,
      { fixedEur, fixedUsd, diffClb, diffUsdT }
    );
    setPreviewEurKg(eurkg);
  }

  async function fixCurrentPrice() {
    if (!id) return;
    if (previewEurKg == null || !isFinite(previewEurKg)) { alert('Kein gültiger Preis berechnet.'); return; }
    const upd = await supabase.from('green_lots').update({
      price_scheme: 'fixed_eur',
      price_fixed_eur_per_kg: previewEurKg
    }).eq('id', id);
    if (upd.error) alert(upd.error.message);
    else { setPriceScheme('fixed_eur'); setFixedEur(String(previewEurKg)); alert('Preis festgeschrieben.'); }
  }

  // --- Render ----------------------------------------------------------------
  if (!lot) return <div className="p-4">Lade…</div>;

  const priceInfo = useMemo(() => {
    const fx   = prices.usd_eur ?? 0;
    const kc   = prices.kc_usd_per_lb ?? 0;
    const rc   = prices.rc_usd_per_ton ?? 0;
    return `FX USD→EUR: ${fx.toFixed(4)} · KC (USD/lb): ${kc.toFixed(4)} · RC (USD/t): ${rc ? rc.toFixed(0) : '—'}`;
  }, [prices]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      {/* Kopfzeile mit Lot-Nummer */}
      <div className="text-sm text-slate-600">
        <span className="font-medium">Lot‑Nr.:</span> <span className="font-mono">{lot.lot_no ?? '—'}</span>
        {lot.root_lot_no ? <>
          {' · '}<span className="font-medium">Ursprung:</span> <span className="font-mono">{lot.root_lot_no}</span>
        </> : null}
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
            ? balances.map(b => `${b.warehouse_name}: ${fmtKg(b.balance_kg)} kg`).join(' · ')
            : '—'}
        </div>
        <div className="flex justify-end">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={saveEdit}>Speichern</button>
        </div>
      </div>

      {/* Preis */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Preis</h3>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Preis‑Schema
            <select className="border rounded px-3 py-2 w-full"
              value={priceScheme ?? ''}
              onChange={e=>setPriceScheme((e.target.value || null) as PriceScheme)}>
              <option value="">—</option>
              <option value="fixed_eur">Fixiert in EUR/kg</option>
              <option value="fixed_usd">Fixiert in USD/lb</option>
              <option value="differential">Differential (KC/RC)</option>
            </select>
          </label>

          {/* Nur bei Differential zeigen */}
          {priceScheme === 'differential' && (
            <label>Basis‑Kontrakt
              <select className="border rounded px-3 py-2 w-full"
                value={baseContract ?? ''}
                onChange={e=>setBaseContract(e.target.value)}>
                <option value="KC">KC (Arabica)</option>
                <option value="RC">RC (Robusta)</option>
              </select>
            </label>
          )}

          {priceScheme === 'fixed_eur' && (
            <label>EUR/kg (fix)
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                value={fixedEur} onChange={e=>setFixedEur(e.target.value)} />
            </label>
          )}

          {priceScheme === 'fixed_usd' && (
            <label>USD/lb (fix)
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                value={fixedUsd} onChange={e=>setFixedUsd(e.target.value)} />
            </label>
          )}

          {priceScheme === 'differential' && (lot.species === 'arabica'
            ? (
              <label>Diff. (c/lb, +/‑)
                <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                  value={diffClb} onChange={e=>setDiffClb(e.target.value)} />
              </label>
            ) : lot.species === 'robusta' ? (
              <label>Diff. (USD/t, +/‑)
                <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                  value={diffUsdT} onChange={e=>setDiffUsdT(e.target.value)} />
              </label>
            ) : null)
          }
        </div>

        <div className="text-xs text-slate-500">{priceInfo}</div>
        <div className="text-sm">
          <span className="text-slate-500">Aktueller Preis (Preview): </span>
          <strong>{previewEurKg != null ? fmtMoney(previewEurKg) + ' /kg' : '—'}</strong>
        </div>
        <div className="flex gap-2">
          <button className="rounded bg-slate-200 px-3 py-2 text-sm" onClick={refreshMarket}>Marktdaten aktualisieren</button>
          <button className="rounded bg-slate-800 text-white px-3 py-2 text-sm" onClick={saveEdit}>Speichern</button>
          <button className="rounded bg-emerald-600 text-white px-3 py-2 text-sm" onClick={fixCurrentPrice}>
            Aktuellen Preis festschreiben (EUR/kg)
          </button>
        </div>
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

// ---- Preis-Vorschau berechnen (einheitlich zur Stock-Seite) -----------------
function computePreviewEURkg(
  species: Species,
  scheme: PriceScheme,
  p: Prices,
  input: { fixedEur: string; fixedUsd: string; diffClb: string; diffUsdT: string }
): number | null {
  const usdEur = p.usd_eur ?? 0;
  if (!scheme) return null;

  if (scheme === 'fixed_eur') {
    const v = parseFloat(input.fixedEur);
    return isFinite(v) ? v : null;
  }
  if (scheme === 'fixed_usd') {
    const v = parseFloat(input.fixedUsd);
    if (!isFinite(v) || !usdEur) return null;
    const usdPerKg = v / LB_TO_KG;         // USD/lb -> USD/kg
    return usdPerKg * usdEur;
  }
  // differential
  if (species === 'arabica') {
    const kc = p.kc_usd_per_lb ?? 0;
    const diffC = parseFloat(input.diffClb || '0'); // c/lb
    if (!kc || !usdEur) return null;
    const usdPerLb = kc + diffC / 100;     // USD/lb
    const usdPerKg = usdPerLb / LB_TO_KG;
    return usdPerKg * usdEur;
  } else if (species === 'robusta') {
    const rc = p.rc_usd_per_ton ?? 0;
    const diffT = parseFloat(input.diffUsdT || '0'); // USD/t
    if (!rc || !usdEur) return null;
    const usdPerKg = (rc + diffT) / 1000;  // USD/t -> USD/kg
    return usdPerKg * usdEur;
  }
  return null;
}
