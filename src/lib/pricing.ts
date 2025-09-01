export type FuturesRoot = 'KC' | 'RM'   // RM = Robusta bei Stooq (ICE: RC)
export const LB_PER_KG = 2.2046226218

export function monthsFor(root: FuturesRoot) {
  return root === 'KC'
    ? [{code:'H',label:'Mar'},{code:'K',label:'May'},{code:'N',label:'Jul'},{code:'U',label:'Sep'},{code:'Z',label:'Dec'}]
    : [{code:'F',label:'Jan'},{code:'H',label:'Mar'},{code:'K',label:'May'},{code:'N',label:'Jul'},{code:'U',label:'Sep'},{code:'X',label:'Nov'}]
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
