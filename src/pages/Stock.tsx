// src/pages/Stock.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import {
  Prices,
  fetchPrices,
  calcEurPerKgForLot,
  fmtEurPerKg,
} from '@/lib/pricing';

type Species = 'arabica' | 'robusta' | 'other';
type LotStatus =
  | 'contracted'
  | 'price_fixed'
  | 'at_port'
  | 'at_production_wh'
  | 'produced'
  | 'closed'
  | null;
type PriceScheme = 'fixed_eur' | 'fixed_usd' | 'differential' | null;

type LotRow = {
  id: string;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean;
  status: LotStatus;
  species: Species;
  // Preisfelder (für die Berechnung notwendig)
  price_scheme: PriceScheme;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
  price_diff_usd_per_ton: number | null;
};

type AggRow = {
  id: string; // v_green_stock.id == green_lot_id
  received_kg: number | null;
  produced_kg: number | null;
  balance_kg: number | null;
};

type DetRow = {
  green_lot_id: string;
  warehouse_id: string;
  warehouse_name: string;
  balance_kg: number;
};

export default function Stock() {
  // ---------------- state ----------------
  const [lots, setLots] = useState<LotRow[]>([]);
  const [agg, setAgg] = useState<Record<string, AggRow>>({});
  const [det, setDet] = useState<Record<string, DetRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const [prices, setPrices] = useState<Prices>({
    usd_eur: null,
    kc_usd_per_lb: null,
    rc_usd_per_ton: null,
  });

  // ---------------- effects ----------------
  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    void refreshMarket();
  }, []);

  // ---------------- data loading ----------------
  async function loadAll() {
    setLoading(true);

    const [lotsRes, aggRes, detRes] = await Promise.all([
      supabase
        .from('green_lots')
        .select(
          `
          id, short_desc, origin_country, organic, status, species,
          price_scheme, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
          price_diff_cents_per_lb, price_diff_usd_per_ton
        `
        )
        .order('created_at', { ascending: false }),
      supabase.from('v_green_stock').select('id, received_kg, produced_kg, balance_kg'),
      supabase
        .from('v_green_stock_detailed')
        .select('green_lot_id, warehouse_id, warehouse_name, balance_kg'),
    ]);

    if (!lotsRes.error && lotsRes.data) {
      setLots(lotsRes.data as LotRow[]);
    }

    if (!aggRes.error && aggRes.data) {
      const map: Record<string, AggRow> = {};
      for (const r of aggRes.data as any[]) {
        map[String(r.id)] = {
          id: String(r.id),
          received_kg: Number(r.received_kg ?? 0),
          produced_kg: Number(r.produced_kg ?? 0),
          balance_kg: Number(r.balance_kg ?? 0),
        };
      }
      setAgg(map);
    }

    if (!detRes.error && detRes.data) {
      const map: Record<string, DetRow[]> = {};
      for (const r of detRes.data as any[]) {
        const gid = String(r.green_lot_id);
        (map[gid] ||= []).push({
          green_lot_id: gid,
          warehouse_id: String(r.warehouse_id),
          warehouse_name: String(r.warehouse_name ?? 'Lager'),
          balance_kg: Number(r.balance_kg ?? 0),
        });
      }
      // sortiere Lageranzeige konsistent
      for (const k of Object.keys(map)) {
        map[k].sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));
      }
      setDet(map);
    }

    setLoading(false);
  }

  async function refreshMarket() {
    const p = await fetchPrices();
    setPrices(p);
  }

  // ---------------- derived ----------------
  const filtered = useMemo(() => {
    const needle = (q || '').toLowerCase();
    if (!needle) return lots;
    return lots.filter((l) => {
      const hay =
        [l.short_desc, l.origin_country, l.status]
          .map((x) => (x ?? '').toString().toLowerCase())
          .join(' ');
      return hay.includes(needle);
    });
  }, [q, lots]);

  // Hilfsanzeige für Lagerliste in einer Zelle
  function renderWarehouses(lotId: string) {
    const rows = det[lotId] || [];
    if (!rows.length) return '—';
    return (
      <ul className="list-disc pl-4">
        {rows.map((r) => (
          <li key={r.warehouse_id}>
            {r.warehouse_name}: {fmtInt(r.balance_kg)} kg
          </li>
        ))}
      </ul>
    );
  }

  // Preis je Lot (in EUR/kg) – nutzt die importierte Utility
  function lotEurPerKg(l: LotRow): number | null {
    return calcEurPerKgForLot(prices, {
      species: l.species,
      scheme: l.price_scheme,
      fixed_eur_per_kg: l.price_fixed_eur_per_kg,
      fixed_usd_per_lb: l.price_fixed_usd_per_lb,
      diff_cents_per_lb: l.price_diff_cents_per_lb,
      diff_usd_per_ton: l.price_diff_usd_per_ton,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bestand · Rohkaffee‑Lots</h2>
        <button
          className="px-3 py-2 rounded bg-slate-800 text-white text-sm"
          onClick={refreshMarket}
        >
          Preise aktualisieren
        </button>
      </div>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Suchen (Beschreibung, Herkunft)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="text-sm text-slate-600">
        FX USD→EUR: {prices.usd_eur ?? '—'} · KC (USD/lb): {prices.kc_usd_per_lb ?? '—'} · RC (USD/t):{' '}
        {prices.rc_usd_per_ton ?? '—'}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Lager</th>
              <th className="text-right p-2">Erhalten (kg)</th>
              <th className="text-right p-2">Produziert (kg)</th>
              <th className="text-right p-2">Verbleibend (kg)</th>
              <th className="text-right p-2">Preis (EUR/kg)</th>
              <th className="text-left p-2">Modus</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="p-3">
                  Lade…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-3">
                  Keine Lots gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((l) => {
                const a = agg[l.id];
                const eurPerKg = lotEurPerKg(l);
                const mode =
                  l.price_scheme === 'differential' ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      live
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      fix
                    </span>
                  );

                return (
                  <tr key={l.id} className="border-b align-top">
                    <td className="p-2">
                      <Link to={`/lots/${l.id}`} className="text-blue-700 hover:underline">
                        {l.short_desc ?? '—'}
                      </Link>
                    </td>
                    <td className="p-2">{l.origin_country ?? '—'}</td>
                    <td className="p-2">{l.organic ? 'Ja' : 'Nein'}</td>
                    <td className="p-2">{labelStatus(l.status)}</td>
                    <td className="p-2">{renderWarehouses(l.id)}</td>
                    <td className="p-2 text-right">{fmtInt(a?.received_kg ?? 0)}</td>
                    <td className="p-2 text-right">{fmtInt(a?.produced_kg ?? 0)}</td>
                    <td className="p-2 text-right">{fmtInt(a?.balance_kg ?? 0)}</td>
                    <td className="p-2 text-right">{fmtEurPerKg(eurPerKg)}</td>
                    <td className="p-2">{mode}</td>
                    <td className="p-2">
                      <Link to={`/lots/${l.id}`} className="text-blue-700 hover:underline">
                        Details
                      </Link>
                    </td>
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

// --------- helpers ----------
function fmtInt(n: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
}

function labelStatus(s: LotStatus) {
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
