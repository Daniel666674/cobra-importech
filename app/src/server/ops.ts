import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { claims, clients, items, orders, purchases, sales } from "@/db/schema";
import { CATS, CAT_SKU, CONDS, listPrice, type Cat } from "@/lib/catalog";
import { fmt } from "@/lib/format";
import { landed } from "@/lib/landed";
import { isQty, uname } from "@/lib/items";
import { pendingAlta } from "./approvals";
import { AppError, copField, addEvent, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { verifyImei } from "./imei";
import { branchName } from "./inventory";

/* ---------- Clientes ---------- */
export const clientInput = z.object({
  name: z.string().trim().min(1, "Escribe el nombre"),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  doc: z.string().trim().default(""),
  address: z.string().trim().max(200, "La dirección es muy larga (máximo 200 caracteres)").default(""),
  notes: z.string().trim().default(""),
});
export async function saveClient(db: Db, a: Actor, id: string | null, raw: unknown) {
  need(a, "clients");
  const v = clientInput.parse(raw);
  if (id) {
    await db.update(clients).set(v).where(eq(clients.id, id));
    return id;
  }
  const nid = "c" + (await nextCounter(db, "client"));
  await db.insert(clients).values({ id: nid, ...v });
  return nid;
}

/* ---------- Garantías ---------- */
export async function openClaim(db: Db, a: Actor, saleId: string, line: number, note: string) {
  need(a, "sell");
  const n = z.string().trim().min(1, "Describe el problema").parse(note);
  const [s] = await db.select().from(sales).where(eq(sales.id, saleId));
  const l = s?.lines[line];
  if (!s || !l) throw new AppError("Venta o producto no encontrado", "notfound");
  const id = "G-" + String(await nextCounter(db, "claim")).padStart(3, "0");
  await db.insert(claims).values({ id, sale: saleId, line, t: Date.now(), note: n, status: "Abierto", resolution: "" });
  const [it] = await db.select().from(items).where(eq(items.id, l.item));
  if (it) await addEvent(db, it.id, a, "Reclamo de garantía abierto", n, "warn");
  await logFeed(db, a, "owner", "🛠️", `Reclamo de garantía: <b>${esc(l.name)}</b> · ${esc(n)}`);
  return id;
}
export async function resolveClaim(db: Db, a: Actor, id: string, resolution: string) {
  need(a, "sell");
  const res = z.string().trim().min(1).parse(resolution);
  const [c] = await db.select().from(claims).where(eq(claims.id, id));
  if (!c) throw new AppError("Reclamo no encontrado", "notfound");
  const [s] = await db.select().from(sales).where(eq(sales.id, c.sale));
  const l = s?.lines[c.line];
  await db.update(claims).set({ status: "Resuelto", resolution: res }).where(eq(claims.id, id));
  if (l) {
    await addEvent(db, l.item, a, "Reclamo resuelto", res, "ok");
    await logFeed(db, a, "owner", "✅", `Reclamo resuelto: <b>${esc(l.name)}</b> · ${esc(res)}`);
  }
}

/* ---------- Taller ---------- */
export const ORDER_FLOW = ["Diagnóstico", "Esperando repuesto", "En reparación", "Listo"] as const;
export async function createOrder(db: Db, a: Actor, raw: unknown) {
  need(a, "workshop");
  const v = z.object({ item: z.string(), job: z.string().trim().min(1, "Describe el trabajo"), cost: copField("el costo de la reparación").default(0), tech: z.string().default("") }).parse(raw);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, v.item)).for("update");
    if (!it) throw new AppError("Equipo no encontrado", "notfound");
    if (isQty(it) || it.status === "Vendido" || it.status === "En taller") throw new AppError("Este equipo no se puede enviar a taller", "conflict");
    const id = "T-" + String(await nextCounter(tx, "order")).padStart(3, "0");
    await tx.insert(orders).values({ id, item: it.id, job: v.job, st: "Diagnóstico", cost: v.cost, tech: v.tech || a.name.split(" ")[0], prev: it.status, t: Date.now(), stT: Date.now() });
    await tx.update(items).set({ status: "En taller" }).where(eq(items.id, it.id));
    await addEvent(tx, it.id, a, "Entró a taller", v.job, "warn");
    return id;
  });
}
type OrderTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Termina la reparación: el costo se suma al costo real del equipo y, para no perder la ganancia, también al precio. */
async function finishOrder(tx: OrderTx, a: Actor, o: typeof orders.$inferSelect) {
  const [it] = o.item ? await tx.select().from(items).where(eq(items.id, o.item)) : [];
  if (it) {
    const price = it.price ? it.price + o.cost : it.price;
    await tx.update(items).set({ status: "En vitrina", repairs: it.repairs + o.cost, price }).where(eq(items.id, it.id));
    await addEvent(tx, it.id, a, "Reparación terminada", `${o.job} · costo ${fmt(o.cost)} sumado al costo real (${fmt(it.cost + it.repairs)} → ${fmt(it.cost + it.repairs + o.cost)})${price !== it.price ? ` y al precio (${fmt(it.price)} → ${fmt(price)})` : ""}`, "ok");
    await addEvent(tx, it.id, a, "En vitrina", it.branch);
    await logFeed(tx, a, "owner", "🔧", `Reparación terminada: <b>${esc(uname(it))}</b> (${esc(o.job)}) · costo ${fmt(o.cost)}${price !== it.price ? ` · nuevo precio ${fmt(price)}` : ""}`);
  }
  await tx.delete(orders).where(eq(orders.id, o.id));
}

export async function advanceOrder(db: Db, a: Actor, id: string) {
  need(a, "workshop");
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!o) throw new AppError("Orden no encontrada", "notfound");
    if (o.st === "Listo") { await finishOrder(tx, a, o); return "done"; }
    const next = ORDER_FLOW[ORDER_FLOW.indexOf(o.st as (typeof ORDER_FLOW)[number]) + 1];
    await tx.update(orders).set({ st: next, stT: Date.now() }).where(eq(orders.id, id));
    if (o.item) await addEvent(tx, o.item, a, "Taller: " + next, o.job);
    return next;
  });
}

/** Mueve la orden a cualquier etapa del tablero (arrastrar o ‹ ›). */
export async function moveOrder(db: Db, a: Actor, id: string, st: string) {
  need(a, "workshop");
  const to = z.enum(ORDER_FLOW).parse(st);
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!o) throw new AppError("Orden no encontrada", "notfound");
    if (o.st === to) return to;
    await tx.update(orders).set({ st: to, stT: Date.now() }).where(eq(orders.id, id));
    if (o.item) await addEvent(tx, o.item, a, "Taller: " + to, `${o.st} → ${to} · ${o.job}`);
    return to;
  });
}

/** Actualiza el costo de la reparación (p. ej. tras el diagnóstico) y las notas del técnico. */
export async function updateOrder(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "workshop");
  const v = z.object({ cost: copField("el costo de la reparación").optional(), notes: z.string().trim().max(500).optional(), tech: z.string().trim().max(60).optional() }).parse(raw);
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) throw new AppError("Orden no encontrada", "notfound");
  await db.update(orders).set(v).where(eq(orders.id, id));
  if (o.item && v.cost != null && v.cost !== o.cost) await addEvent(db, o.item, a, "Costo de reparación", `${fmt(o.cost)} → ${fmt(v.cost)} · ${o.job}`, "warn");
}
export async function cancelOrder(db: Db, a: Actor, id: string) {
  need(a, "workshop");
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) throw new AppError("Orden no encontrada", "notfound");
  if (o.item) {
    await db.update(items).set({ status: o.prev }).where(eq(items.id, o.item));
    await addEvent(db, o.item, a, "Orden de taller cancelada", o.job, "warn");
  }
  await db.delete(orders).where(eq(orders.id, id));
}

/* ---------- Compras / importaciones ---------- */
export const purchaseInput = z.object({
  sup: z.string().trim().min(1, "Escribe el proveedor"),
  desc: z.string().trim().default(""),
  qty: z.coerce.number().int().min(1),
  usd: z.coerce.number().int().min(1, "Escribe el valor en USD"),
  trm: z.coerce.number().int().min(1),
  freight: z.coerce.number().min(0).default(0),
  arancel: z.coerce.number().min(0).default(0),
  iva: z.coerce.number().min(0).default(19),
  st: z.enum(["En tránsito", "Recibido"]).default("En tránsito"),
});
export async function createPurchase(db: Db, a: Actor, raw: unknown) {
  need(a, "purchase");
  const v = purchaseInput.parse(raw);
  const id = "L-" + String(await nextCounter(db, "po")).padStart(3, "0");
  await db.insert(purchases).values({ id, ...v, t: Date.now() });
  await logFeed(db, a, "owner", "🛒", `Compra <b>${id}</b> registrada: ${v.qty} unidades a ${esc(v.sup)}`);
  return id;
}

export const receiveInput = z.object({
  cat: z.enum(CATS),
  name: z.string().trim().min(1, "Escribe el producto"),
  spec: z.string().default(""),
  color: z.string().default(""),
  cond: z.enum(CONDS).default("Nuevo"),
  price: z.coerce.number().int().min(0).default(0),
  qty: z.coerce.number().int().min(1).default(1),
  serials: z.array(z.string()).default([]),
});

/**
 * Recibe una compra. Cada iPhone entra "En revisión" (no se puede vender) hasta que
 * alguien registre su verificación oficial en la ficha del equipo.
 */
export async function receivePurchase(db: Db, a: Actor, poId: string, raw: unknown) {
  need(a, "inv_edit");
  const v = receiveInput.parse(raw);
  const [po] = await db.select().from(purchases).where(eq(purchases.id, poId));
  if (!po) throw new AppError("Compra no encontrada", "notfound");
  const L = landed(po);
  const branch = await branchName(db);
  const cost = Math.round(L.unit);
  const price = v.price || listPrice(v.name, v.spec, v.cond) || Math.round((L.unit * 1.2) / 1000) * 1000;
  const warr = 12;
  const ok: string[] = [];
  const bad: [string, string][] = [];
  await db.transaction(async (tx) => {
    const qtyTrack = v.cat === "AirPods" || v.cat === "Accesorios";
    if (qtyTrack) {
      const n = await nextCounter(tx, "item");
      const id = "I-" + String(n).padStart(4, "0");
      await tx.insert(items).values({ id, sku: CAT_SKU[v.cat as Cat] + "-" + String(n).padStart(4, "0"), cat: v.cat, name: v.name, spec: v.spec, color: v.color, cond: v.cond, serial: "", qty: v.qty, cost, price, warr, branch, status: "En vitrina", acq: Date.now(), src: "Importación " + poId, min: 3, track: "qty", batt: null, notes: "", repairs: 0, imeiCheck: null, hold: null, approval: pendingAlta(a) });
      await addEvent(tx, id, a, "Ingreso ×" + v.qty, poId, "ok");
      ok.push(id);
    } else {
      const serials = [...new Set(v.serials.map((s) => s.trim().toUpperCase()).filter(Boolean))];
      if (!serials.length) throw new AppError("Pega al menos un IMEI o serial", "invalid");
      for (const sr of serials) {
        const [dup] = await tx.select({ id: items.id }).from(items).where(eq(items.serial, sr));
        if (dup) { bad.push([sr, "Ya existe en el inventario"]); continue; }
        if (v.cat === "iPhone") {
          const r = await verifyImei(tx, sr);
          if (r.verdict === "blocked") {
            bad.push([sr, r.steps.find((s) => s.state === "fail")?.detail ?? "IMEI no válido"]);
            if (r.reason === "neg") await logFeed(tx, a, "owner", "🚨", `Alerta al dueño: IMEI <b>••${sr.slice(-6)}</b> bloqueado en lote ${poId}`);
            continue;
          }
        }
        const n = await nextCounter(tx, "item");
        const id = "I-" + String(n).padStart(4, "0");
        const review = v.cat === "iPhone";
        await tx.insert(items).values({ id, sku: CAT_SKU[v.cat as Cat] + "-" + String(n).padStart(4, "0"), cat: v.cat, name: v.name, spec: v.spec, color: v.color, cond: v.cond, serial: sr, qty: 1, cost, price, warr, branch, status: review ? "En revisión" : "En vitrina", acq: Date.now(), src: "Importación " + poId, batt: v.cond === "Nuevo" ? 100 : null, notes: "", repairs: 0, min: 0, track: "unit", imeiCheck: null, hold: null, approval: pendingAlta(a) });
        await addEvent(tx, id, a, "Ingreso por compra", `${poId} · costo real ${fmt(cost)}`);
        if (review) await addEvent(tx, id, a, "Pendiente de verificación oficial", "No se puede vender hasta registrar CRC y Apple", "warn");
        else await addEvent(tx, id, a, "En vitrina", branch);
        ok.push(id);
      }
    }
    if (!ok.length) throw new AppError("No se ingresó ningún equipo: " + bad.map((b) => `••${b[0].slice(-6)} ${b[1]}`).join("; "), "invalid");
    await tx.update(purchases).set({ st: "Recibido" }).where(eq(purchases.id, poId));
    await logFeed(tx, a, "owner", "📦", `Lote <b>${poId}</b> recibido: ${ok.length} ingresado(s)${bad.length ? " · " + bad.length + " bloqueado(s)" : ""}`);
  });
  return { ok, bad };
}

export const listPurchases = (db: Db) => db.select().from(purchases).orderBy(desc(purchases.t));
