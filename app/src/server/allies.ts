import { asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { allies, allyMoves, items, sales } from "@/db/schema";
import { fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { lineNet } from "@/lib/sales";
import { PAY_METHODS } from "@/lib/cartera";
import { AppError, esc, logFeed, need, nextCounter, type Actor } from "./core";

export const ALLY_MODES = { consignacion: "Se le paga cuando se vende (consignación)", compra: "Se le debe desde que se recibe (compra)" } as const;

export const allyInput = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la tienda aliada").max(80),
  contact: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(30).default(""),
  doc: z.string().trim().max(30).default(""),
  mode: z.enum(["consignacion", "compra"]).default("consignacion"),
  notes: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
  terms: z.coerce.number().int().min(0).max(180).default(0),
  bank: z.string().trim().max(120).default(""),
  /** Fecha acordada de pago (ms, mediodía local) o null. */
  due: z.coerce.number().int().min(Date.UTC(2020, 0, 1)).max(Date.UTC(2100, 0, 1)).nullable().default(null),
});

export async function saveAlly(db: Db, a: Actor, id: string | null, raw: unknown) {
  need(a, "purchase");
  const v = allyInput.parse(raw);
  if (id) {
    const [x] = await db.select().from(allies).where(eq(allies.id, id));
    if (!x) throw new AppError("Tienda aliada no encontrada", "notfound");
    await db.update(allies).set(v).where(eq(allies.id, id));
    return id;
  }
  const nid = "A" + (await nextCounter(db, "ally"));
  await db.insert(allies).values({ id: nid, ...v, t: Date.now() });
  await logFeed(db, a, "owner", "🤝", `Nueva tienda aliada: <b>${esc(v.name)}</b> · ${esc(a.name)}`);
  return nid;
}

export { PAY_METHODS };

export const payInput = z.object({
  amount: z.coerce.number().int().min(1, "Escribe el valor del pago").max(1e10),
  method: z.enum(PAY_METHODS).default("Transferencia Bancolombia"),
  ref: z.string().trim().max(60).default(""),
  note: z.string().trim().max(200).default(""),
  /** Fecha del pago (puede ser anterior: pagos que se registran después). */
  t: z.coerce.number().int().min(Date.UTC(2020, 0, 1)).max(Date.now() + 86_400_000).optional(),
  /** Pagar más de lo que se debe deja un anticipo (saldo a favor) que se cruza con las próximas deudas. */
  advance: z.boolean().default(false),
});

/**
 * Registra un pago a la aliada con su comprobante de egreso (CE-0001…). Si supera lo que se debe, la diferencia
 * queda como anticipo (saldo a favor) y se cruza sola con lo que se le deba después. Se pueden hacer varios.
 */
export async function payAlly(db: Db, a: Actor, allyId: string, raw: unknown) {
  need(a, "purchase");
  const v = payInput.parse(raw);
  return db.transaction(async (tx) => {
    const [x] = await tx.select().from(allies).where(eq(allies.id, allyId)).for("update");
    if (!x) throw new AppError("Tienda aliada no encontrada", "notfound");
    const bal = balanceOf(await tx.select().from(allyMoves).where(eq(allyMoves.ally, allyId)));
    const over = v.amount - Math.max(0, bal);
    if (over > 0 && !v.advance) throw new AppError(`El pago supera lo que se le debe (${fmt(Math.max(0, bal))}). Marca «Es un anticipo» para dejar ${fmt(over)} a favor de la tienda.`, "invalid");
    const no = "CE-" + String(await nextCounter(tx, "egreso")).padStart(4, "0");
    const kind = bal <= 0 ? "Anticipo" : over > 0 ? `Abono ${fmt(bal)} + anticipo ${fmt(over)}` : v.amount === bal ? "Pago total" : "Abono";
    await tx.insert(allyMoves).values({ ally: allyId, t: v.t ?? Date.now(), kind: "pago", amount: v.amount, ref: v.ref, detail: [kind, v.note].filter(Boolean).join(" · "), by: a.name, method: v.method, no });
    await logFeed(tx, a, "owner", "💸", `${kind} a <b>${esc(x.name)}</b>: ${fmt(v.amount)} · ${esc(v.method)} · ${no} · ${esc(a.name)}`);
    return { no, balance: bal - v.amount };
  });
}

/** Anula un pago mal registrado (solo la propietaria). Queda en la historia tachado y deja de contar. */
export async function voidAllyPay(db: Db, a: Actor, moveId: number, reason: string) {
  need(a, "purchase");
  if (!a.perms.includes("approve")) throw new AppError("Solo la propietaria puede anular pagos", "forbidden");
  const why = z.string().trim().min(3, "Escribe el motivo de la anulación").max(200).parse(reason);
  const [m] = await db.select().from(allyMoves).where(eq(allyMoves.id, moveId));
  if (!m || m.kind !== "pago" || m.voided) throw new AppError("Pago no encontrado o ya anulado", "conflict");
  await db.update(allyMoves).set({ voided: true, detail: `${m.detail} · ANULADO: ${why}` }).where(eq(allyMoves.id, moveId));
  await logFeed(db, a, "owner", "↩️", `Pago ${m.no} anulado (${fmt(m.amount)}): ${esc(why)} · ${esc(a.name)}`);
}

const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime(); };

type Move = { kind: string; amount: number; t: number; voided?: boolean };
/** Saldo: positivo = se le debe a la aliada; negativo = anticipo (saldo a favor de nosotros). */
const balanceOf = (moves: Move[]) => moves.reduce((s, m) => (m.voided ? s : s + (m.kind === "pago" ? -m.amount : m.amount)), 0);

/**
 * Cartera por edades (como se maneja en Colombia): los pagos y devoluciones se aplican a las deudas más antiguas
 * primero; lo que queda se clasifica por días desde que nació la deuda y se marca vencido si pasa el plazo.
 */
export function aging(moves: Move[], terms: number, now = Date.now(), due: number | null = null) {
  const debts = moves.filter((m) => !m.voided && m.kind === "deuda" && m.amount > 0).sort((x, y) => x.t - y.t).map((m) => ({ t: m.t, left: m.amount }));
  let credit = moves.reduce((s, m) => s + (m.voided ? 0 : m.kind === "pago" ? m.amount : m.kind === "deuda" && m.amount < 0 ? -m.amount : 0), 0);
  for (const d of debts) { const use = Math.min(credit, d.left); d.left -= use; credit -= use; }
  const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, overdue: 0, oldest: 0 };
  for (const d of debts) {
    if (!d.left) continue;
    const days = Math.floor((now - d.t) / 864e5);
    if (days <= 30) b.d0_30 += d.left; else if (days <= 60) b.d31_60 += d.left; else if (days <= 90) b.d61_90 += d.left; else b.d90 += d.left;
    // Con fecha acordada: todo lo pendiente vence ese día (al final del día). Sin fecha: por el plazo en días.
    if (due != null ? now > endOfDay(due) : days > terms) b.overdue += d.left;
    b.oldest = Math.max(b.oldest, days);
  }
  return { ...b, advance: credit };
}

type SoldLine = { sale: string; no: string; t: number; name: string; serial: string; qty: number; revenue: number; cost: number };

/** Ventas de productos de aliadas: lo que se cobró (neto de descuento y devoluciones), lo que se le paga y lo que gana la tienda. */
async function soldLines(db: Db) {
  const out = new Map<string, SoldLine[]>();
  for (const s of await db.select().from(sales).orderBy(desc(sales.t))) {
    for (const l of s.lines) {
      const q = lineNet(l);
      if (!l.ally || q <= 0) continue;
      const row = { sale: s.id, no: s.no, t: s.t, name: l.name, serial: l.serial, qty: q, revenue: Math.round(q * l.price * (1 - (s.disc || 0) / 100)), cost: q * l.cost };
      out.set(l.ally, [...(out.get(l.ally) ?? []), row]);
    }
  }
  return out;
}

export async function allySummary(db: Db) {
  const [list, moves, its, sold] = await Promise.all([
    db.select().from(allies).orderBy(asc(allies.name)),
    db.select().from(allyMoves),
    db.select().from(items).where(ne(items.ally, "")),
    soldLines(db),
  ]);
  return list.map((x) => {
    const m = moves.filter((y) => y.ally === x.id);
    const stock = its.filter((i) => i.ally === x.id && i.status !== "Vendido" && (i.track !== "qty" || i.qty > 0));
    const sl = sold.get(x.id) ?? [];
    const revenue = sl.reduce((s, l) => s + l.revenue, 0), cost = sl.reduce((s, l) => s + l.cost, 0);
    const bal = balanceOf(m), age = aging(m, x.terms, Date.now(), x.due);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return {
      ...x,
      balance: Math.max(0, bal),
      advance: Math.max(0, -bal),
      age,
      paid: m.filter((y) => y.kind === "pago" && !y.voided).reduce((s, y) => s + y.amount, 0),
      paidMonth: m.filter((y) => y.kind === "pago" && !y.voided && y.t >= monthStart.getTime()).reduce((s, y) => s + y.amount, 0),
      lastPay: m.filter((y) => y.kind === "pago" && !y.voided).reduce((t, y) => Math.max(t, y.t), 0),
      stockUnits: stock.reduce((s, i) => s + (i.track === "qty" ? i.qty : 1), 0),
      stockCost: stock.reduce((s, i) => s + i.cost * (i.track === "qty" ? i.qty : 1), 0),
      stockPrice: stock.reduce((s, i) => s + i.price * (i.track === "qty" ? i.qty : 1), 0),
      soldUnits: sl.reduce((s, l) => s + l.qty, 0), revenue, cost, earned: revenue - cost,
    };
  });
}

export async function allyDetail(db: Db, id: string) {
  const [x] = await db.select().from(allies).where(eq(allies.id, id));
  if (!x) return null;
  const [summary] = (await allySummary(db)).filter((s) => s.id === id);
  const moves = await db.select().from(allyMoves).where(eq(allyMoves.ally, id)).orderBy(desc(allyMoves.t), desc(allyMoves.id));
  const stock = (await db.select().from(items).where(eq(items.ally, id)))
    .filter((i) => i.status !== "Vendido" && (i.track !== "qty" || i.qty > 0))
    .map((i) => ({ id: i.id, name: uname(i), serial: i.serial, status: i.status, qty: i.track === "qty" ? i.qty : 1, cost: i.cost, price: i.price, acq: i.acq }));
  const sold = (await soldLines(db)).get(id) ?? [];
  return { ally: x, summary, moves, stock, sold };
}

export type PayFilter = { from?: number | null; to?: number | null; ally?: string; method?: string };
/** Historial de todos los pagos a aliadas (abonos y anticipos), con filtros por fecha, tienda y forma de pago. */
export async function paymentsLog(db: Db, f: PayFilter = {}) {
  const [moves, list] = await Promise.all([db.select().from(allyMoves).where(eq(allyMoves.kind, "pago")).orderBy(desc(allyMoves.t), desc(allyMoves.id)), db.select().from(allies)]);
  const names = new Map(list.map((x) => [x.id, x.name]));
  const to = f.to != null ? (() => { const d = new Date(f.to!); d.setHours(23, 59, 59, 999); return d.getTime(); })() : null;
  const from = f.from != null ? (() => { const d = new Date(f.from!); d.setHours(0, 0, 0, 0); return d.getTime(); })() : null;
  const rows = moves
    .filter((m) => (from == null || m.t >= from) && (to == null || m.t <= to) && (!f.ally || m.ally === f.ally) && (!f.method || m.method === f.method))
    .map((m) => ({ ...m, allyName: names.get(m.ally) ?? m.ally }));
  const valid = rows.filter((m) => !m.voided);
  const byMethod = new Map<string, number>();
  for (const m of valid) byMethod.set(m.method || "—", (byMethod.get(m.method || "—") ?? 0) + m.amount);
  return { rows, total: valid.reduce((s, m) => s + m.amount, 0), count: valid.length, voided: rows.length - valid.length, byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]) };
}
