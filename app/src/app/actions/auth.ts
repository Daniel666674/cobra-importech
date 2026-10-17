"use server";
import { redirect } from "next/navigation";
import { checkLogin, clearSessionCookie, setSessionCookie } from "@/server/auth";

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
