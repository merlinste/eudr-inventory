import type { Handler } from '@netlify/functions'

// Stooq CSV endpoint: q/l => lightweight CSV; Symbols:
//  - KC.F (Arabica continuous, USc/lb)
//  - KCZ25.F (Arabica Dec 2025, USc/lb)
//  - RM.F (Robusta 10T continuous, USD/t)  [ICE RC, bei Stooq RM]
//  - RMX25.F (Robusta Nov 2025, USD/t)
async function fetchStooqClose(symbol: string): Promise<number> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcvn&h&e=csv`
  const rsp = await fetch(url)
  if (!rsp.ok) throw new Error(`stooq ${symbol} ${rsp.status}`)
  const csv = await rsp.text()
  // header: Symbol,Date,Time,Open,High,Low,Close,Volume,Name
  const line = csv.split('\n')[1]?.trim()
  const close = Number(line?.split(',')[6])
  if (!isFinite(close)) throw new Error(`stooq: close NaN for ${symbol}`)
  return close
}

async function fetchUsdToEur(): Promise<number> {
  const url = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
  const rsp = await fetch(url)
  if (!rsp.ok) throw new Error(`fx ${rsp.status}`)
  const data = await rsp.json()
  const rate = Number(data?.rates?.EUR)
  if (!isFinite(rate)) throw new Error('fx: bad rate')
  return rate // EUR per 1 USD
}

function twoDigit(year: number) {
  const s = String(year % 100).padStart(2, '0')
  return s
}

export const handler: Handler = async (event) => {
  try {
    const p = event.queryStringParameters || {}
    // root: 'KC' (arabica) or 'RM' (robusta on Stooq)
    const root = (p.root || 'KC').toUpperCase()
    const month = (p.month || '').toUpperCase() // H,K,N,U,Z or F,H,K,N,U,X
    const year = p.year ? Number(p.year) : undefined // 2025 etc.
    const withFx = p.fx !== '0'

    let symbol: string
    if (month && year) {
      symbol = `${root}${month}${twoDigit(year)}.F`
    } else {
      symbol = `${root}.F` // continuous/front
    }

    const close = await fetchStooqClose(symbol)
    const usdPerEur = await fetchUsdToEur() // EUR per 1 USD

    // Map units & convert to EUR/kg
    // KC: close = USc/lb; RM: close = USD/tonne
    let eurPerKg: number
    if (root === 'KC') {
      const usdPerLb = close / 100.0
      const USD_PER_KG = usdPerLb * 2.2046226218
      eurPerKg = withFx ? USD_PER_KG * usdPerEur : USD_PER_KG
    } else {
      // RM (Robusta 10T): USD per tonne -> USD per kg
      const USD_PER_KG = close / 1000.0
      eurPerKg = withFx ? USD_PER_KG * usdPerEur : USD_PER_KG
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({
        symbol, close, root,
        unit: root === 'KC' ? 'USc/lb' : 'USD/t',
        eur_per_kg: eurPerKg,
        fx: { usd_to_eur: usdPerEur }
      })
    }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) }
  }
}
