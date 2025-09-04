export const LB_PER_KG = 2.2046226218
export type Prices = { usd_eur: number|null; kc_usd_per_lb: number|null; rc_usd_per_ton: number|null };

export function futuresMonths(species: 'arabica'|'robusta', from = new Date(), n = 8) {
  const all = ['F','G','H','J','K','M','N','Q','U','V','X','Z']; // Jan..Dec
  const use = species === 'arabica' ? ['H','K','N','U','Z'] : ['F','H','K','N','U','X']; // Coffee-C bzw. Robusta
  const res: { code:string; label:string }[] = [];
  let y = from.getUTCFullYear(), m = from.getUTCMonth(); // 0..11
  let count = 0;
  while (res.length < n && count < 36) {
    count++;
    const letter = all[m];
    if (use.includes(letter)) {
      const yy = (y % 10).toString(); // z.B. KCZ5
      const monthNum = (m+1).toString().padStart(2,'0');
      res.push({
        code: letter+yy,
        label: `${monthNum}/${y}` // „12/2025 (KCZ5)“ ergänzen im UI
      });
    }
    m++; if (m > 11) { m = 0; y++; }
  }
  return res;
}

export async function fetchEurPerKg(params: { root: FuturesRoot, month?: string, year?: number }) {
  const q = new URLSearchParams()
  q.set('root', params.root)
  if (params.month && params.year) { q.set('month', params.month); q.set('year', String(params.year)) }
  const rsp = await fetch(`/.netlify/functions/quote?${q.toString()}`)
  if (!rsp.ok) throw new Error('Preisabruf fehlgeschlagen')
  return (await rsp.json()) as { symbol:string; eur_per_kg:number; close:number; unit:string; fx:{ usd_to_eur:number } }
}

// Differential addieren (KC in c/lb, RM in USD/t) und nach EUR/kg bringen
export function applyDifferential(params: {
  root: FuturesRoot,
  futures_close: number, // KC: c/lb ; RM: USD/t
  usd_to_eur: number,
  diff_native: number    // KC: c/lb ; RM: USD/t
}) {
  if (params.root === 'KC') {
    const total_cents_per_lb = params.futures_close + params.diff_native
    const usd_per_lb = total_cents_per_lb / 100
    const eur_per_kg = usd_per_lb * LB_PER_KG * params.usd_to_eur
    return eur_per_kg
  } else {
    const total_usd_per_t = params.futures_close + params.diff_native
    const eur_per_kg = (total_usd_per_t / 1000) * params.usd_to_eur
    return eur_per_kg
  }
}
