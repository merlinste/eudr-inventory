// src/pages/Stock.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { fetchPrices, calcEurPerKgForLot, type Prices } from '@/lib/pricing';

type Species = 'arabica' | 'robusta' | 'other' | null;
type LotStatus = 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null;
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null;

type Row = {
  id: string;
  lot_no?: string | null;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean;
  species: Species;
  status: LotStatus;

  // Mengen
  received_kg: number;
  produced_kg: number;
  balance_kg: number;

  // Preise (aus green_lots)
  price_scheme: PriceScheme;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
  price_base_contract?: string | null;
};

export default function Stock() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [prices, setPrices] = useState<Prices>({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null });

  useEffect(() => {
    void loadRows();
    void refreshPrices();
  }, []);

  async function loadRows() {
    setLoading(true);
    // ⬇️ Falls dein View anders heißt, hier anpassen:
    const { data, error } = await supabase
      .from('v_green_stock')
      .select(
        [
          'id',
          'lot_no',
          'short_desc',
          'origin_country',
          'organic',
          'species',
          'status',
          'received_kg',
          'produced_kg',
          'balance_kg',
          'price_scheme',
          'price_fixed_eur_per_kg',
          'price_fixed_usd_per_lb',
          'price_diff_cents_per_lb',
          'price_base_contract',
        ].join(',')
      )
      .order('short_desc', { ascending: true });

    if (!error && data) {
      // Standard-Filter: geschlossene Lots ausblenden (nur operativer Bestand)
      const list = (data as any[]).filter(r => r.status !== 'closed');
      setRows(list as Row[]);
    } else if (error) {
      alert(error.message);
    }
    setLoading(false);
  }

  async function refreshPrices() {
    const p = await fetchPrices();
    setPrices(p);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => {
      const hay = [
        r.lot_no ?? '',
        r.short_desc ?? '',
        r.origin_country ?? '',
        r.price_base_contract ?? '',
      ].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bestand (Rohkaffee)</h2>
        <div className="flex items-center gap-3 text-sm">
          <button className="rounded bg-slate-800 text-white px-3 py-1.5" onClick={refreshPrices}>
            Marktdaten aktualisieren
          </button>
          <span className="text-slate-600">
            USD→EUR: <b>{prices.usd_eur ?? '—'}</b> · KC (USD/lb): <b>{prices.kc_usd_per_lb ?? '—'}</b>
          </span>
        </div>
      </div>

      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Suche (Lot‑Nr., Bezeichnung, Herkunft, Kontrakt)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="text-left p-2">Lot‑Nr.</th>
              <th className="text-left p-2">Bezeichnung</th>
              <th className="text-left p-2">Herkunft</th>
              <th className="text-left p-2">Bio</th>
              <th className="text-left p-2">Art</th>
              <th className="text-right p-2">Erhalten (kg)</th>
              <th className="text-right p-2">Produziert (kg)</th>
              <th className="text-right p-2">Bestand (kg)</th>
              <th className="text-left p-2">Preis</th>
              <th className="text-left p-2">Kontrakt</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={11}>Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-3" colSpan={11}>Keine Lots gefunden.</td></tr>
            ) : (
              filtered.map((r) => {
                const eurKg = calcEurPerKgForLot(r, prices); // ✅ richtig: lot + prices
                const badge =
                  r.price_scheme === 'differential'
                    ? <span className="ml-2 inline-block text-xs rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">Live</span>
                    : <span className="ml-2 inline-block text-xs rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">Fixiert</span>;

                return (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 font-mono">{r.lot_no ?? '—'}</td>
                    <td className="p-2">
                      <Link to={`/lots/${r.id}`} className="text-blue-700 hover:underline">
                        {r.short_desc ?? '—'}
                      </Link>
                    </td>
                    <td className="p-2">{r.origin_country ?? '—'}</td>
                    <td className="p-2">{r.organic ? 'Ja' : 'Nein'}</td>
                    <td className="p-2">{r.species ?? '—'}</td>
                    <td className="p-2 text-right tabular-nums">{fmtKg(r.received_kg)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtKg(r.produced_kg)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtKg(r.balance_kg)}</td>
                    <td className="p-2">
                      {eurKg == null ? '—' : <span className="tabular-nums">{fmtEur(eurKg)}/kg</span>}
                      {r.price_scheme ? badge : null}
                    </td>
                    <td className="p-2 font-mono">{r.price_base_contract ?? '—'}</td>
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
    </div>
  );
}

function fmtKg(n: number) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n ?? 0);
}
function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(n);
}
