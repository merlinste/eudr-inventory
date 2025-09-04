export type Prices = {
  usd_eur: number | null;         // USD → EUR (Multiplikator)
  kc_usd_per_lb: number | null;   // Arabica in USD/lb
  rc_usd_per_ton?: number | null; // optional, derzeit ungenutzt
};

export async function fetchPrices(): Promise<Prices> {
  try {
    const r = await fetch('/api/prices', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    return {
      usd_eur: j.usd_eur ?? null,
      kc_usd_per_lb: j.kc_usd_per_lb ?? null,
      rc_usd_per_ton: j.rc_usd_per_ton ?? null,
    };
  } catch {
    return { usd_eur: null, kc_usd_per_lb: null, rc_usd_per_ton: null };
  }
}

/** Kontrakt-Optionen für das Formular */
export type ContractOpt = { value: string; label: string; yyyymm: string };

const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z'];
const KC_CYCLE = new Set(['H','K','N','U','Z']);            // Mar, May, Jul, Sep, Dec
const RC_CYCLE = new Set(['F','H','K','N','U','X']);        // Jan, Mar, May, Jul, Sep, Nov

/** N nächste Kontrakte liefern (Arabica = KC, Robusta = RC) */
export function nextContracts(species: 'arabica'|'robusta', count = 8): ContractOpt[] {
  const res: ContractOpt[] = [];
  const d = new Date(); d.setUTCDate(1);
  const isRC = species === 'robusta';
  while (res.length < count) {
    const m = d.getUTCMonth();            // 0..11
    const y = d.getUTCFullYear();         // yyyy
    const code = MONTH_CODES[m];          // F..Z
    const ok = isRC ? RC_CYCLE.has(code) : KC_CYCLE.has(code);
    if (ok) {
      const sym = isRC ? 'RC' : 'KC';
      const y1 = String(y).slice(-1);     // 2025 -> "5"
      const mm = String(m + 1).padStart(2, '0');
      const value = `${sym}${code}${y1}`; // z. B. KCZ5
      res.push({ value, label: `${mm}/${y} (${value})`, yyyymm: `${y}-${mm}` });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return res;
}
