import { daysIn, isQty, stockQty } from "./items";
import { ymdStart } from "./sale-filters";

export const ORIGINS = ["Compra propia", "Retoma", "Tienda aliada", "Importación"] as const;
/** Agrupa el texto libre de «origen» en cuatro tipos. */
export const originOf = (src: string) => (/^trade-?in/i.test(src) ? "Retoma" : /^aliada/i.test(src) ? "Tienda aliada" : /importaci/i.test(src) ? "Importación" : "Compra propia");

export type ItemFilters = { origen: string; sede: string; pmin: string; pmax: string; desde: string; hasta: string; edad: string; marg: string };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const num = (v: string) => (/^\d+$/.test(v.replace(/\./g, "")) ? v.replace(/\./g, "") : "");
export const parseItemFilters = (sp: Record<string, string | string[] | undefined>): ItemFilters => ({ origen: one(sp.origen), sede: one(sp.sede), pmin: num(one(sp.pmin)), pmax: num(one(sp.pmax)), desde: ymd(one(sp.desde)), hasta: ymd(one(sp.hasta)), edad: one(sp.edad), marg: one(sp.marg) });

type ItemLike = { src: string; branch: string; price: number; cost: number; repairs: number; acq: number; track: string; qty: number; status: string };
export function matchItem(it: ItemLike, f: ItemFilters, now = Date.now()): boolean {
  if (f.origen && originOf(it.src) !== f.origen) return false;
  if (f.sede && it.branch !== f.sede) return false;
  if (f.pmin && it.price < +f.pmin) return false;
  if (f.pmax && it.price > +f.pmax) return false;
  const from = f.desde ? ymdStart(f.desde) : null, to = f.hasta ? ymdStart(f.hasta) : null;
  if (from != null && it.acq < from) return false;
  if (to != null && it.acq >= to + 86400_000) return false;
  if (f.edad) {
    const [a, b] = f.edad === "91+" ? [91, 1e9] : f.edad.split("-").map(Number);
    if (isQty(it as never) || daysIn(it as never, now) < a || daysIn(it as never, now) > b) return false;
  }
  if (f.marg) { // margen sobre el precio: «neg» (pierde), «bajo» (<10 %), «sin» (sin precio)
    const m = it.price > 0 ? (it.price - it.cost - it.repairs) / it.price : null;
    if (f.marg === "sin" && it.price > 0) return false;
    if (f.marg === "neg" && !(m != null && m < 0)) return false;
    if (f.marg === "bajo" && !(m != null && m >= 0 && m < 0.1)) return false;
  }
  return true;
}
export const stockValue = (it: ItemLike & { cost: number }) => stockQty(it as never) * it.cost;
