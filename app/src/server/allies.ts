import { asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { allies, allyMoves, items, sales } from "@/db/schema";
import { fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { lineNet } from "@/lib/sales";
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

/** Registra un pago a la tienda aliada. No puede superar lo que se le debe. */
export async function payAlly(db: Db, a: Actor, allyId: string, raw: unknown) {
  need(a, "purchase");
  const v = z.object({ amount: z.coerce.number().int().min(1, "Escribe el valor del pago"), note: z.string().trim().max(200).default("") }).parse(raw);
  return db.transaction(async (tx) => {
    const [x] = await tx.select().from(allies).where(eq(allies.id, allyId)).for("update");
    if (!x) throw new AppError("Tienda aliada no encontrada", "notfound");
    const bal = balanceOf(await tx.select().from(allyMoves).where(eq(allyMoves.ally, allyId)));
    if (v.amount > bal) throw new AppError(`El pago supera lo que se le debe (${fmt(bal)})`, "invalid");
    await tx.insert(allyMoves).values({ ally: allyId, t: Date.now(), kind: "pago", amount: v.amount, ref: "", detail: v.note || "Pago", by: a.name });
    await logFeed(tx, a, "owner", "💸", `Pago a <b>${esc(x.name)}</b>: ${fmt(v.amount)} · ${esc(a.name)}`);
    return bal - v.amount;
  });
}

const balanceOf = (moves: { kind: string; amount: number }[]) => moves.reduce((s, m) => s + (m.kind === "pago" ? -m.amount : m.amount), 0);

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
    return {
      ...x,
      balance: balanceOf(m),
      paid: m.filter((y) => y.kind === "pago").reduce((s, y) => s + y.amount, 0),
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
