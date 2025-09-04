// src/pages/Stock.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Prices, fetchPrices, calcEurPerKgForLot, fmtEurPerKg } from '@/lib/pricing';

const STOCK_VIEW = 'v_green_stock'; // ggf. auf deinen View-Namen anpassen
const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });

type LotStatus =
  | 'contracted' | 'price_fixed' | 'at_port'
  | 'at_production_wh' | 'produced' | 'closed' | null;

type Species = 'arabica' | 'robusta' | 'other';
type PriceScheme = 'fixed_eur' | 'fixed_usd' | 'differential' | null;

// Bestandszeile aus der View
type StockRow = {
  id: string;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean;
  status: LotStatus;
  received_kg: number | null;
  produced_kg: number | null;
  balance_kg: number | null;
};

// Preis-Metadaten je Lot aus green_lots
type LotPrice = {
  id: string;
  species: Species;
  price_scheme: PriceScheme;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null; // arabica
  price_diff_usd_per_ton: number | null;  // robusta
  price_base_contract: string | null;
};

const LB_TO_KG = 0.45359237;

const fmtKg = (n: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n);

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(n);

// Preisberechnung (wie in LotDetail)
function calcEurPerKgForLot(lp: LotPrice | undefined, p: Prices): number | null {
  if (!lp) return null;

  const usdEur = p.usd_eur ?? 0;

  if (lp.price_scheme === 'fixed_eur') {
    const v = lp.price_fixed_eur_per_kg;
    return v != null && isFinite(v) ? v : null;
  }

  if (lp.price_scheme === 'fixed_usd') {
    const v = lp.price_fixed_usd_per_lb;
    if (v == null || !isFinite(v) || !usdEur) return null;
    const usdPerKg = v / LB_TO_KG; // USD/lb -> USD/kg
    return usdPerKg * usdEur;
  }

  if (lp.price_scheme === 'differential') {
    if (lp.species === 'arabica') {
      const kc = p.kc_usd_per_lb ?? 0;
      if (!kc || !usdEur) return null;
      const diffClb = lp.price_diff_cents_per_lb ?? 0; // c/lb
      const usdPerLb = kc + diffClb / 100;
      const usdPerKg = usdPerLb / LB_TO_KG;
      return usdPerKg * usdEur;
    } else if (lp.species === 'robusta') {
      const rc = p.rc_usd_per_ton ?? 0;
      if (!rc || !usdEur) return null;
      const diffT = lp.price_diff_usd_per_ton ?? 0; // USD/t
      const usdPerKg = (rc + diffT) / 1000;
      return usdPerKg * usdEur;
    }
  }

  return null;
}

export default function Stock() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [pricesByLot, setPricesByLot] = useState<Record<string, LotPrice>>({});

  // Einheitlicher Preis-State inkl. rc_usd_per_ton
  const [mkt, setMkt] = useState<Prices>({
    usd_eur: null,
    kc_usd_per_lb: null,
    rc_usd_per_ton: null,
  });

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    void reloadAll();
  }, []);

  async function reloadAll() {
    setLoading(true);

    const [stock, lotPrices, mp] = await Promise.all([
      supabase
        .from(STOCK_VIEW)
        .select('id, short_desc, origin_country, organic, status, received_kg, produced_kg, balance_kg')
        .order('short_desc', { ascending: true }),
      supabase
        .from('green_lots')
        .select('id, species, price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb, price_diff_cents_per_lb, price_diff_usd_per_ton, price_base_contract'),
      fetchPrices(),
    ]);

    if (!stock.error && Array.isArray(stock.data)) {
      setRows(stock.data as StockRow[]);
    }

    if (!lotPrices.error && Array.isArray(lotPrices.data)) {
      const map: Record<string, LotPrice> = {};
      for (const r of lotPrices.data as any[]) {
        map[r.id] = {
          id: r.id,
          species: (r.species ?? 'arabica') as Species,
          price_scheme: (r.price_scheme ?? null) as PriceScheme,
          price_fixed_eur_per_kg: r.price_fixed_eur_per_kg ?? null,
          price_fixed_usd_per_lb: r.price_fixed_usd_per_lb ?? null,
          price_diff_cents_per_lb: r.price_diff_cents_per_lb ?? null,
          price_diff_usd_per_ton: r.price_diff_usd_per_ton ?? null,
          price_base_contract: r.price_base_contract ?? null,
        };
      }
      setPricesByLot(map);
    }

    setMkt({
      usd_eur: mp.usd_eur,
      kc_usd_per_lb: mp.kc_usd_per_lb,
      rc_usd_per_ton: mp.rc_usd_per_ton ?? null,
    });

    setLoading(false);
  }

  const filtered = useMemo(() => {
    const s = (q || '').toLowerCase();
    return rows
      .filter(r => r.status !== 'closed')
      .filter(r => {
        if (!s) return true;
        const hay = [
          r.short_desc ?? '',
          r.origin_country ?? '',
          String(r.received_kg ?? ''),
          String(r.balance_kg ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(s);
      });
  }, [rows, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bestand (Rohkaffee)</h2>
        <div className="flex gap-2">
          <button className="rounded bg-slate-200 px-3 py-2 text-sm" onClick={reloadAll}>
            Aktualisieren
          </button>
        </div>
      </div>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Suchen (Bezeichnung, Herkunft …)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="text-left p-2">Bezeichnung</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-right p-2">Erhalten (kg)</th>
              <th className="text-right p-2">Produziert (kg)</th>
              <th className="text-right p-2">Bestand (kg)</th>
              <th className="text-right p-2">Preis (EUR/kg)</th>
              <th className="text-left p-2">Modus</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={8}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-3" colSpan={8}>Keine Lots gefunden.</td></tr>
            ) : (
              filtered.map((r) => {
                const lp = pricesByLot[r.id];
                const eurkg = calcEurPerKgForLot(lp, mkt);
                const mode =
                  lp?.price_scheme === 'fixed_eur' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      fixiert
                    </span>
                  ) : lp?.price_scheme ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      live
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  );

                return (
                  <tr key={r.id} className="border-b">
                    <td className="p-2">
                      <Link to={`/lots/${r.id}`} className="text-blue-700 hover:underline">
                        {r.short_desc ?? '—'}
                      </Link>
                    </td>
                    <td className="p-2">{r.origin_country ?? '—'}</td>
                    <td className="p-2 text-right">{fmtKg(Number(r.received_kg ?? 0))}</td>
                    <td className="p-2 text-right">{fmtKg(Number(r.produced_kg ?? 0))}</td>
                    <td className="p-2 text-right font-medium">{fmtKg(Number(r.balance_kg ?? 0))}</td>
                    <td className="p-2 text-right">{eurkg != null ? fmtMoney(eurkg) : '—'}</td>
                    <td className="p-2">{mode}</td>
                    <td className="p-2">
                      <Link to={`/lots/${r.id}`} className="text-blue-700 hover:underline">Details</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Markt: USD→EUR {mkt.usd_eur ? mkt.usd_eur.toFixed(4) : '—'} · KC {mkt.kc_usd_per_lb ? mkt.kc_usd_per_lb.toFixed(4) : '—'} USD/lb
      </div>
    </div>
  );
}
