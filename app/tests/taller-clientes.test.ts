import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cashMoves, clients, items, orders, techMoves, technicians } from "@/db/schema";
import type { Actor } from "@/server/core";
import { cajaDay, bogotaToday } from "@/server/caja";
import { addExtra, advanceOrder, cancelOrder, createOrder, orderCost, orderPrice, removeExtra, updateOrder } from "@/server/ops";
import { payTech, saveTech, techDetail, techSummary, voidTechMove } from "@/server/tecnicos";
import { freshDb } from "./helpers";

const emp: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell", "workshop", "clients"], locked: false };
const owner: Actor = { id: "u2", name: "Angelica", perms: ["inv_view", "sell", "workshop", "purchase", "clients"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });
const toListo = async (id: string) => { for (const _ of [1, 2, 3]) await advanceOrder(db, emp, id); };

describe("tickets de clientes (equipos que no son del inventario)", () => {
  it("crea el ticket con cliente nuevo y técnico nuevo, suma reparaciones adicionales y entrega con pago en caja", async () => {
    const id = await createOrder(db, emp, { job: "Cambio de pantalla", cost: 200_000, price: 350_000, tech: "Carlos Pérez", techFee: 60_000, device: "iPhone 13 azul", serial: "3591", newClient: { name: "María Gómez", phone: "3001112233" } });
    const [o] = await db.select().from(orders).where(eq(orders.id, id));
    expect(o).toMatchObject({ item: null, device: "iPhone 13 azul", price: 350_000, techFee: 60_000, tech: "Carlos Pérez", outcome: "" });
    expect((await db.select().from(clients).where(eq(clients.id, o.client!)))[0].name).toBe("María Gómez");
    expect((await db.select().from(technicians)).filter((t) => t.name === "Carlos Pérez")).toHaveLength(1);
    await addExtra(db, emp, id, { job: "Cambio de batería", cost: "80.000", price: "150.000" });
    const [o2] = await db.select().from(orders).where(eq(orders.id, id));
    expect([orderCost(o2), orderPrice(o2)]).toEqual([280_000, 500_000]);
    await addExtra(db, emp, id, { job: "Mala", cost: 1, price: 1 });
    await removeExtra(db, emp, id, 1);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0].extras).toHaveLength(1);
    await toListo(id);
    await expect(advanceOrder(db, emp, id)).rejects.toThrow(/cuánto pagó/);
    const before = (await cajaDay(db, bogotaToday())).byMethod.find((m) => m.method === "Nequi")?.in ?? 0;
    expect(await advanceOrder(db, emp, id, { amount: "500.000", method: "Nequi" })).toBe("done");
    expect((await cajaDay(db, bogotaToday())).byMethod.find((m) => m.method === "Nequi")!.in - before).toBe(500_000);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0]).toMatchObject({ outcome: "entregada" });
    expect((await db.select().from(cashMoves)).some((m) => m.concept.includes(id))).toBe(true);
  });
  it("sin equipo del inventario exige describir el equipo", async () => {
    await expect(createOrder(db, emp, { job: "Pantalla", cost: 0 })).rejects.toThrow(/qué equipo/);
  });
});

describe("reparaciones adicionales en equipos del inventario", () => {
  it("el costo de todas se suma al equipo al entregar", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0013"));
    const id = await createOrder(db, emp, { item: it.id, job: "Batería", cost: 100_000, tech: "Carlos Pérez", techFee: 30_000 });
    await addExtra(db, emp, id, { job: "Cámara", cost: 50_000 });
    await toListo(id);
    await advanceOrder(db, emp, id);
    const [after] = await db.select().from(items).where(eq(items.id, it.id));
    expect(after).toMatchObject({ status: "En vitrina", repairs: it.repairs + 150_000, price: it.price + 150_000 });
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0]).toMatchObject({ outcome: "entregada" });
  });
});

describe("cartera del técnico", () => {
  it("al entregar queda la deuda con el técnico y se le paga desde su cartera", async () => {
    const tech = (await db.select().from(technicians)).find((t) => t.name === "Carlos Pérez")!;
    const s = (await techSummary(db)).find((t) => t.id === tech.id)!;
    expect(s).toMatchObject({ owed: 90_000, paid: 0, balance: 90_000 });
    expect((await db.select().from(techMoves).where(eq(techMoves.tech, tech.id))).map((m) => m.ref).sort()).toHaveLength(2);
    await expect(payTech(db, emp, tech.id, { amount: 10_000 })).rejects.toThrow(/permiso/);
    expect(await payTech(db, owner, tech.id, { amount: "40.000", method: "Nequi", note: "Adelanto" })).toEqual({ balance: 50_000 });
    const d = (await techDetail(db, tech.id))!;
    expect(d.balance).toBe(50_000);
    const pago = d.moves.find((m) => m.kind === "pago")!;
    await voidTechMove(db, owner, pago.id);
    expect((await techDetail(db, tech.id))!.balance).toBe(90_000);
    await expect(voidTechMove(db, owner, d.moves.find((m) => m.kind === "deuda")!.id)).rejects.toThrow(/Solo se anulan pagos/);
  });
  it("cancelar un ticket no genera deuda, y se pueden crear técnicos a mano sin repetir nombre", async () => {
    const id = await createOrder(db, emp, { job: "Diagnóstico", device: "iPad", tech: "Luis Díaz", techFee: 20_000 });
    await updateOrder(db, emp, id, { techFee: 25_000, tech: "Carlos Pérez" });
    await cancelOrder(db, emp, id);
    const tech = (await db.select().from(technicians)).find((t) => t.name === "Carlos Pérez")!;
    expect((await techSummary(db)).find((t) => t.id === tech.id)!.owed).toBe(90_000);
    await saveTech(db, owner, null, { name: "Ana Ruiz" });
    await expect(saveTech(db, owner, null, { name: "ana ruiz" })).rejects.toThrow(/Ya existe/);
  });
});
