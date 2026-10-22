import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { feed, roles, settings, users } from "@/db/schema";
import { ALL_PERMS } from "@/lib/perms";
import { AppError, esc, logFeed, need, nextCounter, type Actor } from "./core";
import { hashPin } from "./auth";

const pin = z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 números");

export async function createUser(db: Db, a: Actor, raw: unknown) {
  need(a, "users");
  const v = z.object({ name: z.string().trim().min(2, "Escribe el nombre"), email: z.string().trim().default(""), role: z.string(), pin }).parse(raw);
  const [r] = await db.select().from(roles).where(eq(roles.key, v.role));
  if (!r) throw new AppError("Rol no válido", "invalid");
  if (r.locked && !a.locked) throw new AppError("Solo un desarrollador puede crear ese rol", "forbidden");
  const id = "u" + (await nextCounter(db, "user"));
  await db.insert(users).values({ id, name: v.name, email: v.email, role: v.role, active: true, pinHash: await hashPin(v.pin), createdAt: Date.now() });
  await logFeed(db, a, "owner", "👤", `Usuario creado: <b>${esc(v.name)}</b> (${esc(r.name)}) por ${esc(a.name)}`);
  return id;
}

async function otherAdmins(db: Db, exceptId: string) {
  const rows = await db.select({ id: users.id, perms: roles.perms, locked: roles.locked }).from(users).innerJoin(roles, eq(users.role, roles.key)).where(and(eq(users.active, true), ne(users.id, exceptId)));
  return rows.filter((r) => r.locked || r.perms.includes("users")).length;
}

export async function updateUser(db: Db, a: Actor, id: string, raw: unknown) {
  need(a, "users");
  const v = z.object({ role: z.string().optional(), active: z.boolean().optional(), pin: pin.optional() }).parse(raw);
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new AppError("Usuario no encontrado", "notfound");
  const [ur] = await db.select().from(roles).where(eq(roles.key, u.role));
  // El dueño puede desactivar al desarrollador, pero no ponerle PIN para entrar como él.
  if (v.pin && ur?.locked && !a.locked) throw new AppError("Solo un desarrollador puede cambiar el PIN de ese usuario", "forbidden");
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
  if (v.pin) { set.pinHash = await hashPin(v.pin); set.failed = 0; set.lockedUntil = 0; }
  if (!Object.keys(set).length) return;
  if (set.pinHash || set.active === false) set.sessionV = u.sessionV + 1;
  await db.update(users).set(set).where(eq(users.id, id));
  await logFeed(db, a, "owner", "👤", `Usuario actualizado: <b>${esc(u.name)}</b> por ${esc(a.name)}`);
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
});
export async function saveSettings(db: Db, a: Actor, raw: unknown) {
  need(a, "settings");
  const v = settingsInput.parse(raw);
  await db.update(settings).set(v).where(eq(settings.id, 1));
  await logFeed(db, a, "owner", "⚙️", `Configuración actualizada por ${esc(a.name)}`);
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
