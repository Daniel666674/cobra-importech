import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, orders, users } from "@/db/schema";
import { advanceOrder, cancelOrder, createOrder, createPurchase, openClaim, receivePurchase, resolveClaim, saveClient } from "@/server/ops";
import { createUser, saveRolePerms, updateUser } from "@/server/admin";
import { reverifyItem } from "@/server/inventory";
import type { Actor } from "@/server/core";
import { withCheck } from "@/lib/imei-test";
import { freshDb } from "./helpers";

const dev: Actor = { id: "u1", name: "Daniel Acosta", perms: [], locked: true };
const owner: Actor = { id: "u2", name: "Angelica", perms: ["approve", "inv_view", "inv_edit", "sell", "workshop", "purchase", "clients", "users", "settings"], locked: false };
const emp: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell", "workshop", "clients"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("taller", () => {
  it("envía a taller, avanza y suma el costo al equipo", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0010"));
    const id = await createOrder(db, emp, { item: it.id, job: "Cambio de pantalla", cost: 250000 });
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("En taller");
    for (const st of ["Esperando repuesto", "En reparación", "Listo"]) expect(await advanceOrder(db, emp, id)).toBe(st);
    expect(await advanceOrder(db, emp, id)).toBe("done");
    const after = (await db.select().from(items).where(eq(items.id, it.id)))[0];
    expect(after.status).toBe("En vitrina");
    expect(after.repairs).toBe(it.repairs + 250000);
    // el costo de la reparación también sube el precio: la ganancia no cambia
    expect(after.price).toBe(it.price + 250000);
    expect(after.price - after.cost - after.repairs).toBe(it.price - it.cost - it.repairs);
  });
  it("tablero: mover a cualquier etapa y corregir el costo tras el diagnóstico", async () => {
    const { moveOrder, updateOrder } = await import("@/server/ops");
    const [it] = await db.select().from(items).where(eq(items.id, "I-0012"));
    const id = await createOrder(db, emp, { item: it.id, job: "Batería", cost: 0 });
    expect(await moveOrder(db, emp, id, "En reparación")).toBe("En reparación");
    expect(await moveOrder(db, emp, id, "Esperando repuesto")).toBe("Esperando repuesto");
    await expect(moveOrder(db, emp, id, "Otra")).rejects.toThrow();
    await updateOrder(db, emp, id, { cost: 180000, notes: "Batería al 71 %" });
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    expect(o).toMatchObject({ cost: 180000, notes: "Batería al 71 %", st: "Esperando repuesto" });
    await moveOrder(db, emp, id, "Listo");
    expect(await advanceOrder(db, emp, id)).toBe("done");
    const [after] = await db.select().from(items).where(eq(items.id, it.id));
    expect(after).toMatchObject({ status: "En vitrina", repairs: it.repairs + 180000, price: it.price + 180000 });
  });
  it("cancela y devuelve el estado previo", async () => {
    const id = await createOrder(db, emp, { item: "I-0011", job: "Diagnóstico", cost: 0 });
    await cancelOrder(db, emp, id);
    expect((await db.select().from(items).where(eq(items.id, "I-0011")))[0].status).toBe("En vitrina");
    expect((await db.select().from(orders).where(eq(orders.id, id))).length).toBe(0);
  });
});

describe("garantías y clientes", () => {
  it("abre y resuelve un reclamo", async () => {
    const id = await openClaim(db, emp, "S-0002", 0, "Se apaga sola");
    await resolveClaim(db, emp, id, "Reparado en garantía");
    await expect(openClaim(db, emp, "S-0002", 0, " ")).rejects.toThrow(/Describe/);
  });
  it("crea un cliente", async () => {
    const id = await saveClient(db, emp, null, { name: "Nuevo Cliente", phone: "300 111 2222" });
    expect(id).toMatch(/^c\d+$/);
  });
});

describe("compras y recepción", () => {
  it("los iPhone del lote entran 'En revisión' y se liberan con la verificación oficial", async () => {
    const po = await createPurchase(db, owner, { sup: "Miami Tech", qty: 2, usd: 800, trm: 4050 });
    const s1 = withCheck("35911001222222"), s2 = withCheck("35911001333333");
    const r = await receivePurchase(db, owner, po, { cat: "iPhone", name: "iPhone 17 Pro Max", spec: "256 GB", color: "Negro", cond: "Nuevo", serials: [s1, s2, "123"] });
    expect(r.ok.length).toBe(2);
    expect(r.bad.length).toBe(1);
    const [it] = await db.select().from(items).where(eq(items.id, r.ok[0]));
    expect(it.status).toBe("En revisión");
    await reverifyItem(db, emp, it.id, { crc: "clean", apple: "clean" });
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("En vitrina");
    const [it2] = await db.select().from(items).where(eq(items.id, r.ok[1]));
    await reverifyItem(db, emp, it2.id, { crc: "reported", apple: "clean" });
    expect((await db.select().from(items).where(eq(items.id, it2.id)))[0].status).toBe("En revisión");
  });
});

describe("usuarios", () => {
  it("crea usuario con contraseña temporal y no deja quitar al último administrador", async () => {
    await expect(createUser(db, owner, { name: "Pepe", username: "p", role: "employee" })).rejects.toThrow(/usuario/i);
    const { id, temp } = await createUser(db, owner, { name: "Pepe Pérez", username: "Pepe.Perez", role: "employee" });
    expect(id).toMatch(/^u/);
    expect(temp).toHaveLength(14);
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ username: "pepe.perez", mustChange: true });
    await expect(createUser(db, owner, { name: "Otro Pepe", username: "pepe.perez", role: "employee" })).rejects.toThrow(/ya existe/);
    await expect(createUser(db, owner, { name: "Otro dev", username: "otro.dev", role: "dev" })).rejects.toThrow(/desarrollador/);
    await updateUser(db, owner, "u1", { active: false });
    await expect(updateUser(db, owner, "u2", { active: false })).rejects.toThrow(/al menos un administrador/);
    await db.update(users).set({ active: true }).where(eq(users.id, "u1"));
  });
  it("cambia permisos de un rol", async () => {
    await saveRolePerms(db, owner, "employee", ["inv_view", "sell", "dev"]);
    await expect(saveRolePerms(db, owner, "dev", [])).rejects.toThrow(/no se puede cambiar/);
  });
});
void dev;
