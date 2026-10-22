import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { settings, users } from "@/db/schema";
import { PW_MAX, passwordProblem } from "@/lib/password";
import { hashPin } from "./auth";
import { AppError, esc, logFeed } from "./core";

export const passwordField = z.string().max(PW_MAX, `La contraseña no puede pasar de ${PW_MAX} caracteres`);

/** Valida una contraseña nueva contra las reglas, el nombre, el usuario y el negocio. */
export async function checkNewPassword(db: Db, pw: string, who: { name: string; username: string }) {
  const [cfg] = await db.select({ name: settings.name }).from(settings).limit(1);
  const problem = passwordProblem(pw, { name: who.name, username: who.username, business: cfg?.name });
  if (problem) throw new AppError(problem, "invalid");
}

/**
 * Cambia la contraseña de quien tiene la sesión: exige la actual, aplica las reglas, quita la marca de
 * «debe cambiar» y cierra las demás sesiones. Devuelve la versión de sesión nueva para firmar la cookie.
 */
export async function changeOwnPassword(db: Db, userId: string, raw: unknown) {
  const v = z.object({ current: passwordField, next: passwordField, confirm: passwordField }).parse(raw);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !u.active) throw new AppError("Usuario no disponible", "notfound");
  if (!(await bcrypt.compare(v.current, u.pinHash))) throw new AppError("La contraseña actual no es correcta", "invalid");
  if (v.next !== v.confirm) throw new AppError("La confirmación no coincide con la contraseña nueva", "invalid");
  if (v.next === v.current) throw new AppError("La contraseña nueva debe ser distinta a la actual", "invalid");
  await checkNewPassword(db, v.next, u);
  const sessionV = u.sessionV + 1;
  await db.update(users).set({ pinHash: await hashPin(v.next), mustChange: false, sessionV, failed: 0, lockedUntil: 0 }).where(eq(users.id, userId));
  await logFeed(db, null, "owner", "🔑", `<b>${esc(u.name)}</b> cambió su contraseña`);
  return sessionV;
}
