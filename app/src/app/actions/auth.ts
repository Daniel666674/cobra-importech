"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/db";
import { checkLogin, clearSessionCookie, setSessionCookie, signSession } from "@/server/auth";
import { AppError } from "@/server/core";
import { runSetup } from "@/server/setup";

export async function login(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const userId = String(form.get("user") ?? "");
  const pin = String(form.get("pin") ?? "");
  if (!userId) return { error: "Elige tu usuario" };
  const r = await checkLogin(userId, pin);
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
