"use server";
import { act } from "@/server/act";
import { advanceOrder, cancelOrder, moveOrder, updateOrder, createPurchase, receivePurchase } from "@/server/ops";

const P = ["/", "/inventario", "/taller", "/compras"];

export async function advanceOrderAction(id: string) {
  return act((db, a) => advanceOrder(db, a, id), P);
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
