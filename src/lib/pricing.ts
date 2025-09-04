// src/lib/pricing.ts
// Zentrale Preislogik + Fetcher (KC via Netlify-Proxy, FX via exchangerate.host)

export type Prices = {
  usd_eur: number | null;        // USD -> EUR
  kc_usd_per_lb: number | null;  // ICE Arabica Futures (US-$/lb)
  rc_usd_per_ton: number | null; // ICE Robusta Futures (US-$/t) - optional, kann null sein
};

// ---------- Hilfsfunktionen (Formatierung) ----------
export function fmtEurPerKg(n: number | null) {
  if (n == null || !isFinite(n)) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
    .format(n);
}

export function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

// ---------- Preisberechnung ----------
type LotPriceArgs = {
  species: 'arabica' | 'robusta' | 'other';
  scheme: 'fixed_eur' | 'fixed_usd' | 'differential' | null;
  // fixe Werte
  fixed_eur_per_kg?: number | null;
  fixed_usd_per_lb?: number | null;
  // Differential
  diff_cents_per_lb?: number | null; // Arabica (c/lb)
  diff_usd_per_ton?: number | null;  // Robusta (USD/t)
};

export function calcEurPerKgForLot(p: Prices, args: LotPriceArgs): number | null {
  const fx = p.usd_eur ?? null;

  // 1) Fix in EUR/kg
  if (args.scheme === 'fixed_eur') {
    return args.fixed_eur_per_kg ?? null;
  }

  // 2) Fix in USD/lb -> EUR/kg
  if (args.scheme === 'fixed_usd') {
    if (fx == null) return null;
    if (args.fixed_usd_per_lb == null) return null;
    // 1 lb = 0.45359237 kg  => USD/lb -> USD/kg
    const usd_per_kg = args.fixed_usd_per_lb / 0.45359237;
    return usd_per_kg * fx;
  }

  // 3) Differential
  if (args.scheme === 'differential') {
    if (args.species === 'arabica') {
      // KC = USD/lb, Diff in c/lb
      if (fx == null) return null;
      if (p.kc_usd_per_lb == null) return null;
      const kc_usd_per_lb = p.kc_usd_per_lb;
      const diff_usd_per_lb = (args.diff_cents_per_lb ?? 0) / 100.0;
      const usd_per_lb = kc_usd_per_lb + diff_usd_per_lb;
      const usd_per_kg = usd_per_lb / 0.45359237;
      return usd_per_kg * fx;
    }
    if (args.species === 'robusta') {
      // RC = USD/t, Diff in USD/t
      if (fx == null) return null;
      if (p.rc_usd_per_ton == null) return null;
      const usd_per_ton = p.rc_usd_per_ton + (args.diff_usd_per_ton ?? 0);
      const usd_per_kg = usd_per_ton / 1000.0;
      return usd_per_kg * fx;
    }
    return null;
  }

  return null;
}

// ---------- Fetch der Marktdaten ----------

// FX: frei & CORS-freundlich
async function fetchFx(): Promise<number | null> {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR');
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.rates?.EUR;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

// KC: über Netlify Function (CORS-frei im Browser)
async function fetchKC(): Promise<number | null> {
  try {
    const r = await fetch('/.netlify/functions/yahoo?symbol=KC=F');
    if (!r.ok) return null;
    const j = await r.json();
    // unterstützt beide Varianten: {price: number} ODER {regularMarketPrice: number}
    const v = typeof j?.price === 'number'
      ? j.price
      : (typeof j?.regularMarketPrice === 'number' ? j.regularMarketPrice : null);
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

// RC: optional – hier bewusst erstmal null (später per NDL/TradingView etc.)
async function fetchRC(): Promise<number | null> {
  return null;
}

export async function fetchPrices(): Promise<Prices> {
  const [usd_eur, kc, rc] = await Promise.all([fetchFx(), fetchKC(), fetchRC()]);
  return {
    usd_eur,
    kc_usd_per_lb: kc,
    rc_usd_per_ton: rc,
  };
}
