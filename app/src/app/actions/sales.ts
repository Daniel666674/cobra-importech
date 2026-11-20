"use server";
import { after } from "next/server";
import { act } from "@/server/act";
import { payPending } from "@/server/caja";
import { addAbono, createHold, createSale, deleteAllSales, deleteSale, editSale, extendHold, renameSale, refundSale, releaseHold } from "@/server/sales";
import { settings } from "@/db/schema";
import { AppError, need } from "@/server/core";
import { mailConfigured, sendReceiptEmail } from "@/server/mail";
import { openClaim, resolveClaim, saveClient } from "@/server/ops";

const P = ["/", "/inventario", "/ventas", "/apartados", "/garantias", "/clientes"];

export async function createSaleAction(data: unknown) {
  return act(async (db, a) => {
    const sale = await createSale(db, a, data);
    // Envío automático del comprobante por correo, después de responder (no hace esperar al empleado).
    if (mailConfigured()) {
      const [cfg] = await db.select().from(settings).limit(1);
      if (cfg?.autoSend !== false && sale.client) after(async () => { await sendReceiptEmail(db, sale.id, { by: a }); });
    }
    return sale.id;
  }, P);
}
export async function sendReceiptEmailAction(saleId: string, to: string) {
  return act(async (db, a) => {
    need(a, "sell");
    const r = await sendReceiptEmail(db, saleId, { to: to.trim() || undefined, by: a });
    if (!r.ok) throw new AppError(r.error, "invalid");
    return r.to;
  }, ["/ventas"]);
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
