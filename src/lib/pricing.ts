// src/lib/pricing.ts
import { useCallback, useEffect, useState } from 'react'

export type Prices = {
  usd_eur: number | null         // 1 USD -> EUR
  kc_usd_per_lb: number | null   // Arabica KC (USD/lb)
  rc_usd_per_ton: number | null  // Robusta RC (USD/ton) — aktuell null
  asof?: string | null
}

// Konstanten / Umrechnungen
export const LB_PER_KG = 2.20462262185

export function usdLbToEurKg(usd_per_lb: number, usd_eur: number) {
  // USD/lb -> USD/kg -> EUR/kg
  return usd_per_lb * LB_PER_KG * usd_eur
}
export function usdTonToEurKg(usd_per_ton: number, usd_eur: number) {
  // USD/t -> USD/kg -> EUR/kg
  return (usd_per_ton / 1000) * usd_eur
}

// --- Preisberechnung für ein Lot -------------------------------------------
type LotLike = {
  species?: 'arabica' | 'robusta' | 'other' | null
  price_scheme?: 'fixed_eur' | 'fixed_usd' | 'differential' | null
  price_fixed_eur_per_kg?: number | null
  price_fixed_usd_per_lb?: number | null
  price_diff_cents_per_lb?: number | null   // Arabica-Diff (c/lb)
  price_diff_usd_per_ton?: number | null    // Robusta-Diff (USD/t)
}

export function calcLotEurKg(lot: LotLike, prices: Prices): number | null {
  const usd_eur = prices.usd_eur ?? 0
  switch (lot.price_scheme) {
    case 'fixed_eur':
      return lot.price_fixed_eur_per_kg ?? null

    case 'fixed_usd':
      if (lot.species === 'arabica') {
        const v = lot.price_fixed_usd_per_lb ?? null
        return v == null || !usd_eur ? null : usdLbToEurKg(v, usd_eur)
      } else if (lot.species === 'robusta') {
        // (selten) Fixpreis als USD/t – falls vorhanden
        const perTon = lot.price_diff_usd_per_ton ?? null
        return perTon == null || !usd_eur ? null : usdTonToEurKg(perTon, usd_eur)
      }
      return null

    case 'differential':
      if (lot.species === 'arabica') {
        const base = prices.kc_usd_per_lb
        if (base == null || !usd_eur) return null
        const diff = (lot.price_diff_cents_per_lb ?? 0) / 100 // c/lb -> USD/lb
        return usdLbToEurKg(base + diff, usd_eur)
      } else if (lot.species === 'robusta') {
        const baseT = prices.rc_usd_per_ton
        if (baseT == null || !usd_eur) return null
        const diffT = lot.price_diff_usd_per_ton ?? 0
        return usdTonToEurKg(baseT + diffT, usd_eur)
      }
      return null

    default:
      return null
  }
}

// Alias – einige Dateien erwarten diesen Namen
export const calcLotPriceEurPerKg = calcLotEurKg

// --- Live-Preise holen (Netlify Function) ----------------------------------
export function useLivePrices() {
  const [prices, setPrices] = useState<Prices>({
    usd_eur: null,
    kc_usd_per_lb: null,
    rc_usd_per_ton: null,
    asof: null,
  })
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/.netlify/functions/prices', { method: 'GET' })
      if (r.ok) {
        const j = await r.json()
        const next: Prices = {
          usd_eur: j.usd_eur ?? null,
          kc_usd_per_lb: j.kc_usd_per_lb ?? null,
          rc_usd_per_ton: j.rc_usd_per_ton ?? null,
          asof: j.asof ?? null,
        }
        setPrices(next)
      } else {
        console.warn('prices function failed', r.status)
      }
    } catch (e) {
      console.error('prices fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { prices, loading, refresh }
}
