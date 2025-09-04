// src/lib/pricing.ts
// Zentrale Preis-Utilities: Marktpreise holen + EUR/kg für ein Lot berechnen

export type Prices = {
  usd_eur: number | null;       // EUR je 1 USD
  kc_usd_per_lb: number | null; // Arabica in USD/lb (nicht c/lb!)
  rc_usd_per_ton: number | null; // Robusta (optional), aktuell nicht genutzt
};

// ---------- Öffentliche API ----------

/** Holt FX (USD→EUR) + KC (Arabica). Robusta bleibt ggf. null. */
export async function fetchPrices(): Promise<Prices> {
  const [fx, kcCents] = await Promise.all([
    fetchUsdEur(),
    fetchYahooCentsPerLb('KC=F'),
  ]);

  return {
    usd_eur: fx,
    kc_usd_per_lb: kcCents == null ? null : kcCents / 100, // Yahoo liefert c/lb
    rc_usd_per_ton: null,
  };
}

/** Berechnet EUR/kg für ein Lot anhand des Preis-Schemas. */
export function calcEurPerKgForLot(
  p: Prices,
  opts: {
    species: 'arabica' | 'robusta' | 'other';
    scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null;
    fixed_eur_per_kg: number | null;
    fixed_usd_per_lb: number | null;
    diff_cents_per_lb: number | null; // Arabica
    diff_usd_per_ton: number | null;  // Robusta (optional)
  }
): number | null {
  const LB_TO_KG = 0.45359237;

  // Fixpreis in EUR/kg
  if (opts.scheme === 'fixed_eur' && isFiniteNum(opts.fixed_eur_per_kg))
    return round2(opts.fixed_eur_per_kg!);

  // Fixpreis in USD/lb → EUR/kg
  if (opts.scheme === 'fixed_usd') {
    if (!isFiniteNum(opts.fixed_usd_per_lb) || !isFiniteNum(p.usd_eur)) return null;
    const eurPerKg = (opts.fixed_usd_per_lb! * p.usd_eur!) / LB_TO_KG;
    return round2(eurPerKg);
  }

  // Differential (live)
  if (opts.scheme === 'differential') {
    if (!isFiniteNum(p.usd_eur)) return null;

    if (opts.species === 'arabica') {
      if (!isFiniteNum(p.kc_usd_per_lb)) return null;
      const kcUsdLb = p.kc_usd_per_lb!;
      const diffUsdLb = isFiniteNum(opts.diff_cents_per_lb) ? opts.diff_cents_per_lb! / 100 : 0;
      const usdPerLb = kcUsdLb + diffUsdLb;
      const eurPerKg = (usdPerLb * p.usd_eur!) / LB_TO_KG;
      return round2(eurPerKg);
    }

    if (opts.species === 'robusta') {
      // Optional: falls RC bekannt ist → USD/t auf EUR/kg umrechnen
      if (!isFiniteNum(p.rc_usd_per_ton) && !isFiniteNum(opts.diff_usd_per_ton)) return null;
      const usdPerTon =
        (isFiniteNum(p.rc_usd_per_ton) ? p.rc_usd_per_ton! : 0) +
        (isFiniteNum(opts.diff_usd_per_ton) ? opts.diff_usd_per_ton! : 0);
      const eurPerKg = (usdPerTon / 1000) * p.usd_eur!;
      return round2(eurPerKg);
    }
  }

  return null;
}

/** Anzeige-Helfer: „7,23“ bzw. „—“ */
export function fmtEurPerKg(v: number | null): string {
  if (!isFiniteNum(v)) return '—';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v!);
}

// ---------- interne Helfer ----------

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** USD→EUR über exchangerate.host; Fallback Yahoo EURUSD=X (invertiert). */
async function fetchUsdEur(): Promise<number | null> {
  // Primär: frei & stabil
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR', { cache: 'no-store' });
    const j = await r.json();
    const eur = Number(j?.rates?.EUR);
    if (eur > 0) return eur;
  } catch {}

  // Fallback: Yahoo (liefert USD je EUR → invertieren)
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1d', { cache: 'no-store' });
    const j = await r.json();
    const px =
      j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
      j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.slice(-1)?.[0];
    const usdPerEur = Number(px);
    if (usdPerEur > 0) return 1 / usdPerEur;
  } catch {}

  return null;
}

/** Yahoo Futures (cents per lb). Gibt z. B. 374.15 (= 3.7415 USD/lb) zurück. */
async function fetchYahooCentsPerLb(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      { cache: 'no-store' }
    );
    const j = await r.json();
    const last =
      j?.chart?.result?.[0]?.meta?.regularMarketPrice ??
      j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.slice(-1)?.[0];
    const v = Number(last);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
