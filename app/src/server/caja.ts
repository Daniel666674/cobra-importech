import { and, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { allies, allyMoves, cashCloses, cashMoves, items, sales, type Payment } from "@/db/schema";
import { METHODS, feeFor, surchargeOf } from "@/lib/catalog";
import { DAY, fmt } from "@/lib/format";
import { saleVoid } from "@/lib/sales";
import { AppError, copField, esc, logFeed, need, type Actor } from "./core";
import { settings } from "@/db/schema";

/** Colombia no tiene horario de verano: el día va de 00:00 a 24:00 hora de Bogotá (UTC−5). */
export function dayRange(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new AppError("Fecha no válida", "invalid");
  const from = Date.UTC(+m[1], +m[2] - 1, +m[3], 5, 0, 0);
  return { from, to: from + DAY };
}
export const bogotaToday = (now = Date.now()) => new Date(now - 5 * 3600_000).toISOString().slice(0, 10);

const NOT_MONEY = new Set(["Retoma", "Abono previo"]);
export const CASH = "Efectivo";

export type MoneyIn = { when: number; method: string; amount: number; ref: string; what: string; href: string };

/** Todo lo que pasó con el dinero en un día: lo que entró por ventas, abonos y otros ingresos, y lo que salió. */
export async function cajaDay(db: Db, ymd: string) {
  const { from, to } = dayRange(ymd);
  const inR = (t: number) => t >= from && t < to;
  const [ss, its, moves, allyPays, closes] = await Promise.all([
    db.select().from(sales),
    db.select({ id: items.id, name: items.name, hold: items.hold }).from(items),
    db.select().from(cashMoves).where(and(gte(cashMoves.t, from), lt(cashMoves.t, to))).orderBy(cashMoves.t),
    db.select({ m: allyMoves, a: allies.name }).from(allyMoves).innerJoin(allies, eq(allyMoves.ally, allies.id)).where(and(eq(allyMoves.kind, "pago"), eq(allyMoves.voided, false), gte(allyMoves.t, from), lt(allyMoves.t, to))),
    db.select().from(cashCloses).where(eq(cashCloses.day, ymd)).orderBy(desc(cashCloses.t)),
  ]);
  const ins: MoneyIn[] = [];
  for (const s of ss) {
    if (saleVoid(s) && !s.payments.length) continue;
    for (const p of s.payments as Payment[]) {
      if (NOT_MONEY.has(p.method)) continue;
      const when = p.t ?? s.t;
      if (inR(when)) ins.push({ when, method: p.method, amount: p.amount + (p.fee ?? 0), ref: s.no, what: p.t ? "Pago de saldo" : "Venta", href: `/ventas/${s.id}` });
    }
    for (const h of s.holdPays ?? []) if (inR(h.t)) ins.push({ when: h.t, method: h.method, amount: h.amount, ref: h.no, what: "Abono de apartado", href: `/ventas/${s.id}` });
  }
  for (const it of its) for (const h of it.hold?.pays ?? []) if (inR(h.t)) ins.push({ when: h.t, method: h.method, amount: h.amount, ref: h.no, what: "Abono de apartado", href: `/apartados/${it.id}` });
  const extra = moves.filter((m) => !m.voided);
  for (const m of extra.filter((x) => x.kind === "ingreso")) ins.push({ when: m.t, method: m.method, amount: m.amount, ref: `#${m.id}`, what: m.concept || "Ingreso", href: "" });
  const outs = [
    ...extra.filter((x) => x.kind !== "ingreso").map((m) => ({ when: m.t, method: m.method, amount: m.amount, what: `${m.kind === "gasto" ? "Gasto" : "Retiro"}: ${m.concept}`, id: m.id })),
    ...allyPays.map(({ m, a }) => ({ when: m.t, method: m.method, amount: m.amount, what: `Pago a tienda aliada ${a}`, id: 0 })),
  ];
  ins.sort((a, b) => a.when - b.when);
  const byMethod = new Map<string, { in: number; out: number }>();
  const slot = (m: string) => byMethod.get(m) ?? byMethod.set(m, { in: 0, out: 0 }).get(m)!;
  for (const x of ins) slot(x.method).in += x.amount;
  for (const x of outs) slot(x.method).out += x.amount;
  const cash = byMethod.get(CASH) ?? { in: 0, out: 0 };
  return { ymd, ins, outs, moves, byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })), expected: cash.in - cash.out, totalIn: ins.reduce((a, x) => a + x.amount, 0), closes };
}

const moveInput = z.object({
  kind: z.enum(["gasto", "retiro", "ingreso"]),
  amount: copField("el valor", 1),
  concept: z.string().trim().min(2, "Escribe de qué es").max(120),
  method: z.string().trim().default(CASH),
  day: z.string().optional(),
});
export async function addCashMove(db: Db, a: Actor, raw: unknown) {
  need(a, "sell");
  const v = moveInput.parse(raw);
  let t = Date.now();
  if (v.day && v.day !== bogotaToday()) { const r = dayRange(v.day); t = Math.min(r.from + 12 * 3600_000, Date.now()); }
  await db.insert(cashMoves).values({ t, kind: v.kind, method: v.method, amount: v.amount, concept: v.concept, by: a.name });
  await logFeed(db, a, "owner", "🧮", `Caja: ${v.kind} de <b>${fmt(v.amount)}</b> (${esc(v.concept)}) · ${esc(a.name)}`);
}
export async function voidCashMove(db: Db, a: Actor, id: unknown) {
  need(a, "sell");
  const n = z.coerce.number().int().parse(id);
  await db.update(cashMoves).set({ voided: true }).where(eq(cashMoves.id, n));
  await logFeed(db, a, "owner", "🧮", `Caja: movimiento #${n} anulado por ${esc(a.name)}`);
}

export async function closeDay(db: Db, a: Actor, raw: unknown) {
  need(a, "sell");
  const v = z.object({ day: z.string(), counted: copField("el efectivo contado", 0), notes: z.string().trim().max(300).default("") }).parse(raw);
  const d = await cajaDay(db, v.day);
  await db.insert(cashCloses).values({ day: v.day, t: Date.now(), by: a.name, expected: d.expected, counted: v.counted, notes: v.notes });
  const diff = v.counted - d.expected;
  await logFeed(db, a, "owner", "🧮", `Cierre de caja ${v.day}: esperado ${fmt(d.expected)}, contado ${fmt(v.counted)} · ${diff === 0 ? "cuadra" : `<b>${diff > 0 ? "sobran" : "faltan"} ${fmt(Math.abs(diff))}</b>`} · ${esc(a.name)}`);
  return { expected: d.expected, diff };
}

/* ---------- Por cobrar: saldos pendientes de ventas ---------- */
export async function receivables(db: Db) {
  const ss = (await db.select().from(sales)).filter((s) => s.pending > 0 && !saleVoid(s));
  return ss.sort((a, b) => a.t - b.t);
}

export async function payPending(db: Db, a: Actor, saleId: string, raw: unknown) {
  need(a, "sell");
  const v = z.object({ amount: copField("el valor del pago", 1), method: z.enum(METHODS) }).parse(raw);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!s) throw new AppError("Venta no encontrada", "notfound");
    if (v.amount > s.pending) throw new AppError(`El pago supera el saldo pendiente (${fmt(s.pending)})`, "invalid");
    const [cfg] = await tx.select().from(settings).limit(1);
    const fee = feeFor(surchargeOf(cfg, v.method), v.amount);
    const pay: Payment = { method: v.method, amount: v.amount, t: Date.now(), ...(fee ? { fee } : {}) };
    const pending = s.pending - v.amount;
    await tx.update(sales).set({ payments: [...s.payments, pay], pending, surcharge: s.surcharge + fee, method: s.payments.length ? "Mixto" : v.method }).where(eq(sales.id, saleId));
    await logFeed(tx, a, "owner", "💵", `Pago de <b>${fmt(v.amount)}</b> en ${esc(s.no)} (${esc(v.method)}) · ${pending ? `saldo ${fmt(pending)}` : "saldado"} · ${esc(a.name)}`);
    return { pending };
  });
}
