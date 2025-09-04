// src/lib/pricing.ts
// Zentrale Preis-Typen + Helfer. Einheitlich für Stock/LotDetail/etc.

export type Prices = {
  usd_eur: number | null;        // 1 USD in EUR
  kc_usd_per_lb: number | null;  // Arabica (KC=F) in USD/lb
  rc_usd_per_ton: number | null; // Robusta in USD/Metric Tonne (kann null sein)
};

export type ContractOpt = { value: string; label: string; yyyymm: string };

// Month-Codes und Zyklen
const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z'];
const KC_CYCLE = new Set(['H','K','N','U','Z']); // Mar, May, Jul, Sep, Dec
const RC_CYCLE = new Set(['F','H','K','N','U','X']); // Jan, Mar, May, Jul, Sep, Nov

/**
 * Nächste N Kontraktmonate (Label "MM/YYYY (KCZ5)" etc.)
 * species: 'arabica' | 'robusta' | 'other' (other -> Arabica-Zyklus)
 */
export function futuresMonths(
  species: 'arabica' | 'robusta' | 'other' = 'arabica',
  count = 8
): ContractOpt[] {
  const useRCycle = species === 'robusta';
  const res: ContractOpt[] = [];
  const d = new Date();
  d.setUTCDate(1);
  while (res.length < count) {
    const m = d.getUTCMonth();      // 0..11
    const y = d.getUTCFullYear();   // z.B. 2025
    const code = MONTH_CODES[m];
    const ok = useRCycle ? RC_CYCLE.has(code) : KC_CYCLE.has(code);
    if (ok) {
      const sym = useRCycle ? 'RC' : 'KC';
      const y1 = String(y).slice(-1);               // 2025 -> "5"
      const codeStr = `${sym}${code}${y1}`;         // KCZ5 etc.
      const mm = String(m + 1).padStart(2, '0');    // "12"
      res.push({
        value: codeStr,
        label: `${mm}/${y} (${codeStr})`,
        yyyymm: `${y}-${mm}`,
      });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return res;
}

// Zahlensafe
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Holt Preise zentral. Erwartet eine Netlify-Function unter /.netlify/functions/prices,
 * liefert aber immer alle drei Keys zurück (fehlende Felder -> null), damit TS konsistent bleibt.
 */
export async function fetchPrices(): Promise<Prices> {
  try {
    const r = await fetch('/.netlify/functions/prices', {
      headers: { 'cache-control': 'no-cache' },
    });
    if (r.ok) {
      const j: any = await r.json();
      return {
        usd_eur: num(j.usd_eur),
        kc_usd_per_lb: num(j.kc_usd_per_lb),
        rc_usd_per_ton: j.hasOwnProperty('rc_usd_per_ton') ? num(j.rc_usd_per_ton) : null,
      };
    }
  } catch {
    // ignore
  }
  return { usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null };
}
