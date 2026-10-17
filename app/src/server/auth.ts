import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { roles, users } from "@/db/schema";

export const COOKIE = "importech_session";
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const TTL_S = 60 * 60 * 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("Falta la variable AUTH_SECRET.");
    return new TextEncoder().encode("dev-only-secret-change-me-please-32chars");
  }
  return new TextEncoder().encode(s);
}

export type Me = { id: string; name: string; role: string; roleName: string; perms: string[]; locked: boolean };

export async function signSession(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${TTL_S}s`).sign(secret());
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

/** Valida el PIN con bloqueo temporal tras varios intentos fallidos. */
export async function checkLogin(userId: string, pin: string, now = Date.now()): Promise<LoginResult> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.active) return { ok: false, error: "Usuario no disponible" };
  if (u.lockedUntil > now) return { ok: false, error: `Demasiados intentos. Prueba en ${Math.ceil((u.lockedUntil - now) / 60000)} min.` };
  const ok = await bcrypt.compare(pin, u.pinHash);
  if (!ok) {
    const failed = u.failed + 1;
    await db.update(users).set(failed >= MAX_FAILS ? { failed: 0, lockedUntil: now + LOCK_MS } : { failed }).where(eq(users.id, userId));
    return { ok: false, error: "PIN incorrecto" };
  }
  await db.update(users).set({ failed: 0, lockedUntil: 0 }).where(eq(users.id, userId));
  return { ok: true, token: await signSession(userId) };
}

export async function meFromToken(token: string | undefined): Promise<Me | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (!id) return null;
    const db = await getDb();
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u || !u.active) return null;
    const [r] = await db.select().from(roles).where(eq(roles.key, u.role)).limit(1);
    return { id: u.id, name: u.name, role: u.role, roleName: r?.name ?? u.role, perms: r?.perms ?? [], locked: !!r?.locked };
  } catch {
    return null;
  }
}

export async function getMe(): Promise<Me | null> {
  const jar = await cookies();
  return meFromToken(jar.get(COOKIE)?.value);
}

export const hasPerm = (me: Me, perm: string) => me.locked || me.perms.includes(perm);

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_S });
}
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
