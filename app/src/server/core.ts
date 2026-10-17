import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { counters, feed, itemEvents } from "@/db/schema";

export type Actor = { id: string; name: string; perms: string[]; locked: boolean };

export class AppError extends Error {
  constructor(message: string, public code: "forbidden" | "invalid" | "conflict" | "notfound" = "invalid") {
    super(message);
  }
}

export const can = (a: Actor, perm: string) => a.locked || a.perms.includes(perm);
export function need(a: Actor, perm: string) {
  if (!can(a, perm)) throw new AppError("No tienes permiso para esta acción", "forbidden");
}

/** Siguiente número de una secuencia, de forma atómica. */
export async function nextCounter(db: Db, key: string): Promise<number> {
  const rows = await db
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ v: counters.value });
  return rows[0].v;
}

export const firstName = (a: Actor) => a.name.split(" ")[0];

export async function addEvent(db: Db, itemId: string, a: Actor | null, title: string, detail = "", tone = "") {
  await db.insert(itemEvents).values({ itemId, t: Date.now(), title, detail, tone, by: a ? firstName(a) : "Sistema" });
}

export async function logFeed(db: Db, a: Actor | null, type: string, ic: string, x: string) {
  await db.insert(feed).values({ t: Date.now(), type, ic, x, by: a ? a.name : "Sistema" });
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export { eq };
