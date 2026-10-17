import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { items, itemEvents, settings, type ImeiCheck, type OfficialCheck } from "@/db/schema";
import { CATS, CAT_SKU, CONDS, type Cat } from "@/lib/catalog";
import { officialGate, OFFICIAL_LABEL, OFFICIAL_TEXT, type OfficialResult } from "@/lib/imei";
import { uname, isQty } from "@/lib/items";
import { fmt } from "@/lib/format";
import { AppError, addEvent, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { blockImei, verifyImei } from "./imei";

export const itemInput = z.object({
  cat: z.enum(CATS),
  name: z.string().trim().min(1, "Escribe el nombre del producto"),
  spec: z.string().trim().default(""),
  color: z.string().trim().default(""),
  cond: z.enum(CONDS).default("Nuevo"),
  serial: z.string().trim().default(""),
  qty: z.coerce.number().int().min(0).default(1),
  cost: z.coerce.number().int().min(0, "El costo no puede ser negativo").default(0),
  price: z.coerce.number().int().min(1, "Escribe el precio de venta"),
  warr: z.coerce.number().int().min(0).max(60).default(12),
  src: z.string().trim().default("Importación"),
  batt: z.coerce.number().int().min(0).max(100).nullable().default(null),
  notes: z.string().trim().default(""),
  min: z.coerce.number().int().min(0).default(0),
});
export type ItemInput = z.infer<typeof itemInput>;

const officialSchema = z.object({ crc: z.enum(["clean", "reported", "blocked"]), apple: z.enum(["clean", "locked"]) });
export type OfficialPayload = z.infer<typeof officialSchema>;

export async function branchName(db: Db) {
  const [s] = await db.select({ b: settings.branch }).from(settings).limit(1);
  return s?.b ?? "Tienda principal";
}

function checks(a: Actor, o: OfficialPayload): ImeiCheck {
  const mk = (r: OfficialResult): OfficialCheck => ({ r, by: a.id, name: a.name, t: Date.now() });
  return { crc: mk(o.crc), apple: mk(o.apple) };
}

/** Crea un producto. Los iPhone exigen IMEI válido, no duplicado y verificación oficial registrada. */
export async function createItem(
  db: Db,
  a: Actor,
  raw: unknown,
  opts: { official?: unknown; ownerApproved?: boolean } = {},
) {
  need(a, "inv_edit");
  const input = itemInput.parse(raw);
  const isPhone = input.cat === "iPhone";
  const track = input.cat === "AirPods" || input.cat === "Accesorios" ? "qty" : "unit";
  let check: ImeiCheck | null = null;
  let verifyNote: { text: string; tone: string } | null = null;

  if (isPhone) {
    const imei = input.serial.replace(/\D/g, "");
    const res = await verifyImei(db, imei);
    if (res.verdict === "blocked")
      throw new AppError(res.steps.find((s) => s.state === "fail")?.detail ?? "IMEI no válido", "invalid");
    const off = officialSchema.safeParse(opts.official);
    const gate = officialGate(res.verdict, off.success ? off.data : {});
    if (!gate.canSave) {
      if (off.success && off.data.crc !== "clean") {
        await blockImei(db, imei, "Consulta oficial: " + OFFICIAL_TEXT[off.data.crc], a.name);
        await logFeed(db, a, "owner", "🚨", `Alerta al dueño: consulta oficial de IMEI <b>••${imei.slice(-6)}</b> → <b>${OFFICIAL_TEXT[off.data.crc]}</b> · verificó ${esc(a.name)}`);
      }
      throw new AppError(gate.message, "invalid");
    }
    if (gate.needsOwner && !opts.ownerApproved)
      throw new AppError("Hace falta la aprobación del propietario/a para ingresar este equipo.", "invalid");
    check = checks(a, off.data!);
    input.serial = imei;
    verifyNote =
      res.verdict === "clean"
        ? { text: "Formato, modelo y duplicado correctos", tone: "ok" }
        : { text: "Advertencia aprobada por el propietario/a: " + res.steps.filter((s) => s.state === "warn").map((s) => s.detail).join(" | "), tone: "warn" };
  }

  const branch = await branchName(db);
  return db.transaction(async (tx) => {
    const n = await nextCounter(tx, "item");
    const id = "I-" + String(n).padStart(4, "0");
    const row = {
      id, sku: CAT_SKU[input.cat as Cat] + "-" + String(n).padStart(4, "0"), cat: input.cat, name: input.name, spec: input.spec,
      color: input.color, cond: input.cond, serial: input.serial, qty: track === "qty" ? input.qty : 1, cost: input.cost, price: input.price,
      warr: input.warr, branch, status: "En vitrina", acq: Date.now(), src: input.src, batt: input.batt, notes: input.notes, repairs: 0,
      min: input.min, track, imeiCheck: check, hold: null,
    };
    await tx.insert(items).values(row);
    await addEvent(tx, id, a, row.src === "Trade-in" ? "Trade-in recibido" : "Ingreso al inventario", row.src + (track === "qty" ? " · " + row.qty + " unidades" : ""));
    if (verifyNote) await addEvent(tx, id, a, "Verificación de IMEI", verifyNote.text, verifyNote.tone);
    if (check)
      for (const k of ["crc", "apple"] as const)
        await addEvent(tx, id, a, "Consulta oficial · " + OFFICIAL_LABEL[k], `${OFFICIAL_TEXT[check[k].r]} · verificó ${check[k].name}`, check[k].r === "clean" ? "ok" : "warn");
    await addEvent(tx, id, a, "En vitrina", branch);
    await logFeed(tx, a, "owner", "📦", `Nuevo ingreso: <b>${esc(uname(row))}</b>${track === "qty" ? " ×" + row.qty : ""} por ${esc(a.name)}`);
    return row;
  });
}

export const itemPatch = itemInput.pick({ name: true, spec: true, color: true, cond: true, qty: true, cost: true, price: true, warr: true, batt: true, notes: true, min: true }).partial();

export async function updateItem(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "inv_edit");
  const patch = itemPatch.parse(raw);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, id)).for("update");
    if (!it) throw new AppError("Producto no encontrado", "notfound");
    const ch: string[] = [];
    if (patch.price != null && patch.price !== it.price) ch.push(`Precio ${fmt(it.price)} → ${fmt(patch.price)}`);
    if (patch.cost != null && patch.cost !== it.cost) ch.push(`Costo ${fmt(it.cost)} → ${fmt(patch.cost)}`);
    if (patch.qty != null && isQty(it) && patch.qty !== it.qty) ch.push(`Cantidad ${it.qty} → ${patch.qty}`);
    if (patch.cond != null && patch.cond !== it.cond) ch.push(`Condición ${it.cond} → ${patch.cond}`);
    const next = { ...patch };
    if (!isQty(it)) delete next.qty;
    await tx.update(items).set(next).where(eq(items.id, id));
    await addEvent(tx, id, a, "Producto editado", ch.join(" · ") || "Sin cambios relevantes", ch.length ? "warn" : "");
    if (patch.price != null && patch.price !== it.price)
      await logFeed(tx, a, "reprice", "🏷️", `Precio de <b>${esc(uname(it))}</b>: ${fmt(it.price)} → ${fmt(patch.price)} por ${esc(a.name)}`);
    const [out] = await tx.select().from(items).where(eq(items.id, id));
    return out;
  });
}

export async function deleteItem(db: Db, a: Actor, id: string) {
  need(a, "inv_delete");
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it) throw new AppError("Producto no encontrado", "notfound");
  if (it.status === "Vendido" || it.hold) throw new AppError("No se puede eliminar un equipo vendido o apartado", "conflict");
  await db.delete(items).where(eq(items.id, id));
  await logFeed(db, a, "owner", "🗑️", `Producto eliminado: <b>${esc(uname(it))}</b> por ${esc(a.name)}`);
}

export type ItemFilter = { q?: string; cat?: string; cond?: string; status?: string };

export async function listItems(db: Db, f: ItemFilter = {}) {
  const rows = await db.select().from(items).orderBy(desc(items.acq));
  const q = (f.q ?? "").toLowerCase().trim();
  return rows.filter((it) => {
    if (f.cat && it.cat !== f.cat) return false;
    if (f.cond && it.cond !== f.cond) return false;
    if (f.status === "stock" && !(isQty(it) ? it.qty > 0 : it.status !== "Vendido")) return false;
    if (f.status && f.status !== "stock" && it.status !== f.status) return false;
    if (q && !(`${it.name} ${it.spec} ${it.color} ${it.serial} ${it.sku} ${it.id}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

export async function getItem(db: Db, id: string) {
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it) return null;
  const events = await db.select().from(itemEvents).where(eq(itemEvents.itemId, id)).orderBy(asc(itemEvents.t), asc(itemEvents.id));
  return { item: it, events };
}

/** Re-verificación de un equipo ya en inventario: automática + consulta oficial registrada por una persona. */
export async function reverifyItem(db: Db, a: Actor, id: string, rawOfficial: unknown) {
  need(a, "inv_view");
  const off = officialSchema.parse(rawOfficial);
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it || it.cat !== "iPhone") throw new AppError("Equipo no encontrado", "notfound");
  const auto = await verifyImei(db, it.serial, it.id);
  const check = checks(a, off);
  const bad: string[] = [];
  await db.transaction(async (tx) => {
    await addEvent(tx, id, a, "Re-verificación de IMEI (automática)", auto.verdict === "clean" ? "Sin cambios" : auto.steps.filter((s) => s.state !== "ok").map((s) => s.detail).join(" | "), auto.verdict === "clean" ? "ok" : "bad");
    for (const k of ["crc", "apple"] as const) {
      await addEvent(tx, id, a, "Consulta oficial · " + OFFICIAL_LABEL[k], `${OFFICIAL_TEXT[check[k].r]} · verificó ${check[k].name}`, check[k].r === "clean" ? "ok" : "bad");
      if (check[k].r !== "clean") bad.push(`${OFFICIAL_LABEL[k]}: ${OFFICIAL_TEXT[check[k].r]}`);
    }
    await tx.update(items).set({ imeiCheck: check }).where(eq(items.id, id));
    if (it.status === "En revisión" && check.crc.r === "clean" && check.apple.r === "clean") {
      await tx.update(items).set({ status: "En vitrina" }).where(eq(items.id, id));
      await addEvent(tx, id, a, "En vitrina", "Verificación oficial completa · " + it.branch, "ok");
    }
    if (check.crc.r !== "clean") await blockImei(tx, it.serial, "Consulta oficial: " + OFFICIAL_TEXT[check.crc.r], a.name);
    if (bad.length) await logFeed(tx, a, "owner", "🚨", `Re-verificación de <b>${esc(uname(it))}</b>: ${esc(bad.join(" · "))} · ${esc(a.name)}`);
  });
  return { bad };
}

export async function itemsByIds(db: Db, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(items).where(inArray(items.id, ids));
}
export { and };
