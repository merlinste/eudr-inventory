// src/pages/LotDetail.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Prices, fetchPrices, calcEurPerKgForLot, fmtEurPerKg } from '@/lib/pricing';

type Species = 'arabica'|'robusta'|'other';
type LotStatus = 'contracted'|'price_fixed'|'at_port'|'at_production_wh'|'produced'|'closed'|null;
type PriceScheme = 'fixed_eur'|'fixed_usd'|'differential'|null;

type Lot = {
  id: string;
  lot_no: string | null;
  root_lot_no: string | null;
  short_desc: string | null;
  origin_country: string | null;
  organic: boolean;
  species: Species;
  status: LotStatus;
  dds_reference: string | null;
  external_contract_no: string | null;
  // Preise
  price_scheme: PriceScheme;
  price_base_contract: string | null;
  price_fixed_eur_per_kg: number | null;
  price_fixed_usd_per_lb: number | null;
  price_diff_cents_per_lb: number | null;
  price_diff_usd_per_ton: number | null;
};

export default function LotDetail() {
  const { id } = useParams();
  const [lot, setLot] = useState<Lot | null>(null);
  const [saving, setSaving] = useState(false);

  const [prices, setPrices] = useState<Prices>({
    usd_eur: null,
    kc_usd_per_lb: null,
    rc_usd_per_ton: null,
  });

  // Stammdaten laden
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('green_lots')
        .select(`
          id, lot_no, root_lot_no, short_desc, origin_country, organic, species, status,
          dds_reference, external_contract_no,
          price_scheme, price_base_contract, price_fixed_eur_per_kg, price_fixed_usd_per_lb,
          price_diff_cents_per_lb, price_diff_usd_per_ton
        `)
        .eq('id', id)
        .single();
      if (!error && data) setLot(data as Lot);
    })();
  }, [id]);

  // Marktpreise initial laden
  useEffect(() => {
    (async () => {
      const p = await fetchPrices();
      setPrices(p);
    })();
  }, []);

  async function refreshPrices() {
    const p = await fetchPrices();
    setPrices(p);
  }

  async function save() {
    if (!id || !lot) return;
    setSaving(true);
    const { error } = await supabase.from('green_lots')
      .update({
        short_desc: lot.short_desc,
        status: lot.status,
        dds_reference: lot.dds_reference,
        external_contract_no: lot.external_contract_no,
        price_scheme: lot.price_scheme,
        price_base_contract: lot.price_base_contract,
        price_fixed_eur_per_kg: lot.price_fixed_eur_per_kg,
        price_fixed_usd_per_lb: lot.price_fixed_usd_per_lb,
        price_diff_cents_per_lb: lot.price_diff_cents_per_lb,
        price_diff_usd_per_ton: lot.price_diff_usd_per_ton,
      })
      .eq('id', id);
    setSaving(false);
    if (error) alert(error.message); else alert('Gespeichert.');
  }

  if (!lot) return <div className="p-4">Lade…</div>;

  // Vorschau-Preis
  const previewEurPerKg = calcEurPerKgForLot(prices, {
    species: lot.species,
    scheme: lot.price_scheme,
    fixed_eur_per_kg: lot.price_fixed_eur_per_kg,
    fixed_usd_per_lb: lot.price_fixed_usd_per_lb,
    diff_cents_per_lb: lot.price_diff_cents_per_lb,
    diff_usd_per_ton: lot.price_diff_usd_per_ton,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Lot‑Details</h2>

      <div className="text-sm text-slate-600">
        <span className="font-medium">Lot‑Nr.:</span> <span className="font-mono">{lot.lot_no ?? '—'}</span>
        {' · '}
        <span className="font-medium">Ursprung:</span> <span className="font-mono">{lot.root_lot_no ?? '—'}</span>
      </div>

      {/* Stammdaten */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Stammdaten</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Kurzbezeichnung
            <input className="border rounded px-3 py-2 w-full"
              value={lot.short_desc ?? ''}
              onChange={e=>setLot({...lot, short_desc: e.target.value})}/>
          </label>
          <label>Status
            <select className="border rounded px-3 py-2 w-full"
              value={lot.status ?? 'contracted'}
              onChange={e=>setLot({...lot, status: e.target.value as LotStatus})}>
              <option value="contracted">Kontrahiert</option>
              <option value="price_fixed">Preis fixiert</option>
              <option value="at_port">Im Hafen</option>
              <option value="at_production_wh">Im Produktionslager</option>
              <option value="produced">Produziert</option>
              <option value="closed">Abgeschlossen</option>
            </select>
          </label>
          <label>DDS‑Referenz
            <input className="border rounded px-3 py-2 w-full"
              value={lot.dds_reference ?? ''}
              onChange={e=>setLot({...lot, dds_reference: e.target.value})}/>
          </label>
          <label>Kontraktnummer Importeur/Händler
            <input className="border rounded px-3 py-2 w-full"
              value={lot.external_contract_no ?? ''}
              onChange={e=>setLot({...lot, external_contract_no: e.target.value})}/>
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
                  className="rounded bg-slate-800 text-white text-sm px-3 py-2">
            {saving ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Preise */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-medium">Preis</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Preis‑Schema
            <select className="border rounded px-3 py-2 w-full"
              value={lot.price_scheme ?? 'fixed_eur'}
              onChange={e=>setLot({...lot, price_scheme: e.target.value as PriceScheme})}>
              <option value="fixed_eur">Fixiert in EUR/kg</option>
              <option value="fixed_usd">Fixiert in USD/lb</option>
              <option value="differential">Differential (KC/RC)</option>
            </select>
          </label>

          {lot.price_scheme === 'differential' && (
            <label>Basis‑Kontrakt (Info)
              <input className="border rounded px-3 py-2 w-full"
                     value={lot.price_base_contract ?? ''}
                     onChange={e=>setLot({...lot, price_base_contract: e.target.value})}/>
            </label>
          )}

          {lot.price_scheme === 'fixed_eur' && (
            <label>EUR/kg
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                value={lot.price_fixed_eur_per_kg ?? ''}
                onChange={e=>setLot({...lot, price_fixed_eur_per_kg: e.target.value === '' ? null : Number(e.target.value)})}/>
            </label>
          )}

          {lot.price_scheme === 'fixed_usd' && (
            <label>USD/lb
              <input type="number" step="0.0001" className="border rounded px-3 py-2 w-full"
                value={lot.price_fixed_usd_per_lb ?? ''}
                onChange={e=>setLot({...lot, price_fixed_usd_per_lb: e.target.value === '' ? null : Number(e.target.value)})}/>
            </label>
          )}

          {lot.price_scheme === 'differential' && lot.species === 'arabica' && (
            <label>Diff. (c/lb, +/‑)
              <input type="number" step="0.01" className="border rounded px-3 py-2 w-full"
                value={lot.price_diff_cents_per_lb ?? ''}
                onChange={e=>setLot({...lot, price_diff_cents_per_lb: e.target.value === '' ? null : Number(e.target.value)})}/>
            </label>
          )}

          {lot.price_scheme === 'differential' && lot.species === 'robusta' && (
            <label>Diff. (USD/t, +/‑)
              <input type="number" step="0.1" className="border rounded px-3 py-2 w-full"
                value={lot.price_diff_usd_per_ton ?? ''}
                onChange={e=>setLot({...lot, price_diff_usd_per_ton: e.target.value === '' ? null : Number(e.target.value)})}/>
            </label>
          )}
        </div>

        <div className="text-sm text-slate-600">
          FX USD→EUR: {prices.usd_eur ?? '—'} · KC (USD/lb): {prices.kc_usd_per_lb ?? '—'} · RC (USD/t): {prices.rc_usd_per_ton ?? '—'}
        </div>
        <div className="font-medium">
          Aktueller Preis (Preview): {fmtEurPerKg(previewEurPerKg)} /kg
        </div>

        <div className="flex gap-2">
          <button className="rounded bg-slate-200 px-3 py-2 text-sm" onClick={refreshPrices}>Marktdaten aktualisieren</button>
          <button className="rounded bg-slate-800 text-white px-3 py-2 text-sm" onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
