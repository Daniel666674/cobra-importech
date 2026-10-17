export type Landed = { usd: number; qty: number; trm: number; freight: number; arancel: number; iva: number };
/** Costo real en pesos de una compra de importación (USD × TRM + flete + aranceles + IVA). */
export function landed(po: Landed) {
  const base = po.usd * po.trm;
  const fr = (base * po.freight) / 100;
  const ar = ((base + fr) * po.arancel) / 100;
  const iv = ((base + fr + ar) * po.iva) / 100;
  const unit = base + fr + ar + iv;
  return { base, fr, ar, iv, unit, total: unit * po.qty };
}
