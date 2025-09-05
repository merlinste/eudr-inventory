// netlify/functions/market.ts
import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  try {
    // 1) USD->EUR (exchangerate.host, kostenlos)
    const fxRes = await fetch(
      'https://api.exchangerate.host/latest?base=USD&symbols=EUR',
      { headers: { 'user-agent': 'earlybird-inventory' } }
    ).then(r => r.json());

    const usd_eur = Number(fxRes?.rates?.EUR ?? 0) || null;

    // 2) KC Arabica (USD/lb) – Yahoo Finance
    const y = await fetch(
      'https://query1.finance.yahoo.com/v10/finance/quoteSummary/KC=F?modules=price',
      { headers: { 'user-agent': 'earlybird-inventory' } }
    ).then(r => r.json());

    let kc_usd_per_lb: number | null = null;
    const p = y?.quoteSummary?.result?.[0]?.price;
    if (p?.regularMarketPrice?.raw != null) kc_usd_per_lb = Number(p.regularMarketPrice.raw);
    else if (p?.preMarketPrice?.raw != null) kc_usd_per_lb = Number(p.preMarketPrice.raw);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ usd_eur, kc_usd_per_lb }),
    };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message ?? String(err) }) };
  }
};
