import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, sales, settings } from "@/db/schema";
import type { Actor } from "@/server/core";
import { saveBranches, saveCategories } from "@/server/admin";
import { createItem, getBranches, moveItemBranch } from "@/server/inventory";
import { createSale } from "@/server/sales";
import { systemHealth } from "@/server/health";
import { catDefs } from "@/lib/catalog";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["settings", "inv_edit", "sell", "approve", "inv_view"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });
const cats = async () => catDefs((await db.select().from(settings))[0].categories);
const full = async (extra: object[] = [], patch: Record<string, boolean> = {}) => ({ cats: [...(await cats()).map((c) => ({ name: c.name, kind: c.kind, sku: c.sku, active: patch[c.name] ?? c.active })), ...extra] });

describe("categorías por negocio", () => {
  it("agrega una categoría propia, crea productos con su SKU y tipo, y valida", async () => {
    await saveCategories(db, owner, await full([{ name: "Cámaras", kind: "unit", sku: "cam", active: true }, { name: "Cables", kind: "qty", sku: "CBL", active: true }]));
    const c = (await cats()).find((x) => x.name === "Cámaras")!;
    expect(c).toMatchObject({ kind: "unit", sku: "CAM", builtin: false });
    const u = await createItem(db, owner, { cat: "Cámaras", name: "Canon R50", serial: "SN-1", cost: 1_000_000, price: 1_500_000, warr: 6 });
    expect(u.sku).toMatch(/^CAM-/);
    expect(u.track).toBe("unit");
    const q = await createItem(db, owner, { cat: "Cables", name: "Cable HDMI", qty: 5, cost: 10_000, price: 20_000, warr: 0 });
    expect(q).toMatchObject({ track: "qty", qty: 5 });
    await expect(createItem(db, owner, { cat: "Drones", name: "X", cost: 1, price: 2, warr: 1 })).rejects.toThrow(/no existe/);
    await expect(saveCategories(db, owner, await full([{ name: "Cámaras", kind: "qty", sku: "XYZ", active: true }]))).rejects.toThrow(/repetida/);
    await expect(saveCategories(db, owner, await full([{ name: "Otra", kind: "qty", sku: "CAM", active: true }]))).rejects.toThrow(/código CAM/);
    await expect(saveCategories(db, owner, { cats: (await cats()).filter((x) => x.name !== "iPhone").map((x) => ({ ...x })) })).rejects.toThrow(/de fábrica/);
  });
  it("ocultar una categoría impide crear productos nuevos pero no borra los existentes; las propias con productos no se borran", async () => {
    await saveCategories(db, owner, await full([], { Cables: false }));
    await expect(createItem(db, owner, { cat: "Cables", name: "Cable USB", qty: 1, cost: 1, price: 2, warr: 0 })).rejects.toThrow(/desactivada/);
    expect((await db.select().from(items).where(eq(items.cat, "Cables"))).length).toBe(1);
    await expect(saveCategories(db, owner, { cats: (await cats()).filter((x) => x.name !== "Cables").map((x) => ({ ...x })) })).rejects.toThrow(/tiene productos/);
    await expect(saveCategories(db, { ...owner, perms: [] }, await full())).rejects.toThrow(/permiso/);
  });
});

describe("sedes por negocio", () => {
  it("agrega, asigna sede a productos, traslada y renombra actualizando productos y ventas", async () => {
    const main = (await getBranches(db))[0];
    await saveBranches(db, owner, { main, list: [{ name: main, from: main }, { name: "Sede Norte" }] });
    expect(await getBranches(db)).toEqual([main, "Sede Norte"]);
    const it = await createItem(db, owner, { cat: "Accesorios", name: "Cargador", qty: 3, cost: 10_000, price: 20_000, warr: 0, branch: "Sede Norte" });
    expect(it.branch).toBe("Sede Norte");
    await expect(createItem(db, owner, { cat: "Accesorios", name: "Cargador 2", qty: 1, cost: 1, price: 2, warr: 0, branch: "Inventada" })).rejects.toThrow(/no existe/);
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 20_000 }] });
    expect((await db.select().from(sales).where(eq(sales.id, s.id)))[0].branch).toBe("Sede Norte");
    await moveItemBranch(db, owner, it.id, main);
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].branch).toBe(main);
    await expect(moveItemBranch(db, owner, it.id, main)).rejects.toThrow(/Ya está/);
    await moveItemBranch(db, owner, it.id, "Sede Norte");
    await saveBranches(db, owner, { main, list: [{ name: main, from: main }, { name: "Sede Medellín", from: "Sede Norte" }] });
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].branch).toBe("Sede Medellín");
    expect((await db.select().from(sales).where(eq(sales.id, s.id)))[0].branch).toBe("Sede Medellín");
    await expect(saveBranches(db, owner, { main, list: [{ name: main, from: main }] })).rejects.toThrow(/tiene \d+ producto/);
    const h = await systemHealth(db);
    expect(h.checks.filter((c) => c.level === "bad")).toEqual([]);
  });
});
