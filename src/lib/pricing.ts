// src/lib/pricing.ts
export type Prices = {
  usd_eur: number | null
  kc_usd_per_lb: number | null
}

export async function fetchPrices(): Promise<Prices> {
  try {
    const r = await fetch('/.netlify/functions/prices', { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    return {
      usd_eur: typeof j.usd_eur === 'number' ? j.usd_eur : null,
      kc_usd_per_lb: typeof j.kc_usd_per_lb === 'number' ? j.kc_usd_per_lb : null
    }
  } catch {
    return { usd_eur: null, kc_usd_per_lb: null }
  }
}

// ---- Preisrechner ----
const LB_PER_KG = 2.20462262185

export type LotForPrice = {
  species: 'arabica' | 'robusta' | 'other' | null
  price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null
  price_fixed_eur_per_kg?: number | null
  price_fixed_usd_per_lb?: number | null
  price_diff_cents_per_lb?: number | null   // Arabica (KC)
  price_diff_usd_per_ton?: number | null    // Robusta (RC)
}

export function calcEurPerKgForLot(lot: LotForPrice, p: Prices): number | null {
  if (!lot?.price_scheme) return null

  // 1) Direkt fixiert in EUR/kg
  if (lot.price_scheme === 'fixed_eur') {
    return numOrNull(lot.price_fixed_eur_per_kg)
  }

  // 2) Fixiert in USD/lb -> EUR/kg
  if (lot.price_scheme === 'fixed_usd') {
    const usd = numOrNull(lot.price_fixed_usd_per_lb)
    if (usd == null || p.usd_eur == null) return null
    return round2(usd * LB_PER_KG * p.usd_eur)
  }

  // 3) Differential
  if (lot.price_scheme === 'differential') {
    if (lot.species === 'arabica') {
      // Arabica: KC_Front (USD/lb) + diff (c/lb)
      if (p.kc_usd_per_lb == null || p.usd_eur == null) return null
      const diff_c = numOrNull(lot.price_diff_cents_per_lb) ?? 0
      const usd_lb = p.kc_usd_per_lb + diff_c / 100
      return round2(usd_lb * LB_PER_KG * p.usd_eur)
    }
    if (lot.species === 'robusta') {
      // (Platzhalter) – bis RC‑Quelle steht, kein Preis
      return null
    }
  }
  return null
}

function numOrNull(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : (typeof x === 'number' ? x : NaN)
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
