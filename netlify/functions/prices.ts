// netlify/functions/prices.ts
type Resp = {
  usd_eur: number | null        // 1 USD in EUR
  kc_usd_per_lb: number | null  // Coffee C (Arabica) USD/lb
  rc_usd_per_ton: number | null // Robusta (London) USD/ton
  kc_symbol: string | null
  rc_symbol: string | null
}

async function withTimeout(url: string, ms = 10000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(url, { signal: ac.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

async function yahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
    const r = await withTimeout(url, 10000)
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    const close = res?.indicators?.quote?.[0]?.close?.[0]
    const price = typeof close === 'number' ? close : res?.meta?.regularMarketPrice
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

export async function handler() {
  const out: Resp = { usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null, kc_symbol: null, rc_symbol: null }

  // FX USD->EUR
  try {
    const fx = await withTimeout('https://open.er-api.com/v6/latest/USD', 10000)
    const fxj = await fx.json()
    const rate = fxj?.rates?.EUR
    if (typeof rate === 'number') out.usd_eur = rate
  } catch {}

  // KC (Arabica)
  const kc = await yahooPrice('KC=F')
  if (kc != null) { out.kc_usd_per_lb = kc; out.kc_symbol = 'KC=F' }

  // RC (Robusta) – mehrere Kandidaten probieren
  for (const sym of ['RM=F', 'RC=F', 'LRC=F']) {
    const rc = await yahooPrice(sym)
    if (rc != null) { out.rc_usd_per_ton = rc; out.rc_symbol = sym; break }
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(out),
  }
}
