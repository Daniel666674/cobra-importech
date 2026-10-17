import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { clients, holdHistory, items, sales, settings, type Hold, type Payment, type SaleLine } from "@/db/schema";
import { METHODS } from "@/lib/catalog";
import { DAY, fmt } from "@/lib/format";
import { holdBal, holdMin } from "@/lib/hold";
import { isAvail, isQty, uname } from "@/lib/items";
import { lineNet, posTotals, saleNet } from "@/lib/sales";
import { AppError, addEvent, can, esc, logFeed, need, nextCounter, type Actor } from "./core";

const method = z.enum(METHODS);
const clientNew = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del cliente nuevo"),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  doc: z.string().trim().default(""),
});

export const saleInput = z.object({
  lines: z.array(z.object({ item: z.string(), qty: z.coerce.number().int().min(1) })).min(1, "Agrega al menos un producto"),
  client: z.string().nullable().default(null),
  newClient: clientNew.nullable().default(null),
  discount: z.object({ type: z.enum(["pct", "cop"]), value: z.coerce.number().min(0) }).default({ type: "pct", value: 0 }),
  discReason: z.string().trim().default(""),
  payments: z.array(z.object({ method, amount: z.coerce.number().int().min(1) })).default([]),
  notes: z.string().trim().default(""),
  cash: z.coerce.number().int().min(0).default(0),
  holdItem: z.string().nullable().default(null),
});
export type SaleInput = z.infer<typeof saleInput>;

export async function ensureClient(db: Db, client: string | null, nc: z.infer<typeof clientNew> | null) {
  if (client) {
    const [c] = await db.select().from(clients).where(eq(clients.id, client));
    if (!c) throw new AppError("Cliente no encontrado", "notfound");
    return c;
  }
  if (!nc) return null;
  const id = "c" + (await nextCounter(db, "client"));
  const row = { id, name: nc.name, phone: nc.phone, email: nc.email, doc: nc.doc, notes: "" };
  await db.insert(clients).values(row);
  return row;
}

async function getSettings(db: Db) {
  const [s] = await db.select().from(settings).limit(1);
  if (!s) throw new AppError("Falta la configuración del negocio", "conflict");
  return s;
}

/** Registra una venta de contado (o el cierre de un apartado). Toda la operación es atómica. */
export async function createSale(db: Db, a: Actor, raw: unknown) {
  need(a, "sell");
  const input = saleInput.parse(raw);
  const cfg = await getSettings(db);
  return db.transaction(async (tx) => {
    const ids = input.lines.map((l) => l.item);
    if (new Set(ids).size !== ids.length) throw new AppError("Hay productos repetidos en la venta", "invalid");
    const rows = await tx.select().from(items).where(inArray(items.id, ids)).for("update");
    if (rows.length !== ids.length) throw new AppError("Un producto de la venta ya no existe", "notfound");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines = input.lines.map((l) => ({ it: byId.get(l.item)!, qty: l.qty }));
    for (const { it, qty } of lines) {
      if (!isAvail(it) && it.id !== input.holdItem) throw new AppError(`«${uname(it)}» ya no está disponible`, "conflict");
      if (isQty(it) ? qty > it.qty : qty !== 1) throw new AppError(isQty(it) ? `Solo hay ${it.qty} de «${it.name}»` : `«${uname(it)}» es un equipo único`, "conflict");
    }
    let hold: Hold | null = null;
    if (input.holdItem) {
      const hi = byId.get(input.holdItem);
      if (!hi?.hold) throw new AppError("El apartado ya no existe", "conflict");
      hold = hi.hold;
    }
    const T = posTotals(lines.map(({ it, qty }) => ({ price: it.price, cost: it.cost, qty })), input.discount, hold ? hold.abono : 0);
    if (T.pct > 0 && !input.discReason) throw new AppError("Indica el motivo del descuento", "invalid");
    if (T.pct > cfg.maxDisc && !can(a, "discount")) throw new AppError(`El descuento supera el límite del ${cfg.maxDisc}%: pide autorización`, "forbidden");
    if (T.total < T.cost && !can(a, "discount")) throw new AppError("El total queda por debajo del costo: pide autorización", "forbidden");
    const pays: Payment[] = input.payments;
    const sum = pays.reduce((s, p) => s + p.amount, 0);
    if (T.due > 0 && sum !== T.due) throw new AppError(sum < T.due ? `Falta asignar ${fmt(T.due - sum)} en los pagos` : `Los pagos superan el total por ${fmt(sum - T.due)}`, "invalid");
    if (T.due === 0 && pays.length) throw new AppError("Con el apartado pagado completo no hay nada por cobrar", "invalid");

    const client = await ensureClient(tx, input.client ?? hold?.client ?? null, input.newClient);
    const n = await nextCounter(tx, "sale");
    const inv = await nextCounter(tx, "invoice");
    const id = "S-" + String(n).padStart(4, "0");
    const no = "FV-" + inv;
    const saleLines: SaleLine[] = lines.map(({ it, qty }) => ({
      item: it.id, name: uname(it), color: it.color, cond: it.cond, serial: it.serial, qty, price: it.price,
      cost: it.cost + (isQty(it) ? 0 : it.repairs || 0), warr: it.warr, ret: 0,
    }));
    const row = {
      id, no, t: Date.now(), client: client?.id ?? null, by: a.id,
      method: pays.length > 1 ? "Mixto" : pays[0]?.method ?? "Abono previo", mode: "contado", payments: pays, lines: saleLines,
      disc: +T.pct.toFixed(4), total: 0, prepaid: T.prepaid, notes: input.notes, discReason: input.discReason,
      cash: pays.length === 1 && pays[0].method === "Efectivo" && input.cash >= pays[0].amount && input.cash > 0 ? { given: input.cash, change: input.cash - pays[0].amount } : null,
      holdPays: hold ? hold.pays.map((y) => ({ t: y.t, amount: y.amount, method: y.method, no: y.no })) : null,
    };
    row.total = saleNet(row);
    await tx.insert(sales).values(row);

    if (input.holdItem) {
      const hi = byId.get(input.holdItem)!;
      await tx.insert(holdHistory).values({ t: Date.now(), item: uname(hi), client: client?.name ?? "—", abono: hold!.abono, outcome: "Convertido en venta " + no });
    }
    for (const { it, qty } of lines) {
      if (isQty(it)) {
        await tx.update(items).set({ qty: it.qty - qty }).where(eq(items.id, it.id));
        await addEvent(tx, it.id, a, "Vendido ×" + qty, `${client?.name ?? "Mostrador"} · ${no}`, "ok");
        if (it.min && it.qty - qty <= it.min)
          await logFeed(tx, a, "reorder", "📈", `Stock bajo: <b>${esc(it.name)}</b> quedó con ${it.qty - qty} unidades (mínimo ${it.min})`);
      } else {
        await tx.update(items).set({ status: "Vendido", hold: null }).where(eq(items.id, it.id));
        await addEvent(tx, it.id, a, "Vendido", `${client?.name ?? "Mostrador"} · ${row.method} · ${no}`, "ok");
        await addEvent(tx, it.id, a, "Garantía activada", it.warr + " meses", "ok");
      }
    }
    await logFeed(tx, a, "fe", "🧾", `Comprobante <b>${no}</b> emitido · ${fmt(row.total)}${client ? " · " + esc(client.name) : ""}`);
    if (T.pct > cfg.maxDisc) await logFeed(tx, a, "owner", "🚨", `Alerta al dueño: descuento de <b>${T.pct.toFixed(1)}%</b> en ${no} (${esc(input.discReason)}) · ${esc(a.name)}`);
    if (T.total < T.cost) await logFeed(tx, a, "owner", "🚨", `Alerta al dueño: <b>venta bajo costo</b> en ${no} (${esc(a.name)})`);
    return row;
  });
}

export const holdInput = z.object({
  item: z.string(),
  client: z.string().nullable().default(null),
  newClient: clientNew.nullable().default(null),
  abono: z.coerce.number().int().min(1),
  method,
  days: z.coerce.number().int().min(1).max(60).optional(),
  discReason: z.string().default(""),
});

export async function createHold(db: Db, a: Actor, raw: unknown) {
  need(a, "credit");
  const input = holdInput.parse(raw);
  const cfg = await getSettings(db);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, input.item)).for("update");
    if (!it) throw new AppError("Producto no encontrado", "notfound");
    if (isQty(it)) throw new AppError("El apartado es para un solo equipo (no accesorios por cantidad)", "invalid");
    if (it.status !== "En vitrina") throw new AppError("Este equipo no está disponible para apartar", "conflict");
    const client = await ensureClient(tx, input.client, input.newClient);
    if (!client) throw new AppError("Elige o crea el cliente para apartar", "invalid");
    const min = holdMin(it.price, cfg.apartadoMinPct);
    if (input.abono < min) throw new AppError(`El abono mínimo es ${fmt(min)} (${cfg.apartadoMinPct}%)`, "invalid");
    if (input.abono >= it.price) throw new AppError("El abono cubre el total: registra una venta normal", "invalid");
    const now = Date.now();
    const days = input.days ?? cfg.holdDays;
    const no = "RA-" + (1000 + (await nextCounter(tx, "hold")));
    const rb = "RB-" + (1000 + (await nextCounter(tx, "receipt")));
    const hold: Hold = { client: client.id, abono: input.abono, expires: now + days * DAY, t: now, by: a.id, no, pays: [{ t: now, amount: input.abono, method: input.method, by: a.id, no: rb }] };
    await tx.update(items).set({ status: "Apartado", hold }).where(eq(items.id, it.id));
    await addEvent(tx, it.id, a, "Apartado", `${client.name} · abono ${fmt(input.abono)} · vence en ${days} días`, "warn");
    await logFeed(tx, a, "apartado", "🔒", `Apartado de <b>${esc(client.name)}</b>: <b>${esc(uname(it))}</b> con abono de ${fmt(input.abono)}`);
    return { itemId: it.id, hold };
  });
}

export async function addAbono(db: Db, a: Actor, itemId: string, rawAmount: unknown, rawMethod: unknown) {
  need(a, "credit");
  const amount = z.coerce.number().int().parse(rawAmount);
  const m = method.parse(rawMethod);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, itemId)).for("update");
    if (!it?.hold) throw new AppError("Apartado no encontrado", "notfound");
    const bal = holdBal(it.price, it.hold);
    if (amount <= 0 || amount > bal) throw new AppError(`El abono debe ser mayor a 0 y no superar el saldo (${fmt(bal)})`, "invalid");
    const no = "RB-" + (1000 + (await nextCounter(tx, "receipt")));
    const hold: Hold = { ...it.hold, abono: it.hold.abono + amount, reminded: false, pays: [...it.hold.pays, { t: Date.now(), amount, method: m, by: a.id, no }] };
    await tx.update(items).set({ hold }).where(eq(items.id, itemId));
    await addEvent(tx, itemId, a, "Abono recibido", `${fmt(amount)} · ${m} · saldo ${fmt(holdBal(it.price, hold))}`, "ok");
    const [c] = await tx.select().from(clients).where(eq(clients.id, hold.client));
    await logFeed(tx, a, "apartado", "💰", `Abono de <b>${fmt(amount)}</b> de ${esc(c?.name ?? "cliente")} · ${esc(uname(it))}`);
    return { hold, receipt: no };
  });
}

export async function extendHold(db: Db, a: Actor, itemId: string, rawDays: unknown) {
  need(a, "credit");
  const n = z.coerce.number().int().min(1).max(60).parse(rawDays);
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it?.hold) throw new AppError("Apartado no encontrado", "notfound");
  const hold = { ...it.hold, expires: it.hold.expires + n * DAY, reminded: false };
  await db.update(items).set({ hold }).where(eq(items.id, itemId));
  await addEvent(db, itemId, a, "Apartado extendido", `+${n} días`, "warn");
  await logFeed(db, a, "apartado", "🔒", `Apartado extendido ${n} días: <b>${esc(uname(it))}</b>`);
}

export async function releaseHold(db: Db, a: Actor, itemId: string, refund: boolean) {
  need(a, "credit");
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it?.hold) throw new AppError("Apartado no encontrado", "notfound");
  const outcome = refund ? "Liberado · abono devuelto al cliente" : "Liberado · abono retenido por la tienda";
  const [c] = await db.select().from(clients).where(eq(clients.id, it.hold.client));
  await db.transaction(async (tx) => {
    await tx.insert(holdHistory).values({ t: Date.now(), item: uname(it), client: c?.name ?? "—", abono: it.hold!.abono, outcome });
    await tx.update(items).set({ status: "En vitrina", hold: null }).where(eq(items.id, itemId));
    await addEvent(tx, itemId, a, "Apartado liberado", `${outcome} · ${fmt(it.hold!.abono)}`, "warn");
    await logFeed(tx, a, "apartado", "🔒", `Apartado liberado: <b>${esc(uname(it))}</b> (${esc(outcome)})`);
  });
}

/** Devolución: marca unidades devueltas y regresa los equipos al inventario. */
export async function refundSale(db: Db, a: Actor, saleId: string, rawReturns: unknown, reason: string) {
  need(a, "refund");
  const returns = z.array(z.coerce.number().int().min(0)).parse(rawReturns);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!s) throw new AppError("Venta no encontrada", "notfound");
    let total = 0, n = 0;
    const lines = s.lines.map((l, i) => {
      const q = Math.max(0, Math.min(lineNet(l), returns[i] ?? 0));
      if (q) { total += Math.round(q * l.price * (1 - s.disc / 100)); n += q; }
      return { ...l, ret: (l.ret || 0) + q };
    });
    if (!n) throw new AppError("Indica qué se devuelve", "invalid");
    await tx.update(sales).set({ lines }).where(eq(sales.id, saleId));
    for (const [i, l] of lines.entries()) {
      const q = Math.max(0, Math.min(lineNet(s.lines[i]), returns[i] ?? 0));
      if (!q) continue;
      const [it] = await tx.select().from(items).where(eq(items.id, l.item)).for("update");
      if (!it) continue;
      if (isQty(it)) await tx.update(items).set({ qty: it.qty + q }).where(eq(items.id, it.id));
      else await tx.update(items).set({ status: "En vitrina" }).where(eq(items.id, it.id));
      await addEvent(tx, it.id, a, "Devolución", `${s.no} · ${reason}`, "warn");
    }
    await logFeed(tx, a, "owner", "↩️", `Devolución en <b>${s.no}</b>: ${n} producto${n !== 1 ? "s" : ""} · ${fmt(total)} (${esc(reason)}) · ${esc(a.name)}`);
    return { total, n };
  });
}

export async function listSales(db: Db) {
  return db.select().from(sales).orderBy(desc(sales.t));
}
