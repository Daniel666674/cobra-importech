import "server-only";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, type Db } from "@/db";
import { getMe } from "./auth";
import { AppError, type Actor } from "./core";
import { toActor } from "./session";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Ejecuta una acción de servidor: verifica la sesión, convierte los errores de negocio
 * en mensajes para la pantalla y refresca las rutas indicadas.
 */
export async function act<T>(fn: (db: Db, a: Actor) => Promise<T>, paths: string[] = ["/"]): Promise<Result<T>> {
  try {
    const me = await getMe();
    if (!me) return { ok: false, error: "Tu sesión terminó. Vuelve a entrar." };
    if (me.mustChange) return { ok: false, error: "Primero cambia tu contraseña temporal." };
    const data = await fn(await getDb(), toActor(me));
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos no válidos" };
    console.error(e);
    return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}
