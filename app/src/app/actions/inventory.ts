"use server";
import { redirect } from "next/navigation";
import { act } from "@/server/act";
import { verifyImei } from "@/server/imei";
import { createItem, deleteItem, priceUnpriced, releaseAllReview, reverifyItem, updateItem } from "@/server/inventory";
import { createOrder } from "@/server/ops";
import { existingSerials, importInventory, undoInventoryImport } from "@/server/import-inventory";
import type { ImeiResult } from "@/lib/imei";

export async function verifyImeiAction(imei: string) {
  return act<ImeiResult>((db) => verifyImei(db, imei), []);
}

export async function createItemAction(data: unknown, official?: unknown, ownerApproved?: boolean) {
  return act(async (db, a) => (await createItem(db, a, data, { official, ownerApproved })).id, ["/inventario", "/"]);
}

export async function updateItemAction(id: string, data: unknown) {
  return act(async (db, a) => {
    await updateItem(db, a, id, data);
  }, ["/inventario", "/"]);
}

export async function reverifyAction(id: string, official: unknown) {
  return act((db, a) => reverifyItem(db, a, id, official), ["/inventario", "/"]);
}

export async function sendToWorkshopAction(data: unknown) {
  return act((db, a) => createOrder(db, a, data), ["/inventario", "/taller", "/"]);
}

export async function deleteItemAction(id: string) {
  const r = await act((db, a) => deleteItem(db, a, id), ["/inventario", "/"]);
  if (r.ok) redirect("/inventario");
  return r;
}

export async function importInventoryAction(data: unknown) {
  return act((db, a) => importInventory(db, a, data), ["/inventario", "/"]);
}
export async function undoInventoryImportAction(source: string) {
  return act((db, a) => undoInventoryImport(db, a, source), ["/inventario", "/"]);
}
export async function releaseAllReviewAction() {
  return act((db, a) => releaseAllReview(db, a), ["/inventario", "/"]);
}
export async function existingSerialsAction(serials: string[]) {
  return act((db, a) => existingSerials(db, a, serials), []);
}

export async function priceUnpricedAction(gain: number) {
  return act((db, a) => priceUnpriced(db, a, gain), ["/inventario", "/venta"]);
}
