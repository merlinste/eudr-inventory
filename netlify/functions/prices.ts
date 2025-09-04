import type { Handler } from '@netlify/functions';

// Yahoo Chart API (liefert JSON; "regularMarketPrice" in meta)
const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// Hole den letzten Kurs (z. B. KC=F oder EURUSD=X)
async function yahooLast(symbol: string): Promise<number | null> {
  const url = `${CHART}${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const price =
    res?.meta?.regularMarketPrice ??
    res?.indicators?.quote?.[0]?.close?.at(-1);
  return typeof price === 'number' ? price : null;
}

export const handler: Handler = async () => {
  try {
    const [kcCentsPerLb, eurUsd] = await Promise.all([
      yahooLast('KC=F'),     // ICE Arabica (in c/lb)
      yahooLast('EURUSD=X'), // USD pro EUR
    ]);

    // USD->EUR = 1 / (USD pro EUR)
    const usd_eur =
      typeof eurUsd === 'number' && eurUsd > 0 ? 1 / eurUsd : null;

    // KC=F kommt in "cents per lb" → USD/lb
    const kc_usd_per_lb =
      typeof kcCentsPerLb === 'number' ? kcCentsPerLb / 100 : null;

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
      body: JSON.stringify({ usd_eur, kc_usd_per_lb /* rc_usd_per_ton: null */ }),
    };
  } catch {
    return {
      statusCode: 200,
      body: JSON.stringify({ usd_eur: null, kc_usd_per_lb: null }),
    };
  }
};
