"use server";
import { act } from "@/server/act";
import { createUser, saveLogo, saveRolePerms, saveSettings, updateUser } from "@/server/admin";

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
