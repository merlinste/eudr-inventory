// src/lib/pricing.ts
export type Prices = {
  usd_eur: number | null         // USD -> EUR (z.B. 0.8589)
  kc_usd_per_lb: number | null   // Arabica (ICE KC) in USD/lb (Front- oder gewählter Kontrakt)
}

export async function fetchPrices(baseContract?: string | null): Promise<Prices> {
  try {
    const q = baseContract ? `?kc=${encodeURIComponent(baseContract)}` : ''
    const res = await fetch(`/api/market${q}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('market fetch failed')
    const j = await res.json()
    const p: Prices = {
      usd_eur: j.usd_eur ?? null,
      kc_usd_per_lb: j.kc_usd_per_lb ?? null,
    }
    return p
  } catch {
    return { usd_eur: null, kc_usd_per_lb: null }
  }
}

// helpers
const LB_PER_KG = 2.2046226218
export function usdPerLbToEurPerKg(usdPerLb: number, usd_eur: number) {
  // (USD/lb) / (lb/kg) * (USD->EUR)
  return (usdPerLb / LB_PER_KG) * (usd_eur || 0)
}

export function fmtEurPerKg(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
}

/**
 * Preisberechnung je Lot.
 * Erwartete Felder: species, price_scheme, price_* und optional price_base_contract
 */
export function calcEurPerKgForLot(
  lot: {
    species?: 'arabica' | 'robusta' | 'other' | null
    price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null
    price_fixed_eur_per_kg?: number | null
    price_fixed_usd_per_lb?: number | null
    price_diff_cents_per_lb?: number | null
    price_base_contract?: string | null
  },
  prices: Prices
): number | null {
  if (!lot || !lot.price_scheme) return null
  if (lot.price_scheme === 'fixed_eur') return lot.price_fixed_eur_per_kg ?? null
  if (lot.price_scheme === 'fixed_usd') {
    if (lot.price_fixed_usd_per_lb == null || prices.usd_eur == null) return null
    return usdPerLbToEurPerKg(lot.price_fixed_usd_per_lb, prices.usd_eur)
  }
  if (lot.price_scheme === 'differential') {
    if (lot.species !== 'arabica') return null   // Robusta später
    if (prices.kc_usd_per_lb == null || prices.usd_eur == null) return null
    const base = prices.kc_usd_per_lb
    const diffUsdPerLb = (lot.price_diff_cents_per_lb ?? 0) / 100
    return usdPerLbToEurPerKg(base + diffUsdPerLb, prices.usd_eur)
  }
  return null
}
