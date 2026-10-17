import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { imeiBlocklist, items, tacModels } from "@/db/schema";
import { checkImei, type ImeiResult } from "@/lib/imei";
import { uname } from "@/lib/items";

/** Corre las verificaciones automáticas de un IMEI contra la base de datos. */
export async function verifyImei(db: Db, imei: string, ignoreId?: string): Promise<ImeiResult> {
  const clean = imei.replace(/\D/g, "");
  const [dup] = await db
    .select()
    .from(items)
    .where(ignoreId ? and(eq(items.serial, clean), ne(items.id, ignoreId)) : eq(items.serial, clean))
    .limit(1);
  const [bl] = await db.select().from(imeiBlocklist).where(eq(imeiBlocklist.imei, clean)).limit(1);
  const [tac] = clean.length === 15 ? await db.select().from(tacModels).where(eq(tacModels.tac, clean.slice(0, 8))).limit(1) : [];
  return checkImei(clean, {
    tacName: tac?.name ?? null,
    existing: dup ? { id: dup.id, name: uname(dup), status: dup.status } : null,
    blocked: bl ? `${bl.reason} (registrado por ${bl.by})` : null,
  });
}

export async function blockImei(db: Db, imei: string, reason: string, by: string) {
  await db.insert(imeiBlocklist).values({ imei, reason, t: Date.now(), by }).onConflictDoNothing();
}
