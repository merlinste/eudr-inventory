// src/pages/Archive.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type LotRow = {
  id: string; short_desc: string|null; origin_country: string|null;
  status: string|null; archived: boolean;
};
type BatchRow = {
  id: string; product_name: string|null; batch_code: string|null;
  produced_kg: number|null; archived: boolean;
};

export default function Archive() {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => { void load(); }, []);
  async function load() {
    const [lr, br] = await Promise.all([
      supabase.from('green_lots').select('id, short_desc, origin_country, status, archived').eq('archived', true).order('created_at', { ascending: false }),
      supabase.from('finished_batches').select('id, product_name, batch_code, produced_kg, archived').eq('archived', true).order('created_at', { ascending: false }),
    ]);
    if (!lr.error && lr.data) setLots(lr.data as any);
    if (!br.error && br.data) setBatches(br.data as any);
  }

  const flots = useMemo(() => {
    const s = (q||'').toLowerCase();
    if (!s) return lots;
    return lots.filter(r => [r.short_desc, r.origin_country, r.status].join(' ').toLowerCase().includes(s));
  }, [lots, q]);

  const fbatches = useMemo(() => {
    const s = (q||'').toLowerCase();
    if (!s) return batches;
    return batches.filter(r => [r.product_name, r.batch_code].join(' ').toLowerCase().includes(s));
  }, [batches, q]);

  async function unarchiveLot(id: string) {
    const { error } = await supabase.from('green_lots').update({ archived: false }).eq('id', id);
    if (error) alert(error.message); else load();
  }
  async function unarchiveBatch(id: string) {
    const { error } = await supabase.from('finished_batches').update({ archived: false }).eq('id', id);
    if (error) alert(error.message); else load();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Archiv</h2>
      <input className="border rounded px-3 py-2 w-full" placeholder="Suchen…" value={q} onChange={e=>setQ(e.target.value)} />

      {/* Lots */}
      <div>
        <h3 className="font-medium mb-2">Rohkaffee‑Lots</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-2 text-left">Bezeichnung</th>
                <th className="p-2 text-left">Herkunft</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {flots.length === 0 ? (
                <tr><td className="p-3" colSpan={4}>Keine archivierten Lots.</td></tr>
              ) : flots.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.short_desc ?? '—'}</td>
                  <td className="p-2">{r.origin_country ?? '—'}</td>
                  <td className="p-2">{r.status ?? '—'}</td>
                  <td className="p-2">
                    <button className="text-blue-700 hover:underline" onClick={()=>unarchiveLot(r.id)}>Wiederherstellen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fertigprodukte */}
      <div>
        <h3 className="font-medium mb-2">Fertigprodukte (EUDR)</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="p-2 text-left">Produkt</th>
                <th className="p-2 text-left">Charge</th>
                <th className="p-2 text-left">Menge (kg)</th>
                <th className="p-2 text-left">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {fbatches.length === 0 ? (
                <tr><td className="p-3" colSpan={4}>Keine archivierten Fertigprodukte.</td></tr>
              ) : fbatches.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.product_name ?? '—'}</td>
                  <td className="p-2">{r.batch_code ?? '—'}</td>
                  <td className="p-2">{r.produced_kg ?? '—'}</td>
                  <td className="p-2">
                    <button className="text-blue-700 hover:underline" onClick={()=>unarchiveBatch(r.id)}>Wiederherstellen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
