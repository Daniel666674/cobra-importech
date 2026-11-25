import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { counters, feed, items, roles, sales, settings, users } from "@/db/schema";
import { CONDS, DEFAULT_CATDEFS, METHODS, catDefs } from "@/lib/catalog";
import { ALL_PERMS } from "@/lib/perms";
import { AppError, diffText, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { randomInt } from "node:crypto";
import { USERNAME_RE, tempPassword } from "@/lib/password";
import { hashPin } from "./auth";

export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_RE, "El usuario debe tener de 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo");

/** Contraseña temporal aleatoria (criptográficamente segura). */
export const newTempPassword = () => tempPassword((n) => randomInt(n));

export async function assertUsernameFree(db: Db, username: string, exceptId?: string) {
  const [x] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (x && x.id !== exceptId) throw new AppError(`El usuario «${username}» ya existe`, "conflict");
}

/** Crea un usuario con contraseña temporal (se muestra una sola vez; la debe cambiar al entrar). */
export async function createUser(db: Db, a: Actor, raw: unknown) {
  need(a, "users");
  const v = z.object({ name: z.string().trim().min(2, "Escribe el nombre"), username: usernameSchema, email: z.string().trim().default(""), role: z.string() }).parse(raw);
  const [r] = await db.select().from(roles).where(eq(roles.key, v.role));
  if (!r) throw new AppError("Rol no válido", "invalid");
  if (r.locked && !a.locked) throw new AppError("Solo un desarrollador puede crear ese rol", "forbidden");
  await assertUsernameFree(db, v.username);
  const id = "u" + (await nextCounter(db, "user"));
  const temp = newTempPassword();
  await db.insert(users).values({ id, name: v.name, username: v.username, email: v.email, role: v.role, active: true, pinHash: await hashPin(temp), mustChange: true, createdAt: Date.now() });
  await logFeed(db, a, "owner", "👤", `Usuario creado: <b>${esc(v.name)}</b> (${esc(v.username)} · ${esc(r.name)}) por ${esc(a.name)}`);
  return { id, temp };
}

async function otherAdmins(db: Db, exceptId: string) {
  const rows = await db.select({ id: users.id, perms: roles.perms, locked: roles.locked }).from(users).innerJoin(roles, eq(users.role, roles.key)).where(and(eq(users.active, true), ne(users.id, exceptId)));
  return rows.filter((r) => r.locked || r.perms.includes("users")).length;
}

export async function updateUser(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "users");
  const v = z.object({ role: z.string().optional(), active: z.boolean().optional(), resetPassword: z.boolean().optional(), username: usernameSchema.optional() }).parse(raw);
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new AppError("Usuario no encontrado", "notfound");
  const [ur] = await db.select().from(roles).where(eq(roles.key, u.role));
  // El dueño puede desactivar al desarrollador, pero no restablecerle la contraseña para entrar como él.
  if ((v.resetPassword || v.username) && ur?.locked && !a.locked) throw new AppError("Solo un desarrollador puede cambiar la contraseña o el usuario de ese usuario", "forbidden");
  const set: Partial<typeof users.$inferInsert> = {};
  if (v.role && v.role !== u.role) {
    const [r] = await db.select().from(roles).where(eq(roles.key, v.role));
    if (!r) throw new AppError("Rol no válido", "invalid");
    if (r.locked && !a.locked) throw new AppError("Solo un desarrollador puede asignar ese rol", "forbidden");
    set.role = v.role;
  }
  if (v.active === false && u.active) set.active = false;
  if (v.active === true) set.active = true;
  if ((set.role || set.active === false) && (await otherAdmins(db, id)) === 0) {
    const [cur] = await db.select().from(roles).where(eq(roles.key, set.role ?? u.role));
    if (set.active === false || !(cur.locked || cur.perms.includes("users"))) throw new AppError("Debe quedar al menos un administrador activo", "conflict");
  }
  if (v.username && v.username !== u.username) { await assertUsernameFree(db, v.username, id); set.username = v.username; }
  let temp: string | undefined;
  if (v.resetPassword) { temp = newTempPassword(); set.pinHash = await hashPin(temp); set.mustChange = true; set.failed = 0; set.lockedUntil = 0; }
  if (!Object.keys(set).length) return {};
  if (set.pinHash || set.active === false) set.sessionV = u.sessionV + 1;
  await db.update(users).set(set).where(eq(users.id, id));
  await logFeed(db, a, "owner", temp ? "🔑" : "👤", `${temp ? "Contraseña restablecida" : "Usuario actualizado"}: <b>${esc(u.name)}</b> por ${esc(a.name)}`);
  return { temp };
}

export async function saveRolePerms(db: Db, a: Actor, key: string, perms: string[]) {
  need(a, "users");
  const [r] = await db.select().from(roles).where(eq(roles.key, key));
  if (!r) throw new AppError("Rol no encontrado", "notfound");
  if (r.locked) throw new AppError("Este rol no se puede cambiar", "forbidden");
  const clean = perms.filter((p) => ALL_PERMS.includes(p as never) && (p !== "dev" || a.locked));
  await db.update(roles).set({ perms: clean }).where(eq(roles.key, key));
  const on = clean.filter((p) => !r.perms.includes(p)), off = r.perms.filter((p) => !clean.includes(p));
  await logFeed(db, a, "owner", "🔐", `Permisos del rol <b>${esc(r.name)}</b> actualizados por ${esc(a.name)}${on.length ? " · activó: " + on.map(esc).join(", ") : ""}${off.length ? " · quitó: " + off.map(esc).join(", ") : ""}`);
}

export const settingsInput = z.object({
  name: z.string().trim().min(1), legal: z.string().default(""), nit: z.string().default(""), address: z.string().default(""),
  phone: z.string().default(""), email: z.string().default(""), footer: z.string().default(""), brand: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1F2937"),
  maxDisc: z.coerce.number().int().min(0).max(100), minMargin: z.coerce.number().int().min(0).max(100), trm: z.coerce.number().int().min(1),
  agedDays: z.coerce.number().int().min(1), holdDays: z.coerce.number().int().min(1).max(60), apartadoMinPct: z.coerce.number().int().min(1).max(100),
  ownerPhone: z.string().regex(/^\d{10,13}$/, "El celular del dueño debe tener solo números (10 a 13 dígitos)").or(z.literal("")).default(""),
  city: z.string().trim().max(80).default(""),
  whatsapp: z.string().regex(/^\d{10,13}$/, "El WhatsApp de la tienda debe tener solo números (10 a 13 dígitos)").or(z.literal("")).default(""),
  web: z.string().trim().max(120).default(""),
  instagram: z.string().trim().max(60).transform((x) => x.replace(/^@/, "")).default(""),
  taxNote: z.string().trim().max(160).default(""),
  legalNote: z.string().trim().max(600).default(""),
  invTitle: z.string().trim().min(3, "Escribe el título del comprobante").max(60).default("Comprobante de venta"),
  showSignatures: z.boolean().default(true),
  autoSend: z.boolean().default(true),
  waReceipt: z.string().trim().max(500).default(""),
}).superRefine((v, ctx) => {
  if (v.nit && !/^[\d.]{5,15}(-\d)?$/.test(v.nit)) ctx.addIssue({ code: "custom", message: "El NIT debe tener solo números, puntos y el dígito de verificación (ej. 901.234.567-8)" });
  if (v.email && !z.email().safeParse(v.email).success) ctx.addIssue({ code: "custom", message: "El correo no es válido" });
});
export async function saveSettings(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = settingsInput.parse(raw);
  const [before] = await db.select().from(settings).where(eq(settings.id, 1));
  await db.update(settings).set(v).where(eq(settings.id, 1));
  const labels: Record<string, string> = { name: "Nombre", legal: "Razón social", nit: "NIT", address: "Dirección", city: "Ciudad", phone: "Teléfono", whatsapp: "WhatsApp", email: "Correo", web: "Web", instagram: "Instagram", footer: "Pie", brand: "Color", maxDisc: "Descuento máx. (%)", minMargin: "Margen mín. (%)", trm: "TRM", agedDays: "Días para «antiguo»", holdDays: "Días de apartado", apartadoMinPct: "Abono mínimo (%)", ownerPhone: "Celular del dueño", taxNote: "Nota tributaria", legalNote: "Nota legal", invTitle: "Título del comprobante", showSignatures: "Firmas", autoSend: "Envío automático por correo", waReceipt: "Mensaje de WhatsApp" };
  const d = before ? diffText(before as never, v as never, labels, (_k, x) => (typeof x === "boolean" ? (x ? "sí" : "no") : x === "" || x == null ? "—" : String(x))) : [];
  await logFeed(db, a, "owner", "⚙️", `Configuración actualizada por ${esc(a.name)}${d.length ? ": " + d.join(" · ") : " (sin cambios)"}`);
}
/** Prefijo y siguiente número de comprobante. Nunca se puede retroceder (evita números repetidos). */
export async function saveNumbering(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.object({
    prefix: z.string().trim().max(10).regex(/^[A-Za-z0-9-]*$/, "El prefijo solo admite letras, números y guion"),
    next: z.coerce.number().int().min(1).max(99_999_999),
  }).parse(raw);
  const no = v.prefix + v.next;
  const [dup] = await db.select({ id: sales.id }).from(sales).where(eq(sales.no, no)).limit(1);
  if (dup) throw new AppError(`Ya existe una venta con el número ${no}`, "conflict");
  await db.insert(counters).values({ key: "invoice", value: v.next - 1 }).onConflictDoUpdate({ target: counters.key, set: { value: v.next - 1 } });
  await db.update(settings).set({ invPrefix: v.prefix }).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "🔢", `Numeración de comprobantes: el siguiente será <b>${esc(no)}</b> · ${esc(a.name)}`);
}

/** Meses de garantía por condición y condiciones impresas en el comprobante. */
export async function saveWarranty(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.object({
    warr: z.record(z.enum(CONDS), z.coerce.number().int().min(1, "Todo producto lleva garantía: mínimo 1 mes").max(60, "Máximo 60 meses")),
    terms: z.array(z.string().trim().max(300)).max(12, "Máximo 12 condiciones").transform((t) => t.filter(Boolean)),
  }).parse(raw);
  await db.update(settings).set({ warr: v.warr, warrTerms: v.terms }).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "🛡️", `Garantías actualizadas por ${esc(a.name)}`);
}

/** Formas de pago que aparecen en caja y apartados. */
export async function saveMethods(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const r = z.union([z.array(z.enum(METHODS)), z.object({ on: z.array(z.enum(METHODS)), surcharges: z.record(z.string(), z.coerce.number().min(0, "El recargo no puede ser negativo").max(50, "Máximo 50 %")) })]).parse(raw);
  const v = Array.isArray(r) ? r : r.on;
  if (!v.length) throw new AppError("Deja al menos una forma de pago", "invalid");
  const set: Partial<typeof settings.$inferInsert> = { methods: v.length === METHODS.length ? [] : v };
  if (!Array.isArray(r)) set.surcharges = Object.fromEntries(Object.entries(r.surcharges).filter(([k, x]) => (METHODS as readonly string[]).includes(k) && x > 0));
  await db.update(settings).set(set).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "⚙️", `Formas de pago y recargos actualizados: ${v.length === METHODS.length ? "todas activas" : v.map(esc).join(", ")}${set.surcharges ? " · recargos " + Object.entries(set.surcharges).map(([k, x]) => `${esc(k)} ${x}%`).join(", ") : ""} · ${esc(a.name)}`);
}

const MAX_LOGO = 400_000;
export async function saveLogo(db: Db, a: Actor, dataUrl: string) {
  need(a, "settings");
  if (dataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new AppError("El logo debe ser PNG, JPG o WebP", "invalid");
  if (dataUrl.length > MAX_LOGO) throw new AppError("El logo es muy pesado (máx. ~300 KB)", "invalid");
  await db.update(settings).set({ logo: dataUrl }).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "⚙️", `${dataUrl ? "Logo del negocio actualizado" : "Logo del negocio quitado"} · ${esc(a.name)}`);
}

export async function recentFeed(db: Db, limit = 40, type?: string) {
  const q = db.select().from(feed);
  return (type ? q.where(eq(feed.type, type)) : q.where(ne(feed.type, "acceso"))).orderBy(desc(feed.t), desc(feed.id)).limit(limit);
}
export async function countUsers(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}

/** Bancos o cuentas a los que entran las transferencias (se eligen al cobrar). */
export async function saveBanks(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.array(z.string().trim().min(1).max(40)).max(20, "Máximo 20 bancos").parse(raw);
  const banks = [...new Set(v)];
  await db.update(settings).set({ banks }).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "🏦", `Bancos para transferencias: ${banks.map(esc).join(", ") || "ninguno"} · ${esc(a.name)}`);
  return banks;
}

/** Porcentajes por condición y descuentos por defecto de las retomas. */
export async function saveTradeinConfig(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.object({
    rates: z.record(z.string(), z.coerce.number().min(1, "El porcentaje debe ser entre 1 y 100").max(100, "El porcentaje debe ser entre 1 y 100")),
    deds: z.array(z.object({ key: z.string().trim().min(1).max(30).regex(/^[a-z0-9_]+$/, "Clave no válida"), label: z.string().trim().min(2, "Escribe el nombre de cada defecto").max(60), pct: z.coerce.number().min(0).max(60, "Un defecto no puede restar más del 60 %") })).max(15),
    reset: z.boolean().default(false),
  }).parse(raw);
  const [before] = await db.select().from(settings).where(eq(settings.id, 1));
  const keys = new Set<string>();
  for (const d of v.deds) { if (keys.has(d.key)) throw new AppError("Hay dos defectos con la misma clave", "invalid"); keys.add(d.key); }
  const next = v.reset ? { tradeRates: {}, tradeDeds: [] } : { tradeRates: v.rates, tradeDeds: v.deds };
  await db.update(settings).set(next).where(eq(settings.id, 1));
  const rd = Object.entries(next.tradeRates).filter(([k, x]) => (before?.tradeRates ?? {})[k] !== x).map(([k, x]) => `${esc(k)} ${x}%`);
  await logFeed(db, a, "owner", "🔄", `${v.reset ? "Cotizador de retomas restablecido a los valores de fábrica" : `Cotizador de retomas actualizado${rd.length ? ": " + rd.join(", ") : ""}${JSON.stringify(before?.tradeDeds ?? []) !== JSON.stringify(next.tradeDeds) ? " · defectos modificados" : ""}`} · ${esc(a.name)}`);
}

const catInput = z.object({
  cats: z.array(z.object({
    name: z.string().trim().min(2, "Cada categoría necesita un nombre (mínimo 2 letras)").max(30, "El nombre de la categoría es muy largo"),
    kind: z.enum(["unit", "qty"]),
    sku: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, "El código del SKU son 2 a 4 letras (ej. CAM)"),
    active: z.boolean().default(true),
  })).min(1).max(40),
});
/** Orden, visibilidad y categorías propias. Las de fábrica solo se pueden ocultar; las propias solo se borran si no tienen productos. */
export async function saveCategories(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const { cats } = catInput.parse(raw);
  const names = new Set<string>(), skus = new Set<string>();
  for (const c of cats) {
    const k = c.name.toLowerCase();
    if (names.has(k)) throw new AppError(`La categoría «${c.name}» está repetida`, "invalid");
    names.add(k);
    const builtin = DEFAULT_CATDEFS.find((d) => d.name === c.name);
    const sku = builtin ? builtin.sku : c.sku;
    if (skus.has(sku)) throw new AppError(`El código ${sku} lo usan dos categorías`, "invalid");
    skus.add(sku);
  }
  for (const d of DEFAULT_CATDEFS) if (!cats.some((c) => c.name === d.name)) throw new AppError(`«${d.name}» es una categoría de fábrica: no se puede quitar, solo ocultar`, "invalid");
  if (!cats.some((c) => c.active)) throw new AppError("Deja al menos una categoría activa", "invalid");
  const [before] = await db.select({ c: settings.categories }).from(settings).where(eq(settings.id, 1));
  const prev = catDefs(before?.c);
  const used = await db.select({ cat: items.cat, n: count() }).from(items).groupBy(items.cat);
  for (const p of prev.filter((x) => !x.builtin)) if (!cats.some((c) => c.name === p.name) && (used.find((u) => u.cat === p.name)?.n ?? 0) > 0) throw new AppError(`«${p.name}» tiene productos: no se puede borrar, solo ocultar`, "invalid");
  const stored = cats.map((c) => ({ name: c.name, kind: c.kind, sku: DEFAULT_CATDEFS.find((d) => d.name === c.name)?.sku ?? c.sku, active: c.active }));
  await db.update(settings).set({ categories: stored }).where(eq(settings.id, 1));
  const now = catDefs(stored);
  const added = now.filter((n) => !prev.some((p) => p.name === n.name)).map((n) => n.name), removed = prev.filter((p) => !now.some((n) => n.name === p.name)).map((p) => p.name);
  const toggled = now.filter((n) => prev.find((p) => p.name === n.name && p.active !== n.active)).map((n) => `${n.name} ${n.active ? "activada" : "oculta"}`);
  await logFeed(db, a, "owner", "📦", `Categorías actualizadas por ${esc(a.name)}${added.length ? " · nuevas: " + added.map(esc).join(", ") : ""}${removed.length ? " · borradas: " + removed.map(esc).join(", ") : ""}${toggled.length ? " · " + toggled.map(esc).join(", ") : ""}`);
}

const branchInput = z.object({
  main: z.string().trim().min(2, "Elige la sede principal").max(40),
  list: z.array(z.object({ name: z.string().trim().min(2, "Cada sede necesita un nombre (mínimo 2 letras)").max(40), from: z.string().trim().max(40).optional() })).min(1, "Deja al menos una sede").max(20),
});
/** Sedes del negocio (la lista completa): agregar, renombrar (se actualizan sus productos y ventas), elegir la principal y quitar las vacías. */
export async function saveBranches(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = branchInput.parse(raw);
  const names = v.list.map((x) => x.name);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) throw new AppError("Hay dos sedes con el mismo nombre", "invalid");
  if (!names.includes(v.main)) throw new AppError("La sede principal debe estar en la lista", "invalid");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
    const before = [...new Set([cur?.branch ?? "Tienda principal", ...(cur?.branches ?? [])])];
    const renames: [string, string][] = v.list.filter((x) => x.from && x.from !== x.name && before.includes(x.from)).map((x) => [x.from!, x.name]);
    for (const [from, to] of renames) {
      await tx.update(items).set({ branch: to }).where(eq(items.branch, from));
      await tx.update(sales).set({ branch: to }).where(eq(sales.branch, from));
    }
    const origin = new Set(v.list.map((x) => x.from).filter(Boolean) as string[]);
    for (const b of before) {
      if (origin.has(b) || names.includes(b)) continue;
      const [{ n }] = await tx.select({ n: count() }).from(items).where(eq(items.branch, b));
      if (n > 0) throw new AppError(`La sede «${b}» tiene ${n} producto${n !== 1 ? "s" : ""}: trasládalos a otra sede antes de quitarla`, "invalid");
    }
    await tx.update(settings).set({ branch: v.main, branches: names.filter((n) => n !== v.main) }).where(eq(settings.id, 1));
    const added = names.filter((n) => !before.includes(n) && !renames.some(([, t]) => t === n));
    const removed = before.filter((b) => !origin.has(b) && !names.includes(b));
    await logFeed(tx, a, "owner", "📦", `Sedes actualizadas por ${esc(a.name)}: principal <b>${esc(v.main)}</b>${added.length ? " · nuevas: " + added.map(esc).join(", ") : ""}${renames.length ? " · renombradas: " + renames.map(([f, t]) => `${esc(f)} → ${esc(t)}`).join(", ") : ""}${removed.length ? " · quitadas: " + removed.map(esc).join(", ") : ""}`);
  });
}
