// src/lib/pricing.ts
export type Prices = {
  usd_eur: number | null;
  kc_usd_per_lb: number | null;
  rc_usd_per_ton?: number | null; // optional (derzeit ungenutzt)
};

export async function fetchPrices(): Promise<Prices> {
  try {
    const r = await fetch('/api/market', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    return {
      usd_eur: j.usd_eur ?? null,
      kc_usd_per_lb: j.kc_usd_per_lb ?? null,
      rc_usd_per_ton: null,
    };
  } catch {
    return { usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null };
  }
}

// Umrechnung: USD/lb -> USD/kg
export const usdPerLbToUsdPerKg = (usdPerLb: number) => usdPerLb / 0.45359237;

// Hauptrechner für EUR/kg je Lot
export function calcEurPerKgForLot(
  lot: {
    species?: 'arabica' | 'robusta' | 'other' | null;
    price_scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null;
    price_fixed_eur_per_kg?: number | null;
    price_fixed_usd_per_lb?: number | null;
    price_diff_cents_per_lb?: number | null;
  },
  m: Prices
): number | null {
  if (!lot) return null;

  if (lot.price_scheme === 'fixed_eur') {
    return lot.price_fixed_eur_per_kg ?? null;
  }

  if (lot.price_scheme === 'fixed_usd') {
    if (lot.price_fixed_usd_per_lb == null || m.usd_eur == null) return null;
    return usdPerLbToUsdPerKg(lot.price_fixed_usd_per_lb) * m.usd_eur;
  }

  if (lot.price_scheme === 'differential') {
    if (lot.species === 'arabica') {
      if (m.kc_usd_per_lb == null || m.usd_eur == null) return null;
      const usdPerLb = m.kc_usd_per_lb + (lot.price_diff_cents_per_lb ?? 0) / 100;
      return usdPerLbToUsdPerKg(usdPerLb) * m.usd_eur;
    }
    // Robusta (RC) zunächst nicht
    return null;
  }

  return null;
}
