import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { allies, allyMoves, imeiBlocklist, items, itemEvents, settings, tacModels, type ImeiCheck, type OfficialCheck } from "@/db/schema";
import { CATS, CAT_SKU, CONDS, type Cat } from "@/lib/catalog";
import { luhnOk, officialGate, OFFICIAL_LABEL, OFFICIAL_TEXT, type OfficialResult } from "@/lib/imei";
import { uname, isQty } from "@/lib/items";
import { fmt } from "@/lib/format";
import { AppError, addEvent, can, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { blockImei, verifyImei } from "./imei";
import { pendingAlta, requestDelete } from "./approvals";

/** Pesos enteros: tolera puntos, comas, «$» y espacios al escribir (1.500.000 → 1500000). */
const cop = z.preprocess((v) => (typeof v === "string" ? v.replace(/[^\d]/g, "") : v), z.coerce.number().int());

export const itemInput = z.object({
  cat: z.enum(CATS),
  name: z.string().trim().min(1, "Escribe el nombre del producto"),
  spec: z.string().trim().default(""),
  color: z.string().trim().default(""),
  cond: z.enum(CONDS).default("Nuevo"),
  serial: z.string().trim().default(""),
  serial2: z.string().trim().default(""),
  qty: z.coerce.number().int().min(0).default(1),
  cost: cop.pipe(z.number().min(0, "El costo no puede ser negativo")).default(0),
  price: cop.pipe(z.number().min(1, "Escribe el precio de venta")),
  warr: z.coerce.number().int().min(0).max(60).default(12),
  src: z.string().trim().default("Importación"),
  batt: z.coerce.number().int().min(0).max(100).nullable().default(null),
  notes: z.string().trim().default(""),
  min: z.coerce.number().int().min(0).default(0),
  /** Tienda aliada dueña del producto; vacío = propio. */
  ally: z.string().trim().default(""),
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

/** Valida el segundo IMEI: 15 dígitos, dígito de control, distinto del primero y que no esté en otro equipo. */
export async function checkImei2(db: Db, raw: string, imei1: string, exceptId = "") {
  const v = raw.replace(/\D/g, "");
  if (!v) return "";
  if (v.length !== 15 || !luhnOk(v)) throw new AppError(`El IMEI 2 no es válido: «${raw}»`, "invalid");
  if (v === imei1) throw new AppError("El IMEI 2 no puede ser igual al IMEI 1", "invalid");
  const [dup] = await db.select({ id: items.id }).from(items).where(sql`(${items.serial} = ${v} or ${items.serial2} = ${v}) and ${items.id} <> ${exceptId}`).limit(1);
  if (dup) throw new AppError(`El IMEI 2 ya está registrado en ${dup.id}`, "invalid");
  const [bl] = await db.select({ r: imeiBlocklist.reason }).from(imeiBlocklist).where(eq(imeiBlocklist.imei, v)).limit(1);
  if (bl) throw new AppError(`El IMEI 2 está bloqueado: ${bl.r}`, "invalid");
  return v;
}

export type PreparedItem = Awaited<ReturnType<typeof prepareItem>>;

/**
 * Valida un producto nuevo sin guardarlo: permisos, IMEI (formato, duplicado, bloqueados) y verificación oficial.
 * Los iPhone exigen IMEI válido, no duplicado y verificación oficial registrada.
 */
export async function prepareItem(db: Db, a: Actor, raw: unknown, opts: { official?: unknown; ownerApproved?: boolean } = {}) {
  const input = itemInput.parse(raw);
  // Las retomas las puede recibir quien tenga el permiso de trade-in, aunque no edite el inventario.
  if (!(input.src === "Trade-in" && can(a, "tradein"))) need(a, "inv_edit");
  const isPhone = input.cat === "iPhone";
  const track = input.cat === "AirPods" || input.cat === "Accesorios" ? "qty" : "unit";
  let check: ImeiCheck | null = null;
  let verifyNote: { text: string; tone: string } | null = null;
  let ally: typeof allies.$inferSelect | null = null;
  if (input.ally) {
    [ally] = await db.select().from(allies).where(eq(allies.id, input.ally));
    if (!ally || !ally.active) throw new AppError("La tienda aliada no existe o está inactiva", "invalid");
    if (!(input.cost > 0)) throw new AppError("Escribe cuánto se le paga a la tienda aliada por este producto (costo)", "invalid");
    input.src = "Aliada: " + ally.name;
  }

  if (isPhone && input.batt == null) throw new AppError("Escribe la salud de la batería (%) del equipo", "invalid");
  if (isPhone && input.serial2) input.serial2 = await checkImei2(db, input.serial2, input.serial.replace(/\D/g, ""));
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
  return { input, track, check, verifyNote, isPhone, ally };
}

/** Guarda un producto ya validado con `prepareItem` (dentro de la transacción que se le pase). */
export async function insertItem(tx: Db, a: Actor, p: PreparedItem, how: { title?: string; detail?: string } = {}) {
  const { input, track, check, verifyNote, isPhone, ally } = p;
  const branch = await branchName(tx);
  const n = await nextCounter(tx, "item");
  const id = "I-" + String(n).padStart(4, "0");
  const row = {
    id, sku: CAT_SKU[input.cat as Cat] + "-" + String(n).padStart(4, "0"), cat: input.cat, name: input.name, spec: input.spec,
    color: input.color, cond: input.cond, serial: input.serial, serial2: input.serial2, qty: track === "qty" ? input.qty : 1, cost: input.cost, price: input.price,
    warr: input.warr, branch, status: "En vitrina", acq: Date.now(), src: input.src, batt: input.batt, notes: input.notes, repairs: 0,
    min: input.min, track, imeiCheck: check, hold: null, ally: ally?.id ?? "", approval: pendingAlta(a),
  };
  await tx.insert(items).values(row);
  await addEvent(tx, id, a, how.title ?? (row.src === "Trade-in" ? "Trade-in recibido" : "Ingreso al inventario"), how.detail ?? row.src + (track === "qty" ? " · " + row.qty + " unidades" : ""));
  if (verifyNote) await addEvent(tx, id, a, "Verificación de IMEI", verifyNote.text, verifyNote.tone);
  if (check)
    for (const k of ["crc", "apple"] as const)
      await addEvent(tx, id, a, "Consulta oficial · " + OFFICIAL_LABEL[k], `${OFFICIAL_TEXT[check[k].r]} · verificó ${check[k].name}`, check[k].r === "clean" ? "ok" : "warn");
  if (row.approval) await logFeed(tx, a, "owner", "🕒", `${esc(a.name)} ingresó <b>${esc(uname(row))}</b> · espera tu aprobación para venderse`);
  await addEvent(tx, id, a, "En vitrina", branch);
  if (ally?.mode === "compra") {
    const amount = row.cost * row.qty;
    await tx.insert(allyMoves).values({ ally: ally.id, t: Date.now(), kind: "deuda", amount, ref: id, detail: `Recibido: ${uname(row)}${track === "qty" ? " ×" + row.qty : ""}`, by: a.name });
  }
  if (isPhone && input.name) await tx.insert(tacModels).values({ tac: input.serial.slice(0, 8), name: input.name, t: Date.now(), by: a.name }).onConflictDoNothing();
  await logFeed(tx, a, "owner", "📦", `Nuevo ingreso: <b>${esc(uname(row))}</b>${track === "qty" ? " ×" + row.qty : ""}${ally ? " de " + esc(ally.name) : ""} por ${esc(a.name)}`);
  return row;
}

/** Crea un producto. Los iPhone exigen IMEI válido, no duplicado y verificación oficial registrada. */
export async function createItem(db: Db, a: Actor, raw: unknown, opts: { official?: unknown; ownerApproved?: boolean } = {}) {
  const p = await prepareItem(db, a, raw, opts);
  return db.transaction((tx) => insertItem(tx, a, p));
}

export const itemPatch = itemInput.pick({ serial2: true, name: true, spec: true, color: true, cond: true, qty: true, cost: true, price: true, warr: true, batt: true, notes: true, min: true }).partial();

export async function updateItem(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "inv_edit");
  // Solo los campos enviados (los valores por defecto del esquema no deben borrar datos, p. ej. el IMEI 2 o la batería).
  const sent = raw && typeof raw === "object" ? Object.keys(raw).filter((k) => (raw as Record<string, unknown>)[k] !== undefined) : [];
  const patch = Object.fromEntries(Object.entries(itemPatch.parse(raw)).filter(([k]) => sent.includes(k))) as z.infer<typeof itemPatch>;
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, id)).for("update");
    if (!it) throw new AppError("Producto no encontrado", "notfound");
    const ch: string[] = [];
    if (patch.price != null && patch.price !== it.price) ch.push(`Precio ${fmt(it.price)} → ${fmt(patch.price)}`);
    if (patch.cost != null && patch.cost !== it.cost) ch.push(`Costo ${fmt(it.cost)} → ${fmt(patch.cost)}`);
    if (patch.qty != null && isQty(it) && patch.qty !== it.qty) ch.push(`Cantidad ${it.qty} → ${patch.qty}`);
    if (patch.cond != null && patch.cond !== it.cond) ch.push(`Condición ${it.cond} → ${patch.cond}`);
    if (patch.serial2 != null) patch.serial2 = await checkImei2(tx, patch.serial2, it.serial, it.id);
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
  // Quien no es la propietaria solo puede pedir la eliminación: el producto sigue igual hasta que ella apruebe.
  return requestDelete(db, a, id);
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
    if (q && !(`${it.name} ${it.spec} ${it.color} ${it.serial} ${it.serial2} ${it.sku} ${it.id}`.toLowerCase().includes(q))) return false;
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

/**
 * Importa modelos por TAC desde un CSV (por ejemplo el de la base abierta de Osmocom: tacdb.osmocom.org).
 * Acepta «tac,nombre» o «tac,marca,nombre…»; solo se guardan filas de Apple.
 */
export async function importTacCsv(db: Db, a: Actor, text: string) {
  need(a, "settings");
  if (text.length > 30_000_000) throw new AppError("El archivo es muy grande", "invalid");
  const rows: { tac: string; name: string; t: number; by: string }[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim());
    const tac = cells[0]?.replace(/\D/g, "");
    if (!tac || tac.length !== 8 || seen.has(tac)) continue;
    const rest = cells.slice(1).filter(Boolean);
    if (!/apple|iphone/i.test(rest.join(" "))) continue;
    const name = rest.join(" ").replace(/^apple\s+(inc\.?)?\s*/i, "").trim();
    if (!name) continue;
    seen.add(tac);
    rows.push({ tac, name, t: Date.now(), by: a.name });
  }
  for (let i = 0; i < rows.length; i += 500)
    await db.insert(tacModels).values(rows.slice(i, i + 500)).onConflictDoUpdate({ target: tacModels.tac, set: { name: sqlExcluded("name") } });
  await logFeed(db, a, "owner", "📚", `Modelos por TAC importados: <b>${rows.length}</b> por ${esc(a.name)}`);
  return rows.length;
}
const sqlExcluded = (col: string) => sql.raw(`excluded."${col}"`);

/**
 * Pasa a vitrina todos los equipos «En revisión» sin registrar la consulta oficial uno por uno.
 * Solo administradores (permiso de usuarios); queda en el historial de cada equipo quién lo aprobó.
 */
export async function releaseAllReview(db: Db, a: Actor) {
  need(a, "inv_edit");
  need(a, "users");
  return db.transaction(async (tx) => {
    const rows = await tx.update(items).set({ status: "En vitrina" }).where(eq(items.status, "En revisión")).returning({ id: items.id });
    for (const r of rows) await addEvent(tx, r.id, a, "En vitrina", `Pasado a vitrina por ${a.name} sin consulta oficial registrada en el sistema`, "warn");
    if (rows.length) await logFeed(tx, a, "owner", "✅", `${rows.length} equipos pasados de «En revisión» a vitrina por <b>${esc(a.name)}</b>`);
    return rows.length;
  });
}

/** Pone precio a los productos sin precio de venta: costo + la ganancia en pesos que elija la tienda. */
export async function priceUnpriced(db: Db, a: Actor, gain: number) {
  need(a, "inv_edit");
  const g = z.coerce.number().int().min(1, "Escribe la ganancia en pesos").max(1e9).parse(gain);
  return db.transaction(async (tx) => {
    const rows = await tx.update(items).set({ price: sql`${items.cost} + ${items.repairs} + ${g}` })
      .where(and(eq(items.price, 0), sql`${items.cost} > 0`, inArray(items.status, ["En vitrina", "En revisión"]))).returning({ id: items.id, price: items.price });
    for (const r of rows) await addEvent(tx, r.id, a, "Precio asignado", `Costo + reparaciones + ${fmt(g)} = ${fmt(r.price)}`);
    if (rows.length) await logFeed(tx, a, "reprice", "🏷️", `${rows.length} productos sin precio quedaron en costo + ${fmt(g)} · ${esc(a.name)}`);
    return rows.length;
  });
}
