import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Prices = {
  usd_eur: number | null;         // USD -> EUR (z.B. 0.8589)
  kc_usd_per_lb: number | null;   // Arabica (ICE KC), USD/lb
  rc_usd_per_ton: number | null;  // Robusta (ICE RC), USD/metric ton
};

type StockRow = {
  id: string;
  org_id?: string;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean | null;
  status: string | null;
  received_kg: number;
  produced_kg: number;
  balance_kg: number;
};

type WhRow = {
  green_lot_id: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  balance_kg: number;
};

type LotPrice = {
  id: string;
  species: 'arabica' | 'robusta' | 'other' | null;
  price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
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

  // 2) Daten laden (mit Fallback, wenn die Views keine org_id-Spalte haben)
  useEffect(() => {
    (async () => {
      setLoading(true);

      // --- v_green_stock
      const selectColsWithOrg =
        'id, org_id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg';
      const selectColsNoOrg =
        'id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg';

      let stockRes = await supabase
        .from('v_green_stock')
        .select(selectColsWithOrg)
        .order('short_desc', { ascending: true });

      // Falls Spalte org_id nicht existiert, neu ohne org_id laden
      if (stockRes.error && /org_id/i.test(stockRes.error.message || '')) {
        stockRes = await supabase
          .from('v_green_stock')
          .select(selectColsNoOrg)
          .order('short_desc', { ascending: true });
      } else if (!stockRes.error && orgId) {
        // Wenn org_id existiert, clientseitig filtern (zur Sicherheit; RLS filtert ohnehin)
        stockRes.data = (stockRes.data ?? []).filter((r: any) => r.org_id === orgId);
      }

      // --- v_green_stock_detailed
      const whWithOrg = 'green_lot_id, warehouse_id, warehouse_name, balance_kg, org_id';
      const whNoOrg = 'green_lot_id, warehouse_id, warehouse_name, balance_kg';

      let whRes = await supabase
        .from('v_green_stock_detailed')
        .select(whWithOrg)
        .order('warehouse_name', { ascending: true });

      if (whRes.error && /org_id/i.test(whRes.error.message || '')) {
        whRes = await supabase
          .from('v_green_stock_detailed')
          .select(whNoOrg)
          .order('warehouse_name', { ascending: true });
      } else if (!whRes.error && orgId) {
        whRes.data = (whRes.data ?? []).filter((r: any) => (r as any).org_id === orgId);
      }

      // --- Preisfelder direkt aus green_lots ziehen und nach id mappen
      const priceRes = await supabase
        .from('green_lots')
        .select(
          'id, species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_base_contract'
        );

      if (!stockRes.error) setRows((stockRes.data ?? []) as StockRow[]);
      if (!whRes.error) setWh((whRes.data ?? []) as WhRow[]);
      if (!priceRes.error) {
        const mp: Record<string, LotPrice> = {};
        for (const r of (priceRes.data ?? []) as any[]) {
          mp[r.id] = {
            id: r.id,
            species: r.species ?? null,
            price_scheme: r.price_scheme ?? null,
            price_fixed_eur_per_kg: numOrNull(r.price_fixed_eur_per_kg),
            price_fixed_usd_per_lb: numOrNull(r.price_fixed_usd_per_lb),
            price_diff_cents_per_lb: numOrNull(r.price_diff_cents_per_lb),
            price_base_contract: r.price_base_contract ?? null,
          };
        }
        setLotPrices(mp);
      }

      setLoading(false);
    })();
  }, [orgId]);

  // 3) Preise laden (Proxy-Funktion)
  async function refreshPrices() {
    try {
      const res = await fetch('/.netlify/functions/prices', { method: 'GET' });
      if (!res.ok) throw new Error('Price proxy error');
      const j = await res.json();
      setPrices({
        usd_eur: numOrNull(j?.usd_eur),
        kc_usd_per_lb: numOrNull(j?.kc_usd_per_lb),
        rc_usd_per_ton: numOrNull(j?.rc_usd_per_ton),
      });
    } catch {
      setPrices({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });
    }
  }

  // 4) aufbereitete Ansicht
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
    const base = rows;
    if (!q) return base;
    return base.filter((r) => {
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
        FX USD→EUR: {fmtMaybe(prices.usd_eur, 4, '—')} · KC (USD/lb): {fmtMaybe(prices.kc_usd_per_lb, 4, '—')} · RC
        (USD/t): {fmtMaybe(prices.rc_usd_per_ton, 0, '—')}
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

function numOrNull(x: any): number | null {
  const n = typeof x === 'string' ? Number(x) : x;
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

/**
 * Preisberechnung in EUR/kg:
 * - fixed_eur: nimmt price_fixed_eur_per_kg
 * - fixed_usd: USD/lb -> EUR/kg (USD→EUR via usd_eur)
 * - differential: KC + Diff (c/lb) -> USD/lb, danach EUR/kg
 * - RC (Robusta): USD/ton -> EUR/kg; Differential (falls c/lb gesetzt) wird optional addiert
 */
function computeEurPerKg(lp: LotPrice | undefined, px: Prices): string | null {
  if (!lp || !lp.price_scheme) return null;

  // Sicherheiten:
  const usdToEur = px.usd_eur ?? null;
  const LB_PER_KG = 2.2046226218;

  let eurPerKg: number | null = null;

  if (lp.price_scheme === 'fixed_eur') {
    eurPerKg = lp.price_fixed_eur_per_kg ?? null;
  }

  if (lp.price_scheme === 'fixed_usd' && lp.price_fixed_usd_per_lb != null && usdToEur != null) {
    const eurPerLb = lp.price_fixed_usd_per_lb * usdToEur;
    eurPerKg = eurPerLb * LB_PER_KG;
  }

  if (lp.price_scheme === 'differential') {
    if ((lp.price_base_contract ?? 'kc') === 'kc') {
      // Arabica: KC (USD/lb) + Diff (c/lb)
      if (px.kc_usd_per_lb != null && usdToEur != null) {
        const diffUsdPerLb = (lp.price_diff_cents_per_lb ?? 0) / 100; // c/lb -> USD/lb
        const usdPerLb = px.kc_usd_per_lb + diffUsdPerLb;
        const eurPerLb = usdPerLb * usdToEur;
        eurPerKg = eurPerLb * LB_PER_KG;
      }
    } else if (lp.price_base_contract === 'rc') {
      // Robusta: RC (USD/t) (+ optional diff in c/lb, wenn gesetzt – konservativ ignorieren)
      if (px.rc_usd_per_ton != null && usdToEur != null) {
        const eurPerTon = px.rc_usd_per_ton * usdToEur;
        eurPerKg = eurPerTon / 1000;
      }
    }
  }

  if (eurPerKg == null || !Number.isFinite(eurPerKg)) return null;
  // Anzeige mit 2 Dezimalstellen, Kommaformat:
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(eurPerKg);
}
