import type { Handler } from '@netlify/functions';

async function yahooQuote(symbols: string[]): Promise<Record<string, number | null>> {
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols='
    + symbols.map(encodeURIComponent).join(',');
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const j = await r.json();
  const out: Record<string, number | null> = {};
  for (const s of symbols) out[s] = null;
  const arr = j?.quoteResponse?.result ?? [];
  for (const q of arr) {
    const sym = q?.symbol;
    const price = q?.regularMarketPrice ?? q?.ask ?? q?.bid ?? null;
    if (sym && Number.isFinite(price)) out[sym] = Number(price);
  }
  return out;
}

export const handler: Handler = async () => {
  try {
    // 1) Yahoo: EURUSD + KC=F
    const y = await yahooQuote(['EURUSD=X', 'KC=F']);

    // USD->EUR = 1 / (USD per 1 EUR)
    const eurusd = y['EURUSD=X']; // z.B. 1.09 USD für 1 EUR
    const usd_eur = eurusd && eurusd > 0 ? 1 / eurusd : null;

    const kc_usd_per_lb = y['KC=F'] ?? null;

    // 2) Optional: Robusta via NDL (USD/Metric Tonne)
    let rc_usd_per_ton: number | null = null;
    if (process.env.RC_PROVIDER === 'ndl'
        && process.env.RC_NDL_API_KEY
        && process.env.RC_NDL_DATASET
        && process.env.RC_NDL_FIELD) {
      try {
        const u = `https://api.nextdl.co/v1/datasets/${encodeURIComponent(process.env.RC_NDL_DATASET!)}/latest`;
        const r = await fetch(u, {
          headers: {
            'Authorization': `Bearer ${process.env.RC_NDL_API_KEY}`,
            'accept': 'application/json',
          },
        });
        if (r.ok) {
          const j: any = await r.json();
          const v = j?.[process.env.RC_NDL_FIELD!];
          if (Number.isFinite(Number(v))) rc_usd_per_ton = Number(v);
        }
      } catch {
        rc_usd_per_ton = null;
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ usd_eur, kc_usd_per_lb, rc_usd_per_ton }),
    };
  } catch (err: any) {
    // Fallback: Felder existieren immer (null), damit Frontend stabil bleibt
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        usd_eur: null,
        kc_usd_per_lb: null,
        rc_usd_per_ton: null,
        error: String(err?.message ?? err),
      }),
    };
  }
};
