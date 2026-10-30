"use server";
import { act } from "@/server/act";
import { payPending } from "@/server/caja";
import { addAbono, createHold, createSale, deleteAllSales, deleteSale, editSale, extendHold, renameSale, refundSale, releaseHold } from "@/server/sales";
import { openClaim, resolveClaim, saveClient } from "@/server/ops";

const P = ["/", "/inventario", "/ventas", "/apartados", "/garantias", "/clientes"];

export async function createSaleAction(data: unknown) {
  return act(async (db, a) => (await createSale(db, a, data)).id, P);
}
export async function createHoldAction(data: unknown) {
  return act(async (db, a) => (await createHold(db, a, data)).itemId, P);
}
export async function addAbonoAction(itemId: string, amount: number, method: string) {
  return act(async (db, a) => (await addAbono(db, a, itemId, amount, method)).receipt, P);
}
export async function extendHoldAction(itemId: string, until: number) {
  return act((db, a) => extendHold(db, a, itemId, until), P);
}
export async function releaseHoldAction(itemId: string, refund: boolean) {
  return act((db, a) => releaseHold(db, a, itemId, refund), P);
}
export async function refundAction(saleId: string, returns: number[], reason: string) {
  return act((db, a) => refundSale(db, a, saleId, returns, reason), P);
}
export async function openClaimAction(saleId: string, line: number, note: string) {
  return act((db, a) => openClaim(db, a, saleId, line, note), P);
}
export async function resolveClaimAction(id: string, resolution: string) {
  return act((db, a) => resolveClaim(db, a, id, resolution), P);
}
export async function saveClientAction(id: string | null, data: unknown) {
  return act((db, a) => saveClient(db, a, id, data), P);
}

export async function deleteSaleAction(id: string) {
  return act((db, a) => deleteSale(db, a, id), P);
}
export async function deleteAllSalesAction(confirm: string, skip: number, restart: string) {
  return act((db, a) => deleteAllSales(db, a, confirm, skip, restart), P);
}
export async function renameSaleAction(id: string, no: string) {
  return act((db, a) => renameSale(db, a, id, no), P);
}
export async function editSaleAction(id: string, data: unknown) {
  return act((db, a) => editSale(db, a, id, data), P);
}
export async function payPendingAction(id: string, amount: string, method: string) {
  return act((db, a) => payPending(db, a, id, { amount, method }), [...P, "/cobrar", "/caja"]);
}
