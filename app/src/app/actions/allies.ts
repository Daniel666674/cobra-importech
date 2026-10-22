"use server";
import { act } from "@/server/act";
import { payAlly, saveAlly, voidAllyPay } from "@/server/allies";

export async function saveAllyAction(id: string | null, data: unknown) {
  return act((db, a) => saveAlly(db, a, id, data), ["/cartera", "/ingreso"]);
}
export async function payAllyAction(id: string, data: unknown) {
  return act((db, a) => payAlly(db, a, id, data), ["/cartera"]);
}
export async function voidAllyPayAction(id: number, reason: string) {
  return act((db, a) => voidAllyPay(db, a, id, reason), ["/cartera"]);
}
