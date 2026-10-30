"use server";
import { act } from "@/server/act";
import { payTech, saveTech, voidTechMove } from "@/server/tecnicos";

const P = ["/tecnicos", "/taller"];
export async function saveTechAction(id: string | null, data: unknown) {
  return act((db, a) => saveTech(db, a, id, data), P);
}
export async function payTechAction(id: string, data: unknown) {
  return act((db, a) => payTech(db, a, id, data), P);
}
export async function voidTechMoveAction(id: number) {
  return act((db, a) => voidTechMove(db, a, id), P);
}
