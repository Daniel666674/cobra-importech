import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { roles, users } from "@/db/schema";
import { esc, logFeed } from "./core";

export const COOKIE = "importech_session";
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const MAX_LOCK_MS = 24 * 60 * 60_000;
const TTL_S = 60 * 60 * 12;

/** Cada bloqueo seguido dura el triple que el anterior: 5 min, 15 min, 45 min… hasta 24 h. */
export const lockMs = (n: number) => Math.min(LOCK_MS * 3 ** (n - 1), MAX_LOCK_MS);

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("Falta la variable AUTH_SECRET.");
    return new TextEncoder().encode("dev-only-secret-change-me-please-32chars");
  }
  return new TextEncoder().encode(s);
}

export type Me = { id: string; name: string; username: string; role: string; roleName: string; perms: string[]; locked: boolean; mustChange: boolean };

export async function signSession(userId: string, v = 0) {
  return new SignJWT({ v }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${TTL_S}s`).sign(secret());
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * Valida la contraseña con bloqueos crecientes tras varios intentos fallidos.
 * El intento se registra antes de compararla y solo si nadie más lo registró a la vez,
 * así que enviar muchos intentos en paralelo no salta el bloqueo.
 */
export async function checkLogin(userId: string, pin: string, now = Date.now()): Promise<LoginResult> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.active) return { ok: false, error: "Usuario no disponible" };
  if (u.lockedUntil > now) return { ok: false, error: `Demasiados intentos. Prueba en ${Math.ceil((u.lockedUntil - now) / 60000)} min.` };
  const failed = u.failed + 1;
  const lock = failed % MAX_FAILS === 0 ? now + lockMs(failed / MAX_FAILS) : u.lockedUntil;
  const claimed = await db
    .update(users)
    .set({ failed, lockedUntil: lock })
    .where(and(eq(users.id, userId), eq(users.failed, u.failed), eq(users.lockedUntil, u.lockedUntil)))
    .returning({ id: users.id });
  if (!claimed.length) return { ok: false, error: "Intenta de nuevo" };
  if (await bcrypt.compare(pin, u.pinHash)) {
    await db.update(users).set({ failed: 0, lockedUntil: 0 }).where(eq(users.id, userId));
    return { ok: true, token: await signSession(userId, u.sessionV) };
  }
  if (lock !== u.lockedUntil) {
    await logFeed(db, null, "owner", "🚨", `Alerta: <b>${esc(u.name)}</b> quedó bloqueado/a ${Math.round(lockMs(failed / MAX_FAILS) / 60000)} min por ${failed} intentos fallidos seguidos`);
    return { ok: false, error: `Contraseña incorrecta. Demasiados intentos: prueba en ${Math.ceil((lock - now) / 60000)} min.` };
  }
  return { ok: false, error: "Contraseña incorrecta" };
}

export async function meFromToken(token: string | undefined): Promise<Me | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (!id) return null;
    const db = await getDb();
    // Usuario y rol en una sola consulta (cada ida a la base cuenta).
    const [row] = await db.select({ u: users, r: roles }).from(users).leftJoin(roles, eq(roles.key, users.role)).where(eq(users.id, id)).limit(1);
    const u = row?.u, r = row?.r;
    if (!u || !u.active || (payload.v ?? 0) !== u.sessionV) return null;
    return { id: u.id, name: u.name, username: u.username, role: u.role, roleName: r?.name ?? u.role, perms: r?.perms ?? [], locked: !!r?.locked, mustChange: u.mustChange };
  } catch {
    return null;
  }
}

/** Sesión actual. Se calcula una sola vez por petición aunque la pidan el menú y la página. */
export const getMe = cache(async (): Promise<Me | null> => {
  const jar = await cookies();
  return meFromToken(jar.get(COOKIE)?.value);
});

export const hasPerm = (me: Me, perm: string) => me.locked || me.perms.includes(perm);

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_S });
}
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** Hash de contraseña. Costo 12 (≈250 ms): cada intento de adivinar es caro. */
export const hashPin = (secret: string) => bcrypt.hash(secret, 12);

// Hash de relleno: si el usuario no existe igual se compara, para que el tiempo de respuesta no lo delate.
let dummy: string | null = null;
const dummyHash = async () => (dummy ??= await bcrypt.hash("relleno-no-es-una-contrasena", 12));
const GENERIC = "Usuario o contraseña incorrectos";

/** Entrada con usuario y contraseña. No revela si el usuario existe. */
export async function loginWithPassword(username: string, password: string, now = Date.now()): Promise<LoginResult> {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1);
  if (!u || !u.active) {
    await bcrypt.compare(password, await dummyHash());
    return { ok: false, error: GENERIC };
  }
  const r = await checkLogin(u.id, password, now);
  if (r.ok) return r;
  return { ok: false, error: r.error.replace(/^Contraseña incorrecta/, GENERIC) };
}
