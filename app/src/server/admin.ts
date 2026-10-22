import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { counters, feed, roles, sales, settings, users } from "@/db/schema";
import { CONDS, METHODS } from "@/lib/catalog";
import { ALL_PERMS } from "@/lib/perms";
import { AppError, esc, logFeed, need, nextCounter, type Actor } from "./core";
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
  await logFeed(db, a, "owner", "🔐", `Permisos del rol <b>${esc(r.name)}</b> actualizados por ${esc(a.name)}`);
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
}).superRefine((v, ctx) => {
  if (v.nit && !/^[\d.]{5,15}(-\d)?$/.test(v.nit)) ctx.addIssue({ code: "custom", message: "El NIT debe tener solo números, puntos y el dígito de verificación (ej. 901.234.567-8)" });
  if (v.email && !z.email().safeParse(v.email).success) ctx.addIssue({ code: "custom", message: "El correo no es válido" });
});
export async function saveSettings(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = settingsInput.parse(raw);
  await db.update(settings).set(v).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "⚙️", `Configuración actualizada por ${esc(a.name)}`);
}
/** Prefijo y siguiente número de comprobante. Nunca se puede retroceder (evita números repetidos). */
export async function saveNumbering(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.object({
    prefix: z.string().trim().max(10).regex(/^[A-Za-z0-9-]*$/, "El prefijo solo admite letras, números y guion"),
    next: z.coerce.number().int().min(1).max(99_999_999),
  }).parse(raw);
  const [c] = await db.select().from(counters).where(eq(counters.key, "invoice"));
  const cur = c?.value ?? 0;
  if (v.next <= cur) throw new AppError(`El siguiente número debe ser mayor a ${cur} (el último usado)`, "invalid");
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
    warr: z.record(z.enum(CONDS), z.coerce.number().int().min(0, "Los meses no pueden ser negativos").max(60, "Máximo 60 meses")),
    terms: z.array(z.string().trim().max(300)).max(12, "Máximo 12 condiciones").transform((t) => t.filter(Boolean)),
  }).parse(raw);
  await db.update(settings).set({ warr: v.warr, warrTerms: v.terms }).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "🛡️", `Garantías actualizadas por ${esc(a.name)}`);
}

/** Formas de pago que aparecen en caja y apartados. */
export async function saveMethods(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = z.array(z.enum(METHODS)).min(1, "Deja al menos una forma de pago").parse(raw);
  await db.update(settings).set({ methods: v.length === METHODS.length ? [] : v }).where(eq(settings.id, 1));
}

const MAX_LOGO = 400_000;
export async function saveLogo(db: Db, a: Actor, dataUrl: string) {
  need(a, "settings");
  if (dataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new AppError("El logo debe ser PNG, JPG o WebP", "invalid");
  if (dataUrl.length > MAX_LOGO) throw new AppError("El logo es muy pesado (máx. ~300 KB)", "invalid");
  await db.update(settings).set({ logo: dataUrl }).where(eq(settings.id, 1));
}

export async function recentFeed(db: Db, limit = 40, type?: string) {
  const q = db.select().from(feed);
  return (type ? q.where(eq(feed.type, type)) : q).orderBy(desc(feed.t), desc(feed.id)).limit(limit);
}
export async function countUsers(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}
