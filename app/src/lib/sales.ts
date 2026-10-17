import { DAY } from "./format";
import type { SaleLine } from "@/db/schema";

export const lineNet = (l: Pick<SaleLine, "qty" | "ret">) => l.qty - (l.ret || 0);
export const saleNet = (s: { lines: SaleLine[]; disc: number }) =>
  Math.round(s.lines.reduce((a, l) => a + lineNet(l) * l.price, 0) * (1 - (s.disc || 0) / 100));
export const saleCost = (s: { lines: SaleLine[] }) => s.lines.reduce((a, l) => a + lineNet(l) * l.cost, 0);
export const saleMargin = (s: { lines: SaleLine[]; disc: number }) => saleNet(s) - saleCost(s);
export const saleVoid = (s: { lines: SaleLine[] }) => s.lines.every((l) => lineNet(l) <= 0);
export const warrEnd = (t: number, l: Pick<SaleLine, "warr">) => t + l.warr * 30.4 * DAY;
export const warrLeft = (t: number, l: Pick<SaleLine, "warr">, now = Date.now()) =>
  Math.ceil((warrEnd(t, l) - now) / DAY);

export type PosInputLine = { price: number; cost: number; qty: number };
export type DiscountInput = { type: "pct" | "cop"; value: number };

/** Totales de una venta: subtotal, descuento (en % y en pesos), total, costo y saldo por cobrar. */
export function posTotals(lines: PosInputLine[], disc: DiscountInput, prepaid = 0) {
  const sub = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const dv = Math.max(0, +disc.value || 0);
  const pct = disc.type === "pct" ? Math.min(100, dv) : sub ? Math.min(100, (dv / sub) * 100) : 0;
  const total = Math.round(sub * (1 - pct / 100));
  const cost = lines.reduce((a, l) => a + l.cost * l.qty, 0);
  const paid = Math.min(prepaid, total);
  return { sub, pct, total, discAmt: sub - total, cost, prepaid: paid, due: total - paid };
}
