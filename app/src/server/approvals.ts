import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { items, type Approval } from "@/db/schema";
import { uname } from "@/lib/items";
import { AppError, addEvent, esc, logFeed, type Actor } from "./core";

/** Solo quien tiene el permiso «approve» (la propietaria); el rol de desarrollador no aprueba. */
export const canApprove = (a: Actor) => a.perms.includes("approve");
const needApprove = (a: Actor) => { if (!canApprove(a)) throw new AppError("Solo la propietaria puede aprobar", "forbidden"); };

/** Lo que se guarda en un producto nuevo: si lo crea alguien que no aprueba, queda pendiente («alta»). */
export const pendingAlta = (a: Actor): Approval | null => (canApprove(a) ? null : { kind: "alta", by: a.id, name: a.name, t: Date.now() });

export async function pendingList(db: Db) {
  return db.select().from(items).where(isNotNull(items.approval)).orderBy(asc(items.acq));
}
export async function pendingCount(db: Db) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(items).where(isNotNull(items.approval));
  return r?.n ?? 0;
}

/** Aprueba: «alta» → el producto queda disponible; «baja» → se elimina. */
export async function approve(db: Db, a: Actor, id: string) {
  needApprove(a);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, id)).for("update");
    if (!it?.approval) throw new AppError("Esta solicitud ya no está pendiente", "conflict");
    if (it.approval.kind === "alta") {
      await tx.update(items).set({ approval: null }).where(eq(items.id, id));
      await addEvent(tx, id, a, "Aprobado", `Ingreso de ${it.approval.name} aprobado por ${a.name}`, "ok");
      await logFeed(tx, a, "owner", "✅", `Producto nuevo aprobado: <b>${esc(uname(it))}</b> (ingresó ${esc(it.approval.name)})`);
    } else {
      if (it.status === "Vendido" || it.hold) {
        await tx.update(items).set({ approval: null }).where(eq(items.id, id));
        throw new AppError("Se vendió o apartó mientras esperaba: no se elimina", "conflict");
      }
      await tx.delete(items).where(eq(items.id, id));
      await logFeed(tx, a, "owner", "🗑️", `Eliminación aprobada: <b>${esc(uname(it))}</b> (pidió ${esc(it.approval.name)})`);
    }
    return it.approval.kind;
  });
}

/** Rechaza: «alta» → el producto no entra (se borra); «baja» → el producto se queda como estaba. */
export async function reject(db: Db, a: Actor, id: string, note = "") {
  needApprove(a);
  const why = z.string().trim().max(300).parse(note);
  return db.transaction(async (tx) => {
    const [it] = await tx.select().from(items).where(eq(items.id, id)).for("update");
    if (!it?.approval) throw new AppError("Esta solicitud ya no está pendiente", "conflict");
    if (it.approval.kind === "alta") {
      await tx.delete(items).where(eq(items.id, id));
      await logFeed(tx, a, "owner", "⛔", `Producto nuevo rechazado: <b>${esc(uname(it))}</b> (ingresó ${esc(it.approval.name)})${why ? " · " + esc(why) : ""}`);
    } else {
      await tx.update(items).set({ approval: null }).where(eq(items.id, id));
      await addEvent(tx, id, a, "Eliminación rechazada", `${it.approval.name} pidió eliminarlo; ${a.name} lo rechazó${why ? ": " + why : ""}`, "warn");
    }
    return it.approval.kind;
  });
}

export async function approveAll(db: Db, a: Actor) {
  needApprove(a);
  const list = await pendingList(db);
  let n = 0;
  for (const it of list) { try { await approve(db, a, it.id); n++; } catch { /* vendido mientras tanto: se salta */ } }
  return n;
}

/** Pide eliminar un producto. Si quien lo pide aprueba, o el producto nunca fue aprobado, se elimina de una vez. */
export async function requestDelete(db: Db, a: Actor, id: string, note = "") {
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it) throw new AppError("Producto no encontrado", "notfound");
  if (it.status === "Vendido" || it.hold) throw new AppError("No se puede eliminar un equipo vendido o apartado", "conflict");
  if (canApprove(a) || it.approval?.kind === "alta") {
    await db.delete(items).where(eq(items.id, id));
    await logFeed(db, a, "owner", "🗑️", `Producto eliminado: <b>${esc(uname(it))}</b> por ${esc(a.name)}`);
    return "deleted" as const;
  }
  if (it.approval?.kind === "baja") return "pending" as const;
  await db.update(items).set({ approval: { kind: "baja", by: a.id, name: a.name, t: Date.now(), note: note.slice(0, 300) } }).where(and(eq(items.id, id)));
  await addEvent(db, id, a, "Eliminación solicitada", `${a.name} pidió eliminarlo · espera aprobación de la propietaria`, "warn");
  await logFeed(db, a, "owner", "🕒", `${esc(a.name)} pidió eliminar <b>${esc(uname(it))}</b> · espera tu aprobación`);
  return "pending" as const;
}
