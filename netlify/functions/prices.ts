// netlify/functions/prices.ts
import type { Handler } from '@netlify/functions'

const Y_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=EURUSD=X,KC=F'

export const handler: Handler = async () => {
  try {
    const r = await fetch(Y_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const j = await r.json() as any
    const rows = (j?.quoteResponse?.result ?? []) as any[]

    const fx = rows.find(x => x.symbol === 'EURUSD=X')?.regularMarketPrice
    const kc = rows.find(x => x.symbol === 'KC=F')?.regularMarketPrice

    // Yahoo liefert EURUSD als USD pro EUR -> USD->EUR = 1 / EURUSD
    const usd_eur = typeof fx === 'number' && fx > 0 ? (1 / fx) : null

    // KC=F kommt in c/lb (Zent pro Pfund) -> USD/lb
    const kc_usd_per_lb = typeof kc === 'number' ? kc / 100 : null

    const body = JSON.stringify({ usd_eur, kc_usd_per_lb })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body
    }
  } catch (e: any) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ usd_eur: null, kc_usd_per_lb: null, error: String(e?.message ?? e) })
    }
  }
}
