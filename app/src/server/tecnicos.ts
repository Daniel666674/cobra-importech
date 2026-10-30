import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { orders, techMoves, technicians } from "@/db/schema";
import { fmt } from "@/lib/format";
import { AppError, copField, esc, logFeed, need, type Actor } from "./core";

export const TECH_PAY_METHODS = ["Efectivo", "Transferencia", "Nequi", "Daviplata"] as const;

/** Cartera de cada técnico: lo que se le debe por reparaciones entregadas menos lo que ya se le pagó. */
export async function techSummary(db: Db) {
  const [ts, ms, open] = await Promise.all([db.select().from(technicians), db.select().from(techMoves).where(eq(techMoves.voided, false)), db.select().from(orders).where(eq(orders.outcome, ""))]);
  return ts.map((t) => {
    const mine = ms.filter((m) => m.tech === t.id);
    const owed = mine.filter((m) => m.kind === "deuda").reduce((a, m) => a + m.amount, 0);
    const paid = mine.filter((m) => m.kind === "pago").reduce((a, m) => a + m.amount, 0);
    const pendingJobs = open.filter((o) => o.techId === t.id);
    return { ...t, owed, paid, balance: owed - paid, openJobs: pendingJobs.length, openFees: pendingJobs.reduce((a, o) => a + o.techFee, 0) };
  }).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

export async function techDetail(db: Db, id: string) {
  const [t] = await db.select().from(technicians).where(eq(technicians.id, id));
  if (!t) return null;
  const moves = await db.select().from(techMoves).where(eq(techMoves.tech, id)).orderBy(desc(techMoves.t), desc(techMoves.id));
  const live = moves.filter((m) => !m.voided);
  const balance = live.filter((m) => m.kind === "deuda").reduce((a, m) => a + m.amount, 0) - live.filter((m) => m.kind === "pago").reduce((a, m) => a + m.amount, 0);
  return { tech: t, moves, balance };
}

export async function saveTech(db: Db, a: Actor, id: string | null, raw: unknown) {
  need(a, "purchase");
  const v = z.object({ name: z.string().trim().min(2, "Escribe el nombre del técnico").max(60), phone: z.string().trim().max(30).default(""), active: z.boolean().default(true) }).parse(raw);
  if (id) { await db.update(technicians).set(v).where(eq(technicians.id, id)); return id; }
  const all = await db.select().from(technicians);
  if (all.some((x) => x.name.trim().toLowerCase() === v.name.toLowerCase())) throw new AppError("Ya existe un técnico con ese nombre", "conflict");
  const nid = "TC" + (all.reduce((m, x) => Math.max(m, +x.id.replace(/\D/g, "") || 0), 0) + 1);
  await db.insert(technicians).values({ id: nid, ...v, t: Date.now() });
  return nid;
}

export async function payTech(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "purchase");
  const v = z.object({ amount: copField("el valor del pago", 1), method: z.enum(TECH_PAY_METHODS).default("Efectivo"), note: z.string().trim().max(200).default("") }).parse(raw);
  const d = await techDetail(db, id);
  if (!d) throw new AppError("Técnico no encontrado", "notfound");
  await db.insert(techMoves).values({ tech: id, t: Date.now(), kind: "pago", amount: v.amount, ref: "", detail: v.note, method: v.method, by: a.name });
  await logFeed(db, a, "owner", "🧑‍🔧", `Pago al técnico <b>${esc(d.tech.name)}</b>: ${fmt(v.amount)} (${esc(v.method)}) · saldo ${fmt(d.balance - v.amount)} · ${esc(a.name)}`);
  return { balance: d.balance - v.amount };
}

export async function voidTechMove(db: Db, a: Actor, id: unknown) {
  need(a, "purchase");
  const n = z.coerce.number().int().parse(id);
  const [m] = await db.select().from(techMoves).where(eq(techMoves.id, n));
  if (!m) throw new AppError("Movimiento no encontrado", "notfound");
  if (m.kind !== "pago") throw new AppError("Solo se anulan pagos", "invalid");
  await db.update(techMoves).set({ voided: true }).where(eq(techMoves.id, n));
  await logFeed(db, a, "owner", "🧑‍🔧", `Pago #${n} a un técnico anulado por ${esc(a.name)}`);
}
