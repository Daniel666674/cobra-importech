import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { imeiBlocklist, items } from "@/db/schema";
import { CATS, CAT_SKU, CONDS, type Cat } from "@/lib/catalog";
import { fmt } from "@/lib/format";
import { addEvent, AppError, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { branchName } from "./inventory";

const item = z.object({
  key: z.string().max(80), cat: z.enum(CATS), name: z.string().trim().min(1).max(200), spec: z.string().max(80).default(""),
  color: z.string().max(60).default(""), cond: z.enum(CONDS).default("Nuevo"), serial: z.string().max(40).default(""),
  qty: z.number().int().min(1).max(100000), cost: z.number().int().min(0).max(1e10), price: z.number().int().min(0).max(1e10),
  warr: z.number().int().min(0).max(60), batt: z.number().int().min(0).max(100).nullable(), min: z.number().int().min(0).max(100000),
  notes: z.string().max(1000).default(""),
  acq: z.number().int().min(Date.UTC(2000, 0, 1)).max(Date.now() + 86_400_000).nullable().default(null),
});
export const inventoryBatch = z.object({ source: z.string().trim().min(1).max(120), items: z.array(item).min(1).max(500) });
export const MAX_INV_BATCH = 300;
const srcOf = (file: string) => "Importado: " + file;

/**
 * Carga el inventario inicial desde un archivo. Los iPhone entran «En revisión» (no se venden hasta registrar la
 * consulta oficial en CRC y Apple); lo demás entra «En vitrina». Se saltan los IMEI/seriales que ya existen o están
 * bloqueados, y volver a subir el mismo archivo no duplica.
 */
export async function importInventory(db: Db, a: Actor, raw: unknown) {
  need(a, "inv_edit");
  const { source, items: list } = inventoryBatch.parse(raw);
  if (list.length > MAX_INV_BATCH) throw new AppError(`Envía como máximo ${MAX_INV_BATCH} productos por tanda`, "invalid");
  const src = srcOf(source);
  const branch = await branchName(db);
  return db.transaction(async (tx) => {
    const serials = list.map((i) => i.serial).filter(Boolean);
    const taken = new Map(serials.length ? (await tx.select({ s: items.serial, st: items.status, id: items.id }).from(items).where(inArray(items.serial, serials))).filter((x) => x.st !== "Vendido").map((x) => [x.s, x.id]) : []);
    const blocked = new Set(serials.length ? (await tx.select({ i: imeiBlocklist.imei }).from(imeiBlocklist).where(inArray(imeiBlocklist.imei, serials))).map((x) => x.i) : []);
    const fromFile = await tx.select().from(items).where(eq(items.src, src));
    const skipped: { name: string; why: string }[] = [];
    let created = 0, units = 0, review = 0, value = 0;
    for (const it of list) {
      if (it.serial && taken.has(it.serial)) { skipped.push({ name: it.name, why: `ya está en el inventario (${taken.get(it.serial)})` }); continue; }
      if (it.serial && blocked.has(it.serial)) { skipped.push({ name: it.name, why: "IMEI en la lista de bloqueados" }); continue; }
      // Sin serial: el mismo producto del mismo archivo ya importado se salta (reimportar no duplica).
      if (!it.serial && it.key.startsWith("r:") && fromFile.some((x) => !x.serial && x.notes.includes(`[${it.key}]`))) { skipped.push({ name: it.name, why: "ya se importó de este archivo" }); continue; }
      const track = it.cat === "AirPods" || it.cat === "Accesorios" ? "qty" : "unit";
      const n = await nextCounter(tx, "item");
      const id = "I-" + String(n).padStart(4, "0");
      const status = it.cat === "iPhone" ? "En revisión" : "En vitrina";
      await tx.insert(items).values({
        id, sku: CAT_SKU[it.cat as Cat] + "-" + String(n).padStart(4, "0"), cat: it.cat, name: it.name, spec: it.spec, color: it.color, cond: it.cond,
        serial: it.serial, qty: track === "qty" ? it.qty : 1, cost: it.cost, price: it.price, warr: it.warr, branch, status, acq: it.acq ?? Date.now(), src,
        batt: it.batt, notes: [it.notes, it.serial ? "" : `[${it.key}]`].filter(Boolean).join(" "), repairs: 0, min: track === "qty" ? it.min : 0, track, imeiCheck: null, hold: null,
      });
      await addEvent(tx, id, a, "Ingreso al inventario", `Importado de ${source}`);
      if (status === "En revisión") await addEvent(tx, id, a, "En revisión", "Falta registrar la consulta oficial (CRC y Apple) para poder venderlo", "warn");
      if (!it.price) await addEvent(tx, id, a, "Sin precio de venta", "Ponle precio en «Editar» antes de venderlo", "warn");
      if (it.serial) taken.set(it.serial, id);
      created++; units += track === "qty" ? it.qty : 1; value += it.price * (track === "qty" ? it.qty : 1);
      if (status === "En revisión") review++;
    }
    if (created) await logFeed(tx, a, "owner", "📦", `Inventario importado de <b>${esc(source)}</b>: ${created} productos (${units} unidades, ${fmt(value)} a precio de venta)${review ? ` · ${review} iPhone en revisión` : ""} · ${esc(a.name)}`);
    return { created, units, review, value, skipped };
  });
}

/** Deshace una importación: borra lo que entró de ese archivo y todavía no se ha vendido, apartado ni movido. */
export async function undoInventoryImport(db: Db, a: Actor, source: string) {
  need(a, "inv_edit");
  need(a, "inv_delete");
  const src = srcOf(source);
  const del = await db.delete(items).where(and(
    eq(items.src, src),
    inArray(items.status, ["En vitrina", "En revisión"]),
    sql`${items.hold} is null`,
    sql`not exists (select 1 from sales s where s.lines @> jsonb_build_array(jsonb_build_object('item', ${items.id})))`,
  )).returning({ id: items.id });
  if (del.length) await logFeed(db, a, "owner", "🗑️", `Se deshizo la importación de inventario <b>${esc(source)}</b>: ${del.length} productos eliminados · ${esc(a.name)}`);
  return del.length;
}

export async function inventorySources(db: Db) {
  return db.select({ source: items.src, n: sql<number>`count(*)::int`, units: sql<number>`sum(case when ${items.track} = 'qty' then ${items.qty} else 1 end)::int` })
    .from(items).where(sql`${items.src} like 'Importado: %'`).groupBy(items.src);
}
