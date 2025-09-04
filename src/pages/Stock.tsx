// src/pages/Stock.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type StockRow = {
  id: string;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean | null;
  status: string | null;
  received_kg: number;
  produced_kg: number;
  balance_kg: number;
};

type DetailRow = {
  green_lot_id: string;
  warehouse_id: string;
  warehouse_name: string;
  balance_kg: number;
};

type Prices = { usd_eur: number|null; kc_usd_per_lb: number|null; rc_usd_per_ton: number|null };

type LotPrice = {
  id: string;
  species: 'arabica'|'robusta'|'other'|null;
  price_scheme: 'fixed_eur'|'fixed_usd'|'differential'|null;
  price_fixed_eur_per_kg: number|null;
  price_fixed_usd_per_lb: number|null;
  price_diff_cents_per_lb: number|null;
  price_diff_usd_per_ton: number|null;   // <— wichtig
  price_base_contract: 'kc'|'rc'|null;
};

const LB_PER_KG = 2.2046226218;

export default function Stock() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [wh, setWh] = useState<DetailRow[]>([]);
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
  const [lotPrices, setLotPrices] = useState<Record<string, LotPrice>>({});
  const [q, setQ] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    const [s, d, p, lp] = await Promise.all([
      supabase.from('v_green_stock').select('id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg').order('short_desc'),
      supabase.from('v_green_stock_detailed').select('green_lot_id, warehouse_id, warehouse_name, balance_kg'),
      fetch('/.netlify/functions/prices').then(r => r.json()).catch(() => ({})),
      supabase.from('green_lots').select(
        'id, species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_diff_usd_per_ton, price_base_contract'
      )
    ]);

    if (!s.error && s.data) setRows(s.data as StockRow[]);
    if (!d.error && d.data) setWh(d.data as DetailRow[]);
    setPrices({
      usd_eur: n(p?.usd_eur), kc_usd_per_lb: n(p?.kc_usd_per_lb), rc_usd_per_ton: n(p?.rc_usd_per_ton)
    });
    if (!lp.error && Array.isArray(lp.data)) {
      const m: Record<string, LotPrice> = {};
      for (const r of lp.data as any[]) m[r.id] = r as LotPrice;
      setLotPrices(m);
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.short_desc ?? '').toLowerCase().includes(needle) ||
      (r.origin_country ?? '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  function priceFor(lotId: string): { text: string|null; badge: 'Fix'|'Live'|null } {
    const lp = lotPrices[lotId];
    if (!lp || !lp.price_scheme) return { text: null, badge: null };

    let eurPerKg: number | null = null;
    let badge: 'Fix'|'Live' = 'Live';

    if (lp.price_scheme === 'fixed_eur') {
      eurPerKg = lp.price_fixed_eur_per_kg ?? null;
      badge = 'Fix';
    } else if (lp.price_scheme === 'fixed_usd') {
      if (lp.price_fixed_usd_per_lb != null && prices.usd_eur != null) {
        eurPerKg = lp.price_fixed_usd_per_lb * prices.usd_eur * LB_PER_KG;
        badge = 'Fix';
      }
    } else {
      const base = lp.price_base_contract ?? (lp.species === 'robusta' ? 'rc' : 'kc');
      if (base === 'kc') {
        if (prices.kc_usd_per_lb != null && prices.usd_eur != null) {
          const diffUsdPerLb = (lp.price_diff_cents_per_lb ?? 0) / 100;
          const usdPerLb = prices.kc_usd_per_lb + diffUsdPerLb;
          eurPerKg = usdPerLb * prices.usd_eur * LB_PER_KG;
        }
      } else {
        if (prices.rc_usd_per_ton != null && prices.usd_eur != null) {
          const usdPerTon = prices.rc_usd_per_ton + (lp.price_diff_usd_per_ton ?? 0);
          eurPerKg = (usdPerTon * prices.usd_eur) / 1000;
        }
      }
      badge = 'Live';
    }

    if (eurPerKg == null || !Number.isFinite(eurPerKg)) return { text: null, badge: null };
    const text = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eurPerKg) + ' €';
    return { text, badge };
  }

  function warehousesOf(id: string): string[] {
    return wh.filter(x => x.green_lot_id === id && Number(x.balance_kg) > 0)
             .map(x => `${x.warehouse_name}: ${fmtKg(x.balance_kg)} kg`);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Bestand · Rohkaffee-Lots</h2>

      <input className="border rounded px-3 py-2 w-full"
             placeholder="Suchen (Beschreibung, Herkunft)…"
             value={q} onChange={e=>setQ(e.target.value)} />

      <div className="text-xs text-slate-500">
        FX USD→EUR: {fmtMaybe(prices.usd_eur,4)} · KC (USD/lb): {fmtMaybe(prices.kc_usd_per_lb,4)} · RC (USD/t): {fmtMaybe(prices.rc_usd_per_ton,0)}
      </div>

      <table className="min-w-full text-sm">
        <thead><tr className="text-left border-b">
          <th className="py-2 pr-3">Lot</th>
          <th className="py-2 pr-3">Herkunft</th>
          <th className="py-2 pr-3">Bio</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">Lager</th>
          <th className="py-2 pr-3">Erhalten (kg)</th>
          <th className="py-2 pr-3">Produziert (kg)</th>
          <th className="py-2 pr-3">Verbleibend (kg)</th>
          <th className="py-2 pr-3">Preis (EUR/kg)</th>
        </tr></thead>
        <tbody>
        {filtered.map(r => {
          const p = priceFor(r.id);
          const whs = warehousesOf(r.id);
          return (
            <tr key={r.id} className="border-b">
              <td className="py-2 pr-3">{r.short_desc ?? '—'}</td>
              <td className="py-2 pr-3">{r.origin_country ?? '—'}</td>
              <td className="py-2 pr-3">{r.organic ? 'Ja' : '—'}</td>
              <td className="py-2 pr-3">{mapStatus(r.status)}</td>
              <td className="py-2 pr-3">
                {whs.length ? <ul className="list-disc pl-4">{whs.map((t,i)=><li key={i}>{t}</li>)}</ul> : '—'}
              </td>
              <td className="py-2 pr-3">{fmtKg(r.received_kg)}</td>
              <td className="py-2 pr-3">{fmtKg(r.produced_kg)}</td>
              <td className="py-2 pr-3">{fmtKg(r.balance_kg)}</td>
              <td className="py-2 pr-3">
                {p.text
                  ? <span className="inline-flex items-center gap-2">
                      <span className="font-medium">{p.text}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded border bg-slate-50">{p.badge}</span>
                    </span>
                  : '—'}
              </td>
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}

function n(x:any){const v=Number(x);return Number.isFinite(v)?v:null;}
function fmtKg(n:number){return new Intl.NumberFormat('de-DE',{maximumFractionDigits:3}).format(n)}
function fmtMaybe(n:number|null,d=2){return n==null?'—':new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n)}
function mapStatus(s:any){return s==='contracted'?'Kontrahiert':s==='price_fixed'?'Preis fixiert':s==='at_port'?'Im Hafen':s==='at_production_wh'?'Im Produktionslager':s==='produced'?'Produziert':s==='closed'?'Abgeschlossen':'—'}
