// netlify/functions/yahoo.ts
import type { Handler } from '@netlify/functions';

// Super-simples Proxy auf Yahoo Chart API (öffentlich, aber CORS-restricted)
export const handler: Handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol || 'KC=F';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: 'upstream error' }) };
    }
    const j = await res.json();
    // robust extrahiert: regularMarketPrice aus chart.meta
    const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
