"use server";
import { act } from "@/server/act";
import { addExtra, advanceOrder, cancelOrder, createOrder, moveOrder, removeExtra, updateOrder, createPurchase, receivePurchase } from "@/server/ops";

const P = ["/", "/inventario", "/taller", "/compras", "/tecnicos", "/caja"];

export async function advanceOrderAction(id: string, pay?: { amount: string; method: string }) {
  return act((db, a) => advanceOrder(db, a, id, pay), P);
}
export async function createTicketAction(data: unknown) {
  return act((db, a) => createOrder(db, a, data), P);
}
export async function addExtraAction(id: string, data: unknown) {
  return act((db, a) => addExtra(db, a, id, data), P);
}
export async function removeExtraAction(id: string, index: number) {
  return act((db, a) => removeExtra(db, a, id, index), P);
}
export async function cancelOrderAction(id: string) {
  return act((db, a) => cancelOrder(db, a, id), P);
}
export async function createPurchaseAction(data: unknown) {
  return act((db, a) => createPurchase(db, a, data), P);
}
export async function receivePurchaseAction(poId: string, data: unknown) {
  return act((db, a) => receivePurchase(db, a, poId, data), P);
}
export async function moveOrderAction(id: string, st: string) {
  return act((db, a) => moveOrder(db, a, id, st), P);
}
export async function updateOrderAction(id: string, data: unknown) {
  return act((db, a) => updateOrder(db, a, id, data), P);
}
