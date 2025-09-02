// netlify/functions/prices.ts
type Resp = {
  usd_eur: number | null       // 1 USD in EUR
  kc_usd_per_lb: number | null // Coffee C (Arabica) USD/lb (continuous)
}

export async function handler() {
  const out: Resp = { usd_eur: null, kc_usd_per_lb: null }

  // FX USD->EUR (Open ER API, ohne Key, CORS erlaubt)
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/USD', { timeout: 10000 })
    const fxj = await fx.json()
    const rate = fxj?.rates?.EUR
    if (typeof rate === 'number') out.usd_eur = rate
  } catch {}

  // Arabica Futures (KC=F) über Yahoo Chart-API
  try {
    const yf = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/KC=F?range=1d&interval=1d', { timeout: 10000 })
    const yj = await yf.json()
    const res = yj?.chart?.result?.[0]
    const lastClose = res?.indicators?.quote?.[0]?.close?.[0]
    const price = typeof lastClose === 'number' ? lastClose : res?.meta?.regularMarketPrice
    if (typeof price === 'number') out.kc_usd_per_lb = price
  } catch {}

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(out),
  }
}
