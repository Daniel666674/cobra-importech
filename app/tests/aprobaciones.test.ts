import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items } from "@/db/schema";
import type { Actor } from "@/server/core";
import { approve, approveAll, pendingList, reject } from "@/server/approvals";
import { importInventory, undoInventoryImport } from "@/server/import-inventory";
import { createItem, deleteItem } from "@/server/inventory";
import { createSale } from "@/server/sales";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u1", name: "Angelica", perms: ["approve", "inv_view", "inv_edit", "inv_delete", "sell"], locked: false };
const emp: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "inv_edit", "inv_delete", "sell"], locked: false };
const dev: Actor = { id: "u0", name: "Daniel", perms: ["inv_view", "inv_edit", "inv_delete", "sell", "users"], locked: true };
const acc = (name: string) => ({ cat: "Accesorios", name, qty: 3, cost: 20_000, price: 50_000 });

let db: Db;
beforeAll(async () => { db = await freshDb(); });
const get = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0];

describe("producto nuevo de un empleado", () => {
  it("queda por aprobar y no se puede vender", async () => {
    const it = await createItem(db, emp, acc("Funda A"));
    expect(it.approval).toMatchObject({ kind: "alta", name: "Anderson" });
    await expect(createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 50_000 }] })).rejects.toThrow(/disponible/);
    expect((await pendingList(db)).map((x) => x.id)).toContain(it.id);
  });
  it("solo la propietaria aprueba (ni el empleado ni el desarrollador)", async () => {
    const [p] = await pendingList(db);
    await expect(approve(db, emp, p.id)).rejects.toThrow(/propietaria/);
    await expect(approve(db, dev, p.id)).rejects.toThrow(/propietaria/);
    await approve(db, owner, p.id);
    expect((await get(p.id)).approval).toBeNull();
    const s = await createSale(db, emp, { lines: [{ item: p.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 50_000 }] });
    expect(s.total).toBe(50_000);
  });
  it("rechazado: no entra al inventario", async () => {
    const it = await createItem(db, emp, acc("Funda B"));
    await reject(db, owner, it.id, "No lo tenemos");
    expect(await get(it.id)).toBeUndefined();
  });
  it("lo que ingresa la propietaria entra directo", async () => {
    const it = await createItem(db, owner, acc("Funda C"));
    expect(it.approval).toBeNull();
  });
});

describe("eliminar", () => {
  it("el empleado solo pide: el producto sigue igual hasta que ella apruebe", async () => {
    const it = await createItem(db, owner, acc("Cable D"));
    expect(await deleteItem(db, emp, it.id)).toBe("pending");
    expect((await get(it.id)).approval).toMatchObject({ kind: "baja", name: "Anderson" });
    // sigue a la venta mientras tanto
    await createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 50_000 }] });
    await reject(db, owner, it.id);
    expect((await get(it.id)).approval).toBeNull();
    await deleteItem(db, emp, it.id);
    await approve(db, owner, it.id);
    expect(await get(it.id)).toBeUndefined();
  });
  it("la propietaria elimina directo", async () => {
    const it = await createItem(db, owner, acc("Cable E"));
    expect(await deleteItem(db, owner, it.id)).toBe("deleted");
    expect(await get(it.id)).toBeUndefined();
  });
});

describe("importar y deshacer", () => {
  const batch = [{ key: "r:1", cat: "Accesorios", name: "Vidrio F", spec: "", color: "", cond: "Nuevo", serial: "", qty: 5, cost: 5_000, price: 20_000, warr: 0, batt: null, min: 0, notes: "" }] as const;
  it("lo que importa un empleado espera aprobación; aprobar todo lo libera", async () => {
    await importInventory(db, emp, { source: "x.xlsx", items: batch });
    const [f] = (await db.select().from(items)).filter((i) => i.name === "Vidrio F");
    expect(f.approval?.kind).toBe("alta");
    expect(await approveAll(db, owner)).toBeGreaterThanOrEqual(1);
    expect((await get(f.id)).approval).toBeNull();
    // deshacer por el empleado: ya aprobado → queda como solicitud de eliminación
    expect(await undoInventoryImport(db, emp, "x.xlsx")).toBe(0);
    expect((await get(f.id)).approval?.kind).toBe("baja");
  });
});

describe("vender un producto sin precio", () => {
  it("el precio se escribe en caja y queda guardado; sin precio no se vende", async () => {
    const it = await createItem(db, owner, acc("Cargador G"));
    await db.update(items).set({ price: 0 }).where(eq(items.id, it.id));
    await expect(createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 1 }] })).rejects.toThrow(/precio/);
    const s = await createSale(db, emp, { lines: [{ item: it.id, qty: 1, price: 60_000 }], payments: [{ method: "Efectivo", amount: 60_000 }] });
    expect(s.total).toBe(60_000);
    expect((await get(it.id)).price).toBe(60_000);
    // con precio ya puesto, el de caja se ignora
    const s2 = await createSale(db, emp, { lines: [{ item: it.id, qty: 1, price: 1_000 }], payments: [{ method: "Efectivo", amount: 60_000 }] });
    expect(s2.total).toBe(60_000);
  });
});
