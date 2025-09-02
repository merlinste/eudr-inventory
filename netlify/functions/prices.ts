// netlify/functions/prices.ts
type Resp = {
  usd_eur: number | null
  kc_usd_per_lb: number | null   // USD/lb (skaliert aus ¢/lb)
  rc_usd_per_ton: number | null  // USD/ton
  kc_symbol: string | null
  rc_symbol: string | null
}

async function withTimeout(url: string, ms = 10000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { signal: ac.signal }) } finally { clearTimeout(t) }
}

async function yahooClose(symbol: string): Promise<number | null> {
  try {
    const r = await withTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      10000
    )
    const j = await r.json()
    const res = j?.chart?.result?.[0]
    const close = res?.indicators?.quote?.[0]?.close?.[0]
    const price = typeof close === 'number' ? close : res?.meta?.regularMarketPrice
    return typeof price === 'number' ? price : null
  } catch { return null }
}

export async function handler() {
  const out: Resp = { usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null, kc_symbol: null, rc_symbol: null }

  // FX USD→EUR
  try {
    const fx = await withTimeout('https://open.er-api.com/v6/latest/USD', 10000)
    const fxj = await fx.json()
    if (typeof fxj?.rates?.EUR === 'number') out.usd_eur = fxj.rates.EUR
  } catch {}

  // KC (Arabica) – Yahoo liefert ¢/lb → in USD/lb skalieren
  const kcRaw = await yahooClose('KC=F')
  if (kcRaw != null) {
    // Heuristik: wenn > 10, ist es nahezu sicher ¢/lb ⇒ ÷100
    out.kc_usd_per_lb = kcRaw > 10 ? kcRaw / 100 : kcRaw
    out.kc_symbol = 'KC=F'
  }

  // RC (Robusta) – USD/ton
  for (const sym of ['RM=F', 'RC=F', 'LRC=F']) {
    const rc = await yahooClose(sym)
    if (rc != null) { out.rc_usd_per_ton = rc; out.rc_symbol = sym; break }
  }

  return { statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(out) }
}
