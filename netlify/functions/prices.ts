// netlify/functions/prices.ts
import type { Handler } from '@netlify/functions';

async function yahooLast(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const direct = meta?.regularMarketPrice;
    if (Number.isFinite(direct)) return Number(direct);
    const close = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    const last = Array.isArray(close) ? close.filter((x: any) => Number.isFinite(x)).slice(-1)[0] : null;
    return Number.isFinite(last) ? Number(last) : null;
  } catch {
    return null;
  }
}

export const handler: Handler = async () => {
  try {
    // FX USD->EUR
    // exchangerate.host ist frei & ohne API-Schlüssel
    const fxRes = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR');
    const fxJson = await fxRes.json().catch(() => ({}));
    const usd_eur: number | null = Number(fxJson?.rates?.EUR) || null;

    // Arabica (ICE US) – Yahoo: KC=F
    const kc_usd_per_lb = await yahooLast('KC=F');

    // Robusta (ICE Europe) – mögliche Yahoo-Symbole (nicht immer stabil):
    // Reihenfolge als Fallback-Kaskade.
    const rcCandidates = ['LRC=F', 'RC=F', 'COFFEE-RC=F'];
    let rc_usd_per_ton: number | null = null;
    for (const sym of rcCandidates) {
      const v = await yahooLast(sym);
      if (Number.isFinite(v)) {
        // Einige Feeds liefern Robusta in USD/ton direkt; sollte es USD/lb sein, kann man hier umrechnen.
        rc_usd_per_ton = Number(v);
        break;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ usd_eur, kc_usd_per_lb, rc_usd_per_ton }),
      headers: { 'content-type': 'application/json' },
    };
  } catch (e: any) {
    return {
      statusCode: 200,
      body: JSON.stringify({ usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null, error: e?.message }),
      headers: { 'content-type': 'application/json' },
    };
  }
};
