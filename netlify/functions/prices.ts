// netlify/functions/prices.ts
import type { Handler } from '@netlify/functions';

type NDLRow = { column_names: string[]; data: any[][] };
const ndl = async (code: string, key: string) => {
  const url = `https://data.nasdaq.com/api/v3/datasets/${code}.json?rows=1&api_key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`NDL ${code} ${r.status}`);
  const j = await r.json() as { dataset: { column_names: string[], data: any[][] } };
  const cols = j.dataset.column_names;
  const row = j.dataset.data?.[0] || [];
  const get = (name: string) => {
    const idx = cols.indexOf(name);
    return idx >= 0 ? Number(row[idx]) : null;
  };
  // vorzugsweise 'Settle', fallback 'Last'
  return get('Settle') ?? get('Last') ?? null;
};

const fx = async () => {
  const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { headers: { 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`FX ${r.status}`);
  const j = await r.json() as { rates: { EUR: number } };
  return Number(j?.rates?.EUR ?? 0) || null;
};

export const handler: Handler = async () => {
  try {
    const key = process.env.NDL_API_KEY || '';
    if (!key) throw new Error('NDL_API_KEY missing');

    const [usd_eur, kc, rc] = await Promise.all([
      fx(),
      ndl('CHRIS/ICE_KC1', key), // USD per lb
      ndl('CHRIS/ICE_RC1', key), // USD per metric ton
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        usd_eur: usd_eur,              // number | null (USD→EUR)
        kc_usd_per_lb: kc,            // Arabica
        rc_usd_per_ton: rc            // Robusta
      }),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message ?? String(e) }) };
  }
};
