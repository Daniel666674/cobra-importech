import { DAY, daysAgo } from "./format";

export type ItemLike = {
  name: string; spec: string; track: string; qty: number; status: string; acq: number;
  cost: number; price: number; repairs: number;
};
export const uname = (it: Pick<ItemLike, "name" | "spec">) => it.name + (it.spec ? " · " + it.spec : "");
export const isQty = (it: Pick<ItemLike, "track">) => it.track === "qty";
export const stockQty = (it: Pick<ItemLike, "track" | "qty" | "status">) => (isQty(it) ? it.qty : it.status === "Vendido" ? 0 : 1);
export const inStock = (it: Pick<ItemLike, "track" | "qty" | "status">) => stockQty(it) > 0;
/** Se puede vender: con existencias / en vitrina y sin aprobación pendiente de producto nuevo. */
export const isAvail = (it: Pick<ItemLike, "track" | "qty" | "status"> & { approval?: { kind: string } | null }) =>
  it.approval?.kind !== "alta" && (isQty(it) ? it.qty > 0 : it.status === "En vitrina");
export const itemState = (it: Pick<ItemLike, "track" | "qty" | "status">) => (isQty(it) ? (it.qty <= 0 ? "Agotado" : "En vitrina") : it.status);
export const daysIn = (it: Pick<ItemLike, "acq">, now = Date.now()) => daysAgo(it.acq, now);
export const margin = (it: Pick<ItemLike, "price" | "cost" | "repairs">) => it.price - it.cost - (it.repairs || 0);
export const marginPct = (it: Pick<ItemLike, "price" | "cost" | "repairs">) => (it.price ? Math.round((margin(it) / it.price) * 100) : 0);
export const ST_CHIP: Record<string, string> = {
  "En vitrina": "ok", Apartado: "info", Vendido: "gray", "En taller": "warn", "En revisión": "pur", Agotado: "bad",
};
export { DAY };
