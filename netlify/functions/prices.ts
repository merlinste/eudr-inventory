// netlify/functions/prices.ts
import type { Handler } from '@netlify/functions';

async function yahooLast(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const r = await fetch(url); if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (Number.isFinite(m?.regularMarketPrice)) return Number(m.regularMarketPrice);
    const close = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    const last = Array.isArray(close) ? close.filter((x:any)=>Number.isFinite(x)).slice(-1)[0] : null;
    return Number.isFinite(last) ? Number(last) : null;
  } catch { return null; }
}

async function fxUsdEur(): Promise<number | null> {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR');
    const j = await r.json().catch(()=>({}));
    const v = Number(j?.rates?.EUR);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

async function rcFromNDL(): Promise<number | null> {
  const apiKey = process.env.RC_NDL_API_KEY;
  const dataset = process.env.RC_NDL_DATASET; // z.B. ICE/RC1  (abhängig von deinem Datensatz)
  if (!apiKey || !dataset) return null;

  try {
    const url = `https://data.nasdaq.com/api/v3/datasets/${encodeURIComponent(dataset)}.json?rows=1&order=desc&api_key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url); if (!r.ok) return null;
    const j = await r.json();
    const cols: string[] = j?.dataset?.column_names ?? [];
    const row: any[] = j?.dataset?.data?.[0] ?? [];
    // erste numerische Spalte verwenden (Settle/Last/Close/Value …)
    for (let i = 0; i < row.length; i++) {
      const val = Number(row[i]);
      if (Number.isFinite(val) && typeof cols[i] !== 'string' || (cols[i] && cols[i] !== 'Date')) return val;
    }
    return null;
  } catch { return null; }
}

export const handler: Handler = async () => {
  const usd_eur = await fxUsdEur();
  const kc_usd_per_lb = await yahooLast('KC=F');

  let rc_usd_per_ton: number | null = null;
  const provider = (process.env.RC_PROVIDER || '').toLowerCase();

  if (provider === 'ndl') {
    rc_usd_per_ton = await rcFromNDL();
  }
  if (rc_usd_per_ton == null) {
    // Fallback Yahoo (nicht immer stabil)
    const candidates = ['LRC=F', 'RC=F', 'COFFEE-RC=F'];
    for (const sym of candidates) {
      const v = await yahooLast(sym);
      if (Number.isFinite(v)) { rc_usd_per_ton = Number(v); break; }
    }
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usd_eur, kc_usd_per_lb, rc_usd_per_ton }),
  };
};
