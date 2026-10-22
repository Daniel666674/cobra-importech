"use server";
import { act } from "@/server/act";
import { payAlly, saveAlly } from "@/server/allies";

export async function saveAllyAction(id: string | null, data: unknown) {
  return act((db, a) => saveAlly(db, a, id, data), ["/aliados", "/ingreso"]);
}
export async function payAllyAction(id: string, data: unknown) {
  return act((db, a) => payAlly(db, a, id, data), ["/aliados"]);
}
