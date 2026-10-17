"use server";
import { redirect } from "next/navigation";
import { act } from "@/server/act";
import { verifyImei } from "@/server/imei";
import { createItem, deleteItem, reverifyItem, updateItem } from "@/server/inventory";
import { createOrder } from "@/server/ops";
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
