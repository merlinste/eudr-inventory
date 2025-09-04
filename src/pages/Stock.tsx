import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Prices = {
  usd_eur: number | null;        // USD -> EUR
  kc_usd_per_lb: number | null;  // Arabica (KC) USD/lb
  rc_usd_per_ton: number | null; // Robusta (RC) USD/ton
};

type StockRow = {
  id: string;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean | null;
  status: string | null;
  received_kg: number;
  produced_kg: number;
  balance_kg: number;
  // org_id kann vorhanden sein, muss aber nicht
  org_id?: string | null;
};

type WhRow = {
  green_lot_id: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  balance_kg: number;
  org_id?: string | null;
};

type LotPrice = {
  id: string;
  species: 'arabica' | 'robusta' | 'other' | null;
  price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
  price_diff_usd_per_ton: number | null;
  price_base_contract: 'kc' | 'rc' | null;
};

export default function Stock() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [rows, setRows] = useState<StockRow[]>([]);
  const [wh, setWh] = useState<WhRow[]>([]);
  const [lotPrices, setLotPrices] = useState<Record<string, LotPrice>>({});

  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
  const [search, setSearch] = useState('');

  // 1) org_id aus profiles holen
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const prof = await supabase.from('profiles').select('org_id').eq('user_id', uid).single();
      if (!prof.error) setOrgId(prof.data?.org_id ?? null);
    })();
  }, []);

  // 2) Daten laden (getrennte Abfragen; Fallback ohne org_id)
  useEffect(() => {
    (async () => {
      setLoading(true);

      // --- v_green_stock
      const colsWithOrg =
        'id, org_id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg';
      const colsNoOrg =
        'id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg';

      const tryWithOrg = await supabase
        .from('v_green_stock')
        .select(colsWithOrg)
        .order('short_desc', { ascending: true });

      let stockData: any[] = [];
      if (tryWithOrg.error && /org_id|column .* does not exist/i.test(tryWithOrg.error.message || '')) {
        const tryNoOrg = await supabase
          .from('v_green_stock')
          .select(colsNoOrg)
          .order('short_desc', { ascending: true });
        if (!tryNoOrg.error) stockData = tryNoOrg.data ?? [];
      } else if (!tryWithOrg.error) {
        stockData = tryWithOrg.data ?? [];
        if (orgId) stockData = stockData.filter((r: any) => r.org_id === orgId);
      }

      // --- v_green_stock_detailed
      const whColsWithOrg = 'green_lot_id, warehouse_id, warehouse_name, balance_kg, org_id';
      const whColsNoOrg = 'green_lot_id, warehouse_id, warehouse_name, balance_kg';

      const whWithOrg = await supabase
        .from('v_green_stock_detailed')
        .select(whColsWithOrg)
        .order('warehouse_name', { ascending: true });

      let whData: any[] = [];
      if (whWithOrg.error && /org_id|column .* does not exist/i.test(whWithOrg.error.message || '')) {
        const whNoOrg = await supabase
          .from('v_green_stock_detailed')
          .select(whColsNoOrg)
          .order('warehouse_name', { ascending: true });
        if (!whNoOrg.error) whData = whNoOrg.data ?? [];
      } else if (!whWithOrg.error) {
        whData = whWithOrg.data ?? [];
        if (orgId) whData = whData.filter((r: any) => r.org_id === orgId);
      }

      // --- Preise direkt aus green_lots
      const priceRes = await supabase
        .from('green_lots')
        .select(
          'id, species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_diff_usd_per_ton, price_base_contract'
        );

      setRows((stockData ?? []) as StockRow[]);
      setWh((whData ?? []) as WhRow[]);
      if (!priceRes.error) {
        const mp: Record<string, LotPrice> = {};
        for (const r of (priceRes.data ?? []) as any[]) {
          mp[r.id] = {
            id: r.id,
            species: r.species ?? null,
            price_scheme: r.price_scheme ?? null,
            price_fixed_eur_per_kg: toNum(r.price_fixed_eur_per_kg),
            price_fixed_usd_per_lb: toNum(r.price_fixed_usd_per_lb),
            price_diff_cents_per_lb: toNum(r.price_diff_cents_per_lb),
            price_base_contract: r.price_base_contract ?? null,
          };
        }
        setLotPrices(mp);
      }

      setLoading(false);
    })();
  }, [orgId]);

  // 3) Preise via Proxy
  async function refreshPrices() {
    try {
      const res = await fetch('/.netlify/functions/prices', { method: 'GET' });
      const j = await res.json();
      setPrices({
        usd_eur: toNum(j?.usd_eur),
        kc_usd_per_lb: toNum(j?.kc_usd_per_lb),
        rc_usd_per_ton: toNum(j?.rc_usd_per_ton),
      });
    } catch {
      setPrices({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
    }
  }

  // 4) Darstellung
  const whByLot = useMemo(() => {
    const m = new Map<string, WhRow[]>();
    for (const r of wh) {
      if (!m.has(r.green_lot_id)) m.set(r.green_lot_id, []);
      m.get(r.green_lot_id)!.push(r);
    }
    return m;
  }, [wh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const s = (r.short_desc ?? '') + ' ' + (r.origin_country ?? '') + ' ' + (r.status ?? '');
      return s.toLowerCase().includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Bestand · Rohkaffee-Lots</h2>

      <div className="flex items-center justify-between gap-3">
        <input
          className="border rounded px-3 py-2 w-full max-w-xl"
          placeholder="Suchen (Beschreibung, Herkunft)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={refreshPrices} className="rounded bg-slate-800 text-white px-3 py-2 text-sm">
          Preise aktualisieren
        </button>
      </div>

      <div className="text-xs text-slate-500">
        FX USD→EUR: {fmtMaybe(prices.usd_eur, 4, '—')} · KC (USD/lb): {fmtMaybe(prices.kc_usd_per_lb, 4, '—')} · RC (USD/t):{' '}
        {fmtMaybe(prices.rc_usd_per_ton, 0, '—')}
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="px-3 py-2">Lot</th>
              <th className="px-3 py-2">Herkunft</th>
              <th className="px-3 py-2">Bio</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Lager</th>
              <th className="px-3 py-2 text-right">Erhalten (kg)</th>
              <th className="px-3 py-2 text-right">Produziert (kg)</th>
              <th className="px-3 py-2 text-right">Verbleibend (kg)</th>
              <th className="px-3 py-2 text-right">Preis (EUR/kg)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={9}>
                  Lädt…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={9}>
                  Keine Lots gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const lotsWh = whByLot.get(r.id) ?? [];
                const p = lotPrices[r.id];
                const eurPerKg = computeEurPerKg(p, prices);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.short_desc ?? '—'}</td>
                    <td className="px-3 py-2">{r.origin_country ?? '—'}</td>
                    <td className="px-3 py-2">{r.organic ? 'Ja' : '—'}</td>
                    <td className="px-3 py-2">{mapStatus(r.status)}</td>
                    <td className="px-3 py-2">
                      {lotsWh.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="list-disc pl-5">
                          {lotsWh.map((w) => (
                            <li key={(w.warehouse_id ?? '') + w.warehouse_name}>
                              {(w.warehouse_name ?? 'Lager') + ': ' + fmtKg(w.balance_kg)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtKg(r.received_kg)}</td>
                    <td className="px-3 py-2 text-right">{fmtKg(r.produced_kg)}</td>
                    <td className="px-3 py-2 text-right">{fmtKg(r.balance_kg)}</td>
                    <td className="px-3 py-2 text-right">{eurPerKg ?? '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function toNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? Number(n) : null;
}

function fmtKg(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(v);
}

function fmtMaybe(n: number | null, digits = 2, dash = '—') {
  if (n == null || !Number.isFinite(n)) return dash;
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

function mapStatus(s: string | null) {
  switch (s) {
    case 'contracted':
      return 'Kontrahiert';
    case 'price_fixed':
      return 'Preis fixiert';
    case 'at_port':
      return 'Im Hafen';
    case 'at_production_wh':
      return 'Im Produktionslager';
    case 'produced':
      return 'Produziert';
    case 'closed':
      return 'Abgeschlossen';
    default:
      return '—';
  }
}

function computeEurPerKg(lp: LotPrice | undefined, px: Prices): string | null {
  if (!lp || !lp.price_scheme) return null;

  const LB_PER_KG = 2.2046226218;

  let eurPerKg: number | null = null;

  if (lp.price_scheme === 'fixed_eur') eurPerKg = lp.price_fixed_eur_per_kg ?? null;

  if (lp.price_scheme === 'fixed_usd' && lp.price_fixed_usd_per_lb != null && px.usd_eur != null) {
    const eurPerLb = lp.price_fixed_usd_per_lb * px.usd_eur;
    eurPerKg = eurPerLb * LB_PER_KG;
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
        const eurPerTon = (px.rc_usd_per_ton + (lp.price_diff_usd_per_ton ?? 0)) * px.usd_eur;
        eurPerKg = eurPerTon / 1000;
      }
    }
  }

  if (eurPerKg == null || !Number.isFinite(eurPerKg)) return null;
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eurPerKg);
}
