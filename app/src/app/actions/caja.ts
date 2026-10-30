"use server";
import { act } from "@/server/act";
import { addCashMove, closeDay, voidCashMove } from "@/server/caja";

export async function addCashMoveAction(data: unknown) {
  return act((db, a) => addCashMove(db, a, data), ["/caja"]);
}
export async function voidCashMoveAction(id: number) {
  return act((db, a) => voidCashMove(db, a, id), ["/caja"]);
}
export async function closeDayAction(data: unknown) {
  return act((db, a) => closeDay(db, a, data), ["/caja", "/"]);
}
