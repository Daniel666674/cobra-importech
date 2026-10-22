"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/db";
import { clearSessionCookie, getMe, loginWithPassword, setSessionCookie, signSession } from "@/server/auth";
import { changeOwnPassword } from "@/server/account";
import { AppError } from "@/server/core";
import { runSetup } from "@/server/setup";

export async function login(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const username = String(form.get("username") ?? "").slice(0, 60);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!username || !password) return { error: "Escribe tu usuario y tu contraseña" };
  const r = await loginWithPassword(username, password);
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.token);
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

export async function setupAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  try {
    const id = await runSetup(await getDb(), Object.fromEntries(form));
    await setSessionCookie(await signSession(id));
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Datos no válidos" };
    console.error(e);
    return { error: "No se pudo crear la tienda. Intenta de nuevo." };
  }
  redirect("/");
}

/** Cambio de la propia contraseña (también la temporal). Mantiene esta sesión y cierra las demás. */
export async function changePasswordAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const me = await getMe();
  if (!me) redirect("/login");
  try {
    const v = await changeOwnPassword(await getDb(), me.id, { current: String(form.get("current") ?? ""), next: String(form.get("next") ?? ""), confirm: String(form.get("confirm") ?? "") });
    await setSessionCookie(await signSession(me.id, v));
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Datos no válidos" };
    console.error(e);
    return { error: "No se pudo cambiar la contraseña. Intenta de nuevo." };
  }
  redirect("/?pw=1");
}
