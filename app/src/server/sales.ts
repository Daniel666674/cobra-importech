import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { allies, allyMoves, claims, clients, counters, holdHistory, items, sales, settings, type Hold, type Payment, type SaleLine } from "@/db/schema";
import { CONDS, METHODS, feeFor, surchargeOf } from "@/lib/catalog";
import { DAY, fmt } from "@/lib/format";
import { holdBal, holdMin } from "@/lib/hold";
import { isAvail, isQty, uname } from "@/lib/items";
import { lineNet, posTotals, saleNet } from "@/lib/sales";
import { AppError, copField, addEvent, can, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { insertItem, prepareItem, type PreparedItem } from "./inventory";

const method = z.enum(METHODS);
const clientNew = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del cliente nuevo"),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  doc: z.string().trim().default(""),
});

export const saleInput = z.object({
  /** `price`: solo para productos sin precio de venta (se escribe en caja y queda guardado en el producto). */
  lines: z.array(z.object({ item: z.string(), qty: z.coerce.number().int().min(1), price: copField("el precio de venta", 1).optional() })).default([]),
  /** Productos fuera de inventario (p. ej. un equipo que no estaba en stock): se facturan sin tocar el inventario. */
  custom: z.array(z.object({
    name: z.string().trim().min(2, "Escribe el nombre del producto").max(200), spec: z.string().trim().max(80).default(""), color: z.string().trim().max(60).default(""),
    cond: z.enum(CONDS).default("Nuevo"), serial: z.string().trim().max(40).default(""), serial2: z.string().trim().max(40).default(""),
    batt: z.preprocess((v) => (v === "" || v == null ? null : typeof v === "string" ? v.replace(/[%\s]/g, "") : v), z.coerce.number({ error: "La batería debe ser un número entre 0 y 100" }).int().min(0, "La batería va de 0 a 100").max(100, "La batería va de 0 a 100").nullable()).default(null), qty: z.coerce.number().int().min(1).max(1000).default(1),
    price: copField("el precio del producto fuera de inventario", 1), cost: copField("el costo").default(0),
    warr: z.coerce.number().int().min(0).max(60).default(0),
    /** Tienda aliada (proveedor) dueña del equipo: lo que se le paga queda en su cartera. Vacío = propio. */
    ally: z.string().trim().default(""),
  })).max(20).default([]),
  client: z.string().nullable().default(null),
  newClient: clientNew.nullable().default(null),
  discount: z.object({ type: z.enum(["pct", "cop"]), value: z.coerce.number().min(0) }).default({ type: "pct", value: 0 }),
  discReason: z.string().trim().default(""),
  payments: z.array(z.object({ method, amount: copField("el valor de cada forma de pago", 1) })).default([]),
  notes: z.string().trim().default(""),
  cash: copField("el efectivo recibido").default(0),
  holdItem: z.string().nullable().default(null),
  /** Equipos que el cliente entrega como parte de pago. Entran solos al inventario. */
  tradeins: z.array(z.object({ item: z.unknown(), official: z.unknown().optional(), ownerApproved: z.boolean().default(false) })).max(3, "Máximo 3 equipos de retoma por venta").default([]),
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
  // Retomas: se validan antes (IMEI, verificación oficial) y se guardan dentro de la misma transacción de la venta.
  if (input.tradeins.length) need(a, "tradein");
  const trades: PreparedItem[] = [];
  for (const t of input.tradeins) {
    const raw = { ...(t.item as object), src: "Trade-in", qty: 1, ally: "" };
    const p = await prepareItem(db, a, raw, { official: t.official, ownerApproved: t.ownerApproved });
    if (!(p.input.cost > 0)) throw new AppError("El valor de la retoma debe ser mayor a 0", "invalid");
    if (p.input.serial && trades.some((x) => x.input.serial === p.input.serial)) throw new AppError("El mismo equipo de retoma está dos veces", "invalid");
    trades.push(p);
  }
  const tradeTotal = trades.reduce((x, p) => x + p.input.cost, 0);
  if (!input.lines.length && !input.custom.length) throw new AppError("Agrega al menos un producto", "invalid");
  return db.transaction(async (tx) => {
    const ids = input.lines.map((l) => l.item);
    if (new Set(ids).size !== ids.length) throw new AppError("Hay productos repetidos en la venta", "invalid");
    const rows = await tx.select().from(items).where(inArray(items.id, ids)).for("update");
    if (rows.length !== ids.length) throw new AppError("Un producto de la venta ya no existe", "notfound");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines = input.lines.map((l) => ({ it: byId.get(l.item)!, qty: l.qty, price: l.price }));
    const priced: { id: string; price: number }[] = [];
    for (const { it, qty, price } of lines) {
      if (!isAvail(it) && it.id !== input.holdItem) throw new AppError(`«${uname(it)}» ya no está disponible`, "conflict");
      // Sin precio de venta: se toma el que se escribió en caja y se guarda en el producto.
      if (!(it.price > 0) && price) { it.price = price; priced.push({ id: it.id, price }); }
      if (!(it.price > 0)) throw new AppError(`«${uname(it)}» no tiene precio de venta: escríbelo en la venta`, "invalid");
      if (isQty(it) ? qty > it.qty : qty !== 1) throw new AppError(isQty(it) ? `Solo hay ${it.qty} de «${it.name}»` : `«${uname(it)}» es un equipo único`, "conflict");
    }
    let hold: Hold | null = null;
    if (input.holdItem) {
      const hi = byId.get(input.holdItem);
      if (!hi?.hold) throw new AppError("El apartado ya no existe", "conflict");
      hold = hi.hold;
    }
    const T = posTotals([...lines.map(({ it, qty }) => ({ price: it.price, cost: it.cost, qty })), ...input.custom.map((c) => ({ price: c.price, cost: c.cost, qty: c.qty }))], input.discount, hold ? hold.abono : 0);
    if (T.pct > 0 && !input.discReason) throw new AppError("Indica el motivo del descuento", "invalid");
    if (T.pct > cfg.maxDisc && !can(a, "discount")) throw new AppError(`El descuento supera el límite del ${cfg.maxDisc}%: pide autorización`, "forbidden");
    if (T.total < T.cost && !can(a, "discount")) throw new AppError("El total queda por debajo del costo: pide autorización", "forbidden");
    if (tradeTotal > T.due) throw new AppError(`La retoma (${fmt(tradeTotal)}) supera lo que falta por pagar (${fmt(T.due)}). Registra la retoma sola en «Retomas» y paga la diferencia al cliente.`, "invalid");
    for (const p of trades) if (lines.some(({ it }) => it.serial && it.serial === p.input.serial)) throw new AppError("El equipo de retoma no puede ser el mismo que se vende", "invalid");
    const cashDue = T.due - tradeTotal;
    const pays: Payment[] = input.payments;
    const sum = pays.reduce((s, p) => s + p.amount, 0);
    if (cashDue > 0 && sum !== cashDue) throw new AppError(sum < cashDue ? `Falta asignar ${fmt(cashDue - sum)} en los pagos` : `Los pagos superan el total por ${fmt(sum - cashDue)}`, "invalid");
    if (cashDue === 0 && pays.length) throw new AppError(tradeTotal ? "La retoma cubre todo: no hay nada más por cobrar" : "Con el apartado pagado completo no hay nada por cobrar", "invalid");

    const client = await ensureClient(tx, input.client ?? hold?.client ?? null, input.newClient);
    if (trades.length && !client?.doc) throw new AppError("Para recibir un equipo en parte de pago, el cliente debe tener nombre y cédula (soporta el origen del equipo)", "invalid");
    const n = await nextCounter(tx, "sale");
    const inv = await nextCounter(tx, "invoice");
    const id = "S-" + String(n).padStart(4, "0");
    const no = (cfg.invPrefix ?? "FV-") + inv;
    const saleLines: SaleLine[] = lines.map(({ it, qty }) => ({
      item: it.id, name: uname(it), color: it.color, cond: it.cond, serial: it.serial, ...(it.serial2 ? { serial2: it.serial2 } : {}), ...(it.batt != null ? { batt: it.batt } : {}), qty, price: it.price,
      cost: it.cost + (isQty(it) ? 0 : it.repairs || 0), warr: it.warr, ret: 0, ...(it.ally ? { ally: it.ally } : {}),
    }));
    for (const c of input.custom) if (/iphone/i.test(c.name) && c.batt == null) throw new AppError(`Escribe la salud de la batería (%) de ${c.name}`, "invalid");
    const allyIds = [...new Set(input.custom.map((c) => c.ally).filter(Boolean))];
    const found = allyIds.length ? new Set((await tx.select({ id: allies.id }).from(allies).where(inArray(allies.id, allyIds))).map((x) => x.id)) : new Set<string>();
    for (const c of input.custom) {
      if (c.ally && !found.has(c.ally)) throw new AppError("La tienda aliada elegida ya no existe", "notfound");
      if (c.ally && !(c.cost > 0)) throw new AppError(`Escribe lo que se le paga a la aliada por ${c.name}`, "invalid");
    }
    for (const c of input.custom)
      saleLines.push({ item: "", name: [c.name, c.spec].filter(Boolean).join(" · "), color: c.color, cond: c.cond, serial: c.serial.replace(/\s+/g, ""), ...(c.serial2 ? { serial2: c.serial2.replace(/\s+/g, "") } : {}), ...(c.batt != null ? { batt: c.batt } : {}), qty: c.qty, price: c.price, cost: c.cost, warr: c.warr, ret: 0, ...(c.ally ? { ally: c.ally } : {}) });
    for (const p of priced) {
      await tx.update(items).set({ price: p.price }).where(eq(items.id, p.id));
      await addEvent(tx, p.id, a, "Precio asignado en caja", `${fmt(p.price)} · venta ${no}`);
    }
    const received = [];
    for (const p of trades) {
      p.input.notes = [`Recibido como parte de pago en ${no} de ${client!.name} (C.C. ${client!.doc}${client!.phone ? ", cel. " + client!.phone : ""})`, p.input.notes].filter(Boolean).join(" · ");
      const row = await insertItem(tx, a, p, { title: "Retoma recibida en venta", detail: `${no} · ${client!.name} · ${fmt(p.input.cost)}` });
      received.push({ item: row.id, name: uname(row), serial: row.serial, cond: row.cond, amount: row.cost });
    }
    // Recargo por forma de pago (Addi, Vanti, tarjeta de crédito…): se cobra aparte del valor de los productos.
    const charged = pays.map((p) => { const fee = feeFor(surchargeOf(cfg, p.method), p.amount); return fee ? { ...p, fee } : p; });
    const allPays: Payment[] = [...received.map((r) => ({ method: "Retoma", amount: r.amount })), ...charged];
    const surcharge = charged.reduce((x, p) => x + (p.fee ?? 0), 0);
    const row = {
      id, no, t: Date.now(), client: client?.id ?? null, by: a.id,
      method: allPays.length > 1 ? "Mixto" : allPays[0]?.method ?? "Abono previo", mode: "contado", payments: allPays, lines: saleLines, tradeins: received, surcharge,
      disc: T.pct, total: 0, prepaid: T.prepaid, notes: input.notes, discReason: input.discReason,
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
    for (const r of received) await logFeed(tx, a, "owner", "🔄", `Retoma en ${no}: <b>${esc(r.name)}</b> recibido por ${fmt(r.amount)} · ya está en inventario`);
    await allyDebts(tx, a, saleLines, (l) => l.qty, no, "Vendido");
    return row;
  });
}

export const holdInput = z.object({
  item: z.string(),
  client: z.string().nullable().default(null),
  newClient: clientNew.nullable().default(null),
  abono: copField("el valor del abono", 1),
  method,
  days: z.coerce.number().int().min(1).max(60).optional(),
  /** Fecha de vencimiento escogida en el calendario (ms). Tiene prioridad sobre `days`. */
  until: z.coerce.number().int().optional(),
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
    if (it.status !== "En vitrina" || it.approval?.kind === "alta") throw new AppError("Este equipo no está disponible para apartar", "conflict");
    const client = await ensureClient(tx, input.client, input.newClient);
    if (!client) throw new AppError("Elige o crea el cliente para apartar", "invalid");
    const min = holdMin(it.price, cfg.apartadoMinPct);
    if (input.abono < min) throw new AppError(`El abono mínimo es ${fmt(min)} (${cfg.apartadoMinPct}%)`, "invalid");
    if (input.abono >= it.price) throw new AppError("El abono cubre el total: registra una venta normal", "invalid");
    const now = Date.now();
    const expires = input.until != null ? untilEnd(input.until, now) : now + (input.days ?? cfg.holdDays) * DAY;
    const days = Math.max(1, Math.ceil((expires - now) / DAY));
    const no = "RA-" + (1000 + (await nextCounter(tx, "hold")));
    const rb = "RB-" + (1000 + (await nextCounter(tx, "receipt")));
    const hold: Hold = { client: client.id, abono: input.abono, expires, t: now, by: a.id, no, pays: [{ t: now, amount: input.abono, method: input.method, by: a.id, no: rb }] };
    await tx.update(items).set({ status: "Apartado", hold }).where(eq(items.id, it.id));
    await addEvent(tx, it.id, a, "Apartado", `${client.name} · abono ${fmt(input.abono)} · vence el ${new Date(expires).toLocaleDateString("es-CO")} (${days} días)`, "warn");
    await logFeed(tx, a, "apartado", "🔒", `Apartado de <b>${esc(client.name)}</b>: <b>${esc(uname(it))}</b> con abono de ${fmt(input.abono)}`);
    return { itemId: it.id, hold };
  });
}

export async function addAbono(db: Db, a: Actor, itemId: string, rawAmount: unknown, rawMethod: unknown) {
  need(a, "credit");
  const amount = copField("el valor del abono", 1).parse(rawAmount);
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

/** Hasta el final del día escogido; debe ser futuro y a máximo 180 días. */
function untilEnd(t: number, now = Date.now()) {
  const d = new Date(t); d.setHours(23, 59, 59, 999);
  const end = d.getTime();
  if (end <= now) throw new AppError("Escoge una fecha de hoy en adelante", "invalid");
  if (end > now + 180 * DAY) throw new AppError("La fecha no puede pasar de 180 días", "invalid");
  return end;
}

/** Nueva fecha de vencimiento: un número pequeño son días a sumar; una fecha (ms) es el día escogido en el calendario. */
export async function extendHold(db: Db, a: Actor, itemId: string, rawUntil: unknown) {
  need(a, "credit");
  const v = z.coerce.number().int().min(1).parse(rawUntil);
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it?.hold) throw new AppError("Apartado no encontrado", "notfound");
  const expires = v <= 365 ? it.hold.expires + v * DAY : untilEnd(v);
  const hold = { ...it.hold, expires, reminded: false };
  const date = new Date(expires).toLocaleDateString("es-CO");
  await db.update(items).set({ hold }).where(eq(items.id, itemId));
  await addEvent(db, itemId, a, "Fecha del apartado cambiada", `Ahora vence el ${date}`, "warn");
  await logFeed(db, a, "apartado", "🔒", `Apartado de <b>${esc(uname(it))}</b> ahora vence el ${date}`);
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
    await allyDebts(tx, a, s.lines, (l, i) => -Math.max(0, Math.min(lineNet(l), returns[i] ?? 0)), s.no, "Devolución");
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

/** Registra en la cuenta de cada tienda aliada (en consignación) lo que se le debe por lo vendido o devuelto. */
async function allyDebts(tx: Db, a: Actor, lines: SaleLine[], qtyOf: (l: SaleLine, i: number) => number, ref: string, what: string) {
  const ids = [...new Set(lines.filter((l) => l.ally).map((l) => l.ally!))];
  if (!ids.length) return;
  const consign = new Set((await tx.select().from(allies).where(inArray(allies.id, ids))).filter((x) => x.mode === "consignacion").map((x) => x.id));
  for (const [i, l] of lines.entries()) {
    const q = qtyOf(l, i);
    if (!l.ally || !q || !consign.has(l.ally)) continue;
    await tx.insert(allyMoves).values({ ally: l.ally, t: Date.now(), kind: "deuda", amount: q * l.cost, ref, detail: `${what}: ${l.name}${Math.abs(q) > 1 ? " ×" + Math.abs(q) : ""}`, by: a.name });
  }
}

export async function listSales(db: Db) {
  return db.select().from(sales).orderBy(desc(sales.t));
}

/**
 * Borra una venta como si no se hubiera hecho: los equipos vuelven al inventario, las retomas que entraron con ella se quitan
 * y las deudas a tiendas aliadas que generó se anulan. Se niega si ya no se puede deshacer sin perder información.
 */
async function removeSale(tx: Db, a: Actor, s: typeof sales.$inferSelect) {
  if (s.holdPays != null) throw new AppError(`${s.no} viene de un apartado y no se puede borrar (usa «Devolución»)`, "conflict");
  const [claim] = await tx.select({ id: claims.id }).from(claims).where(eq(claims.sale, s.id)).limit(1);
  if (claim) throw new AppError(`${s.no} tiene un reclamo de garantía y no se puede borrar`, "conflict");
  const tradeIds = s.tradeins.map((t) => t.item);
  const trades = tradeIds.length ? await tx.select().from(items).where(inArray(items.id, tradeIds)).for("update") : [];
  const used = trades.find((t) => t.status !== "En vitrina" && t.status !== "En revisión");
  if (used) throw new AppError(`${s.no}: la retoma «${uname(used)}» ya se vendió o está en uso y no se puede borrar`, "conflict");
  for (const l of s.lines) {
    const net = lineNet(l);
    if (!l.item || net <= 0) continue;
    const [it] = await tx.select().from(items).where(eq(items.id, l.item)).for("update");
    if (!it) continue;
    if (isQty(it)) await tx.update(items).set({ qty: it.qty + net }).where(eq(items.id, it.id));
    else if (it.status === "Vendido") await tx.update(items).set({ status: "En vitrina" }).where(eq(items.id, it.id));
    else continue;
    await addEvent(tx, it.id, a, "Venta eliminada", `${s.no} borrada por ${a.name}: ${isQty(it) ? `+${net} al inventario` : "vuelve a vitrina"}`, "warn");
  }
  if (trades.length) await tx.delete(items).where(inArray(items.id, trades.map((t) => t.id)));
  await tx.delete(allyMoves).where(and(eq(allyMoves.ref, s.no), eq(allyMoves.kind, "deuda")));
  await tx.delete(sales).where(eq(sales.id, s.id));
  return s;
}

/** Borra una sola venta (ver `removeSale`). Solo quien puede cambiar la configuración. */
export async function deleteSale(db: Db, a: Actor, saleId: string) {
  need(a, "settings");
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!s) throw new AppError("Venta no encontrada", "notfound");
    await removeSale(tx, a, s);
    await logFeed(tx, a, "owner", "🗑️", `Venta <b>${s.no}</b> (${fmt(saleNet(s))}) borrada por ${esc(a.name)}`);
    return s.no;
  });
}

/** Cambia a mano el número de comprobante de una venta (por ejemplo, para que coincida con el de la factura física). */
export async function renameSale(db: Db, a: Actor, saleId: string, rawNo: unknown) {
  need(a, "settings");
  const no = z.string().trim().min(1, "Escribe el número de comprobante").max(20, "Máximo 20 caracteres").regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guion").parse(rawNo);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId)).for("update");
    if (!s) throw new AppError("Venta no encontrada", "notfound");
    if (s.no === no) return no;
    const [dup] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.no, no)).limit(1);
    if (dup) throw new AppError(`Ya existe una venta con el número ${no}`, "conflict");
    await tx.update(sales).set({ no }).where(eq(sales.id, saleId));
    await tx.update(allyMoves).set({ ref: no }).where(and(eq(allyMoves.ref, s.no), eq(allyMoves.kind, "deuda")));
    await logFeed(tx, a, "owner", "🔢", `Comprobante <b>${esc(s.no)}</b> cambiado a <b>${esc(no)}</b> por ${esc(a.name)}`);
    return no;
  });
}

export const DELETE_ALL_PHRASE = "BORRAR VENTAS";

/**
 * Borra, por tandas, las ventas hechas en el sistema (no las importadas: esas se deshacen en «Importar»).
 * `skip` = cuántas ventas que no se pudieron borrar ya quedaron al principio de la lista.
 */
export async function deleteAllSales(db: Db, a: Actor, rawConfirm: unknown, rawSkip: unknown = 0, rawRestart: unknown = null, batch = 25) {
  need(a, "settings");
  if (rawConfirm !== DELETE_ALL_PHRASE) throw new AppError(`Escribe «${DELETE_ALL_PHRASE}» para confirmar`, "invalid");
  const skip = z.coerce.number().int().min(0).parse(rawSkip);
  const restart = rawRestart == null || rawRestart === "" ? null : z.coerce.number().int().min(1).max(99_999_999).parse(rawRestart);
  const todo = await db.select({ id: sales.id, no: sales.no }).from(sales).where(eq(sales.source, "")).orderBy(asc(sales.id)).limit(batch).offset(skip);
  let deleted = 0;
  const blocked: string[] = [];
  for (const { id, no } of todo) {
    try {
      await db.transaction(async (tx) => {
        const [s] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
        if (s) await removeSale(tx, a, s);
      });
      deleted++;
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      blocked.push(e.message || no);
    }
  }
  if (deleted) await logFeed(db, a, "owner", "🗑️", `${deleted} venta${deleted !== 1 ? "s" : ""} borrada${deleted !== 1 ? "s" : ""} por ${esc(a.name)}`);
  const done = todo.length < batch;
  let restarted = false;
  // Con todas las ventas del sistema borradas, la numeración puede empezar de nuevo.
  if (done && restart && skip + blocked.length === 0) {
    const [left] = await db.select({ id: sales.id }).from(sales).where(eq(sales.source, "")).limit(1);
    if (!left) {
      await db.insert(counters).values({ key: "invoice", value: restart - 1 }).onConflictDoUpdate({ target: counters.key, set: { value: restart - 1 } });
      await logFeed(db, a, "owner", "🔢", `Numeración de comprobantes reiniciada: el siguiente será <b>${restart}</b> · ${esc(a.name)}`);
      restarted = true;
    }
  }
  return { deleted, blocked, done, skip: skip + blocked.length, restarted };
}
