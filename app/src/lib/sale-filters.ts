import type { SaleLine } from "@/db/schema";
import { DAY } from "./format";
import { saleNet, saleVoid } from "./sales";

/** Día calendario de Bogotá (UTC−5) como YYYY-MM-DD. */
export const ymdBogota = (t: number) => new Date(t - 5 * 3600_000).toISOString().slice(0, 10);
export const ymdStart = (ymd: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 5, 0, 0) : null; };
export const addDays = (ymd: string, n: number) => { const t = ymdStart(ymd); return t == null ? ymd : ymdBogota(t + n * DAY + 6 * 3600_000); };

export type SaleFilters = {
  desde: string; hasta: string; vendedor: string; metodo: string; cat: string; estado: string; cliente: string; sede: string; q: string;
};
export const ESTADOS = [["pagada", "Pagadas"], ["pendiente", "Con saldo pendiente"], ["devuelta", "Devueltas"], ["historica", "Históricas"]] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export function parseSaleFilters(sp: Record<string, string | string[] | undefined>): SaleFilters {
  return { desde: ymd(one(sp.desde)), hasta: ymd(one(sp.hasta)), vendedor: one(sp.vendedor), metodo: one(sp.metodo), cat: one(sp.cat), estado: one(sp.estado), cliente: one(sp.cliente), sede: one(sp.sede), q: one(sp.q).toLowerCase().trim() };
}

export function filtersToQuery(f: Partial<SaleFilters>, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, String(v));
  return p.toString();
}

/** Rango de períodos rápidos (para botones): hoy, 7 días, 30 días, este mes, mes anterior, año. */
export function presetRange(key: string, now = Date.now()): { desde: string; hasta: string } | null {
  const today = ymdBogota(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (key) {
    case "hoy": return { desde: today, hasta: today };
    case "ayer": { const d = addDays(today, -1); return { desde: d, hasta: d }; }
    case "7d": return { desde: addDays(today, -6), hasta: today };
    case "30d": return { desde: addDays(today, -29), hasta: today };
    case "90d": return { desde: addDays(today, -89), hasta: today };
    case "mes": return { desde: `${y}-${pad(m)}-01`, hasta: today };
    case "mes_ant": { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; const last = addDays(`${y}-${pad(m)}-01`, -1); return { desde: `${py}-${pad(pm)}-01`, hasta: last }; }
    case "anio": return { desde: `${y}-01-01`, hasta: today };
    default: return null;
  }
}

type SaleLike = { branch?: string; t: number; by: string; method: string; payments: { method: string }[]; lines: SaleLine[]; disc: number; client: string | null; pending: number; mode: string; no: string; notes: string };
export type FilterCtx = { itemCat: Map<string, string>; clientText: Map<string, string> };

export const lineCat = (l: SaleLine, ctx: FilterCtx) => ctx.itemCat.get(l.item) ?? "Otros";

export function matchSale(s: SaleLike, f: SaleFilters, ctx: FilterCtx): boolean {
  const from = f.desde ? ymdStart(f.desde) : null, to = f.hasta ? ymdStart(f.hasta) : null;
  if (from != null && s.t < from) return false;
  if (to != null && s.t >= to + DAY) return false;
  if (f.vendedor && s.by !== f.vendedor) return false;
  if (f.cliente && s.client !== f.cliente) return false;
  if (f.sede && (s.branch ?? "") !== f.sede) return false;
  if (f.metodo && !(s.method === f.metodo || s.payments.some((p) => p.method === f.metodo))) return false;
  if (f.cat && !s.lines.some((l) => lineCat(l, ctx) === f.cat)) return false;
  if (f.estado) {
    const v = saleVoid(s);
    if (f.estado === "devuelta" && !v) return false;
    if (f.estado === "pendiente" && !(s.pending > 0 && !v)) return false;
    if (f.estado === "pagada" && (v || s.pending > 0 || s.mode === "historico")) return false;
    if (f.estado === "historica" && s.mode !== "historico") return false;
  }
  if (f.q && !`${s.no} ${ctx.clientText.get(s.client ?? "") ?? ""} ${s.lines.map((l) => l.name + l.serial + (l.supplier ?? "")).join(" ")}`.toLowerCase().includes(f.q)) return false;
  return true;
}

export const activeFilterCount = (f: SaleFilters) => [f.desde || f.hasta, f.vendedor, f.metodo, f.cat, f.estado, f.cliente, f.sede].filter(Boolean).length;
export const totalOf = (ss: SaleLike[]) => ss.filter((s) => !saleVoid(s)).reduce((a, s) => a + saleNet(s), 0);
