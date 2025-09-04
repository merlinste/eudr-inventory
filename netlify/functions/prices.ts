// netlify/functions/prices.ts
import type { Handler } from '@netlify/functions'

const YF_URL = 'https://query2.finance.yahoo.com/v7/finance/quote'

export const handler: Handler = async () => {
  try {
    const symbols = ['KC=F', 'EURUSD=X'] // Arabica Front‑Month & EURUSD
    const url = `${YF_URL}?symbols=${encodeURIComponent(symbols.join(','))}`

    // User-Agent hilft gegen gelegentliche 403
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null,
          error: `Yahoo response ${res.status}`,
        }),
      }
    }
    const data = await res.json()
    const list: any[] = data?.quoteResponse?.result ?? []

    const get = (sym: string) =>
      list.find(r => r?.symbol === sym)?.regularMarketPrice ?? null

    const kc = get('KC=F')                // USD/lb
    const eurusd = get('EURUSD=X')        // USD per 1 EUR
    const usd_eur = eurusd ? (1 / eurusd) : null

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        kc_usd_per_lb: kc ?? null,
        usd_eur,
        rc_usd_per_ton: null,         // Robusta später
        asof: new Date().toISOString()
      }),
    }
  } catch (e: any) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null,
        error: String(e),
      }),
    }
  }
}
