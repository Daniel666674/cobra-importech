"use server";
import { act } from "@/server/act";
import { importTacCsv } from "@/server/inventory";
import { createUser, saveBanks, saveLogo, saveMethods, saveTradeinConfig, saveCategories, saveBranches, saveNumbering, saveRolePerms, saveSettings, saveWarranty, updateUser } from "@/server/admin";
import { importSales, undoImport } from "@/server/import";

export async function createUserAction(data: unknown) {
  return act((db, a) => createUser(db, a, data), ["/usuarios"]);
}
export async function updateUserAction(id: string, data: unknown) {
  return act((db, a) => updateUser(db, a, id, data), ["/usuarios"]);
}
export async function saveRolePermsAction(key: string, perms: string[]) {
  return act((db, a) => saveRolePerms(db, a, key, perms), ["/usuarios"]);
}
export async function saveSettingsAction(data: unknown) {
  return act((db, a) => saveSettings(db, a, data), ["/"]);
}
export async function saveLogoAction(dataUrl: string) {
  return act((db, a) => saveLogo(db, a, dataUrl), ["/"]);
}
export async function importTacAction(text: string) {
  return act((db, a) => importTacCsv(db, a, text), ["/ingreso"]);
}
export async function saveNumberingAction(data: unknown) {
  return act((db, a) => saveNumbering(db, a, data), ["/config"]);
}
export async function saveWarrantyAction(data: unknown) {
  return act((db, a) => saveWarranty(db, a, data), ["/"]);
}
export async function saveTradeinConfigAction(data: unknown) {
  return act((db, a) => saveTradeinConfig(db, a, data), ["/retomas", "/venta"]);
}
export async function saveCategoriesAction(data: unknown) {
  return act((db, a) => saveCategories(db, a, data), ["/", "/inventario", "/ingreso", "/venta", "/retomas", "/compras"]);
}
export async function saveBranchesAction(data: unknown) {
  return act((db, a) => saveBranches(db, a, data), ["/", "/inventario", "/ingreso", "/ventas", "/reportes"]);
}
export async function saveMethodsAction(data: unknown) {
  return act((db, a) => saveMethods(db, a, data), ["/"]);
}
export async function importSalesAction(data: unknown) {
  return act((db, a) => importSales(db, a, data), ["/"]);
}
export async function undoImportAction(source: string) {
  return act((db, a) => undoImport(db, a, source), ["/"]);
}

export async function saveBanksAction(data: unknown) {
  return act((db, a) => saveBanks(db, a, data), ["/", "/venta"]);
}
