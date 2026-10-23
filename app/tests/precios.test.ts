import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, tacModels } from "@/db/schema";
import { withCheck } from "@/lib/imei-test";
import { parseCop } from "@/lib/money";
import type { Actor } from "@/server/core";
import { createItem, itemInput, itemPatch, priceUnpriced, updateItem } from "@/server/inventory";
import { createSale, holdInput, saleInput } from "@/server/sales";
import { payInput } from "@/server/allies";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u1", name: "Angelica", perms: ["approve", "inv_view", "inv_edit", "sell", "cost_view"], locked: false };
const msg = (f: () => unknown) => { try { f(); return "OK"; } catch (e) { return (e as { issues?: { message: string }[] }).issues?.[0]?.message ?? String(e); } };
const base = { cat: "Accesorios", name: "Funda" };

describe("pesos escritos a mano", () => {
  it.each([
    ["1.500.000", 1_500_000], ["$ 1,500,000", 1_500_000], ["1500000", 1_500_000], ["1.500.000,50", 1_500_000],
    ["1500000.5", 1_500_000], ["  2.600.000 COP", 2_600_000], [1_500_000, 1_500_000], ["", NaN], ["abc", NaN],
  ])("%j → %d", (v, n) => expect(parseCop(v)).toBe(n));
  it("al crear: acepta formatos colombianos y rechaza con mensaje claro en español", () => {
    expect(itemInput.parse({ ...base, price: "1.500.000", cost: "$ 1,000,000" })).toMatchObject({ price: 1_500_000, cost: 1_000_000 });
    expect(itemInput.parse({ ...base, price: "1.500.000,50" }).price).toBe(1_500_000);
    // el precio puede quedar en $0 (sin precio)
    expect(itemInput.parse({ ...base, price: "" }).price).toBe(0);
    expect(itemInput.parse({ ...base }).price).toBe(0);
    expect(itemInput.parse({ ...base, price: "0" }).price).toBe(0);
    expect(msg(() => itemInput.parse({ ...base, price: "abc" }))).toMatch(/Escribe el precio de venta/);
    expect(msg(() => itemInput.parse({ ...base, price: "-1" }))).toMatch(/no puede ser negativo/);
    expect(msg(() => itemInput.parse({ ...base, price: "3.000.000.000" }))).toMatch(/demasiado grande/);
    expect(msg(() => itemInput.parse({ ...base, price: 1, cost: "-5" }))).toMatch(/no puede ser negativo/);
    expect(msg(() => itemInput.parse({ ...base, price: 1, warr: 99 }))).toMatch(/máximo 60 meses/);
    expect(msg(() => itemInput.parse({ ...base, price: 1, qty: "2.5" }))).toMatch(/sin decimales/);
    expect(itemInput.parse({ ...base, price: 1, batt: "87%" }).batt).toBe(87);
  });
  it("al editar: batería vacía queda sin dato (antes se guardaba 0 %)", () => {
    expect(itemPatch.parse({ batt: "" }).batt).toBeNull();
    expect(itemPatch.parse({ price: "2.600.000" }).price).toBe(2_600_000);
    expect(itemPatch.parse({ price: "" }).price).toBe(0);
  });
  it("caja, apartados y cartera también aceptan puntos", () => {
    const s = saleInput.parse({ lines: [{ item: "I-1", qty: 1, price: "1.500.000" }], custom: [{ name: "iPhone 12", price: "900.000", batt: 80 }], payments: [{ method: "Efectivo", amount: "2.400.000" }], cash: "2.500.000" });
    expect([s.lines[0].price, s.custom[0].price, s.payments[0].amount, s.cash]).toEqual([1_500_000, 900_000, 2_400_000, 2_500_000]);
    expect(saleInput.parse({ lines: [{ item: "I-1", qty: 1 }] }).lines[0].price).toBeUndefined();
    expect(holdInput.parse({ item: "I-1", abono: "300.000", method: "Efectivo" }).abono).toBe(300_000);
    expect(payInput.parse({ amount: "1.200.000" }).amount).toBe(1_200_000);
  });
});

describe("guardar precios de verdad", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
    await db.insert(tacModels).values({ tac: "35822002", name: "iPhone 13", t: Date.now(), by: "prueba" }).onConflictDoNothing();
  });
  it("editar el precio de un iPhone con IMEI 2 y batería vacía no falla ni borra datos", async () => {
    const it = await createItem(db, owner, { cat: "iPhone", name: "iPhone 13", serial: withCheck("35822002700001"), serial2: withCheck("35822002700002"), batt: 85, cost: "2.000.000", price: "2.600.000" }, { official: { crc: "clean", apple: "clean" } });
    // lo que manda el formulario de edición
    await updateItem(db, owner, it.id, { name: "iPhone 13", spec: "", color: "", cond: "Usado", qty: "1", cost: "2000000", price: "2.750.000", warr: "1", batt: null, notes: "", min: "0", serial2: it.serial2, ally: "" });
    const [after] = await db.select().from(items).where(eq(items.id, it.id));
    expect(after).toMatchObject({ price: 2_750_000, serial2: it.serial2 });
  });
  it("producto con precio $0: se guarda pero no se vende sin escribir el precio", async () => {
    const it = await createItem(db, owner, { ...base, name: "Forro", qty: 2, cost: 10_000, price: "" });
    expect(it.price).toBe(0);
    await expect(createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [] })).rejects.toThrow(/precio/);
    const ed = await updateItem(db, owner, it.id, { price: "0" });
    expect(ed.price).toBe(0);
  });
  it("precio menor al costo se puede guardar (la caja pide autorización al vender)", async () => {
    const it = await createItem(db, owner, { ...base, qty: 3, cost: "50.000", price: "40.000" });
    expect(it.price).toBe(40_000);
  });
  it("precio a los sin precio con ganancia «300.000»", async () => {
    const it = await createItem(db, owner, { ...base, name: "Cable", qty: 2, cost: 20_000, price: 1 });
    await db.update(items).set({ price: 0 }).where(eq(items.id, it.id));
    expect(await priceUnpriced(db, owner, "300.000" as unknown as number)).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].price).toBe(320_000);
  });
  it("precio escrito en caja con puntos", async () => {
    const it = await createItem(db, owner, { ...base, name: "Vidrio", qty: 2, cost: 5_000, price: 1 });
    await db.update(items).set({ price: 0 }).where(eq(items.id, it.id));
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1, price: "25.000" }], payments: [{ method: "Efectivo", amount: "25.000" }] });
    expect(s.total).toBe(25_000);
  });
});
