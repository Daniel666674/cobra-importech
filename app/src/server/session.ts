import "server-only";
import { redirect } from "next/navigation";
import { getMe, hasPerm, type Me } from "./auth";
import type { Actor } from "./core";

export const toActor = (me: Me): Actor => ({ id: me.id, name: me.name, perms: me.perms, locked: me.locked });

/** Para páginas: exige sesión y, si se indica, un permiso. */
export async function requireMe(perm?: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (perm && !hasPerm(me, perm)) redirect("/?denied=1");
  return me;
}
