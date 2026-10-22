import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { clients, sales, users, type SaleLine } from "@/db/schema";
import { norm } from "@/lib/csv";
import { fmt } from "@/lib/format";
import { impliedDisc } from "@/lib/sales-import";
import { saleNet } from "@/lib/sales";
import { AppError, esc, logFeed, need, nextCounter, type Actor } from "./core";

const line = z.object({
  name: z.string().trim().min(1).max(200), serial: z.string().max(60).default(""), qty: z.number().int().min(1).max(100000),
  price: z.number().int().min(0).max(1e10), cost: z.number().int().min(0).max(1e10), warr: z.number().int().min(0).max(120),
  cond: z.string().max(40).default(""), color: z.string().max(60).default(""),
});
const sale = z.object({
  key: z.string().max(120), no: z.string().max(60).default(""), t: z.number().int().min(Date.UTC(2000, 0, 1)).max(Date.now() + 86400000),
  client: z.object({ name: z.string().max(200), doc: z.string().max(40), phone: z.string().max(30), email: z.string().max(120) }).nullable(),
  seller: z.string().max(120).default(""), method: z.string().max(60).default(""), notes: z.string().max(1000).default(""),
  total: z.number().int().min(0).max(1e11), lines: z.array(line).min(1).max(500),
});
export const importBatch = z.object({ source: z.string().trim().min(1).max(120), sales: z.array(sale).min(1).max(1000) });
export const MAX_BATCH = 300;

/** Llave estable de una venta del archivo: el número de factura, o fecha + productos + total si no hay número. */
export function extKey(s: z.infer<typeof sale>) {
  if (s.no) return "no:" + norm(s.no).replace(/ /g, "");
  const raw = [s.t, s.total, s.client?.doc ?? s.client?.name ?? "", ...s.lines.map((l) => `${l.qty}x${l.name}|${l.serial}|${l.price}`)].join("¦");
  let h = 2166136261; // FNV-1a: suficiente para distinguir filas, no es seguridad.
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return "h:" + (h >>> 0).toString(36) + ":" + raw.length;
}

/**
 * Importa ventas históricas. No toca el inventario (esos equipos ya no están en la tienda), pero sí crea
 * los clientes y deja las ventas disponibles para reportes, garantías y búsquedas por IMEI.
 * Volver a subir el mismo archivo no duplica: las ventas que ya existen se saltan.
 */
export async function importSales(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  need(a, "reports");
  const { source, sales: list } = importBatch.parse(raw);
  if (list.length > MAX_BATCH) throw new AppError(`Envía como máximo ${MAX_BATCH} ventas por tanda`, "invalid");
  return db.transaction(async (tx) => {
    const keys = list.map(extKey);
    const existing = new Set((await tx.select({ k: sales.extKey }).from(sales).where(inArray(sales.extKey, keys))).map((r) => r.k));
    const nos = list.filter((s) => s.no).map((s) => s.no);
    const takenNo = new Set(nos.length ? (await tx.select({ no: sales.no }).from(sales).where(inArray(sales.no, nos))).map((r) => r.no) : []);

    // Clientes: se reutilizan por documento, luego por teléfono, luego por nombre exacto.
    const cl = await tx.select().from(clients);
    const byDoc = new Map(cl.filter((c) => c.doc).map((c) => [norm(c.doc), c.id]));
    const byPhone = new Map(cl.filter((c) => c.phone).map((c) => [c.phone.replace(/\D/g, "").slice(-10), c.id]));
    const byName = new Map(cl.map((c) => [norm(c.name), c.id]));
    const us = await tx.select({ id: users.id, name: users.name }).from(users);
    const seller = (n: string) => {
      const k = norm(n);
      return k ? us.find((u) => norm(u.name) === k || norm(u.name).split(" ")[0] === k)?.id : undefined;
    };

    let created = 0, skipped = 0, newClients = 0, amount = 0;
    const seen = new Set<string>();
    for (const [i, s] of list.entries()) {
      const key = keys[i];
      if (existing.has(key) || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      let clientId: string | null = null;
      if (s.client) {
        const c = s.client;
        const phone = c.phone.replace(/\D/g, "").slice(-10);
        clientId = (c.doc && byDoc.get(norm(c.doc))) || (phone.length >= 7 && byPhone.get(phone)) || byName.get(norm(c.name)) || null;
        if (!clientId) {
          clientId = "c" + (await nextCounter(tx, "client"));
          await tx.insert(clients).values({ id: clientId, name: c.name, doc: c.doc, phone: c.phone, email: c.email, notes: `Importado de ${source}` });
          if (c.doc) byDoc.set(norm(c.doc), clientId);
          if (phone.length >= 7) byPhone.set(phone, clientId);
          byName.set(norm(c.name), clientId);
          newClients++;
        }
      }
      const lines: SaleLine[] = s.lines.map((l) => ({ item: "", name: l.name, color: l.color, cond: l.cond, serial: l.serial, qty: l.qty, price: l.price, cost: l.cost, warr: l.warr, ret: 0 }));
      const disc = impliedDisc(s);
      const no = s.no && !takenNo.has(s.no) ? s.no : "H-" + (await nextCounter(tx, "hist"));
      const sid = "H-" + String(await nextCounter(tx, "histid")).padStart(5, "0");
      const sellerId = seller(s.seller);
      const notes = [s.notes, s.seller && !sellerId ? `Vendedor: ${s.seller}` : "", s.no && no !== s.no ? `Número original: ${s.no}` : ""].filter(Boolean).join(" · ");
      const row = {
        id: sid, no, t: s.t, client: clientId, by: sellerId ?? "", method: s.method || "Sin dato", mode: "historico",
        payments: [{ method: s.method || "Sin dato", amount: s.total }], lines, disc, total: 0, prepaid: 0, notes, discReason: disc ? "Descuento del sistema anterior" : "",
        cash: null, holdPays: null, source, extKey: key,
      };
      row.total = saleNet(row);
      await tx.insert(sales).values(row);
      created++; amount += row.total;
    }
    if (created) await logFeed(tx, a, "owner", "📥", `Importación de <b>${esc(source)}</b>: ${created} venta${created !== 1 ? "s" : ""} (${fmt(amount)}) · ${newClients} cliente${newClients !== 1 ? "s" : ""} nuevo${newClients !== 1 ? "s" : ""} · ${esc(a.name)}`);
    return { created, skipped, newClients, amount };
  });
}

/** Borra todo lo importado desde un archivo (para corregir un mapeo equivocado). Los clientes se conservan. */
export async function undoImport(db: Db, a: Actor, source: string) {
  need(a, "settings");
  need(a, "reports");
  const del = await db.delete(sales).where(and(eq(sales.source, source), eq(sales.mode, "historico"), sql`not exists (select 1 from claims where claims.sale = ${sales.id})`)).returning({ id: sales.id });
  if (del.length) await logFeed(db, a, "owner", "🗑️", `Se deshizo la importación de <b>${esc(source)}</b>: ${del.length} ventas eliminadas · ${esc(a.name)}`);
  return del.length;
}

export async function importSources(db: Db) {
  return db.select({ source: sales.source, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${sales.total}),0)::float8`, from: sql<number>`min(${sales.t})::float8`, to: sql<number>`max(${sales.t})::float8` })
    .from(sales).where(ne(sales.source, "")).groupBy(sales.source);
}
