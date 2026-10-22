import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { imeiBlocklist, items } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { withCheck } from "@/lib/imei-test";
import { buildItems, guessInvMapping, inferCat } from "@/lib/inventory-import";
import type { Actor } from "@/server/core";
import { importInventory, undoInventoryImport } from "@/server/import-inventory";
import { createSale } from "@/server/sales";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["inv_view", "inv_edit", "inv_delete", "sell"], locked: false };
const seller: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell"], locked: false };
const WARR = { Nuevo: 12, Exhibición: 9, Reacondicionado: 6, "Pre-owned": 3, Usado: 1 };
const I1 = withCheck("35822002400001"), I2 = withCheck("35822002400002");
const CSV = [
  "Producto;Capacidad;Color;Estado;IMEI;Cantidad;Costo;Precio Venta;Batería",
  `iPhone 15 Pro;256 GB;Natural;Nuevo;${I1};1;4.300.000;5.200.000;100`,
  `iPhone 13;128 GB;Azul;Usado;${I2};1;1.500.000;2.100.000;87%`,
  "AirPods Pro 2;;Blanco;Nuevo;;4;780.000;950.000;",
  "Cargador USB-C 20 W;;;Nuevo;;15;45.000;89.000;",
  "iPad 10;64 GB;Plata;Nuevo;;2;1.400.000;1.900.000;",
  "iPhone 12;64 GB;Negro;Usado;123;1;1;1.000.000;",
  "Funda;;;Nuevo;;0;5.000;20.000;",
  ";;;;;;;;",
  "Watch SE;40 mm;;Nuevo;;1;;1.300.000;",
].join("\n");

describe("lectura del archivo de inventario", () => {
  const rows = parseCsv(CSV);
  const map = guessInvMapping(rows[0]);
  it("reconoce las columnas comunes", () => {
    expect(map).toMatchObject({ name: 0, spec: 1, color: 2, cond: 3, serial: 4, qty: 5, cost: 6, price: 7, batt: 8 });
  });
  it("deduce la categoría, expande equipos sin serial y reporta lo que no sirve", () => {
    const { items: its, issues } = buildItems(rows.slice(1), map, { warr: WARR });
    expect(its.map((i) => i.cat)).toEqual(["iPhone", "iPhone", "AirPods", "Accesorios", "iPad", "iPad", "Apple Watch"]);
    expect(its[1]).toMatchObject({ cond: "Usado", warr: 1, batt: 87, cost: 1_500_000, price: 2_100_000 });
    expect(its[2]).toMatchObject({ qty: 4, min: 3 });
    expect(its[4].key).not.toBe(its[5].key);
    expect(its[6].cost).toBe(0);
    expect(issues.map((x) => x.msg)).toEqual([expect.stringMatching(/IMEI no válido/), expect.stringMatching(/Cantidad en 0/)]);
    expect(inferCat("", "MacBook Air M2")).toBe("Mac");
    expect(inferCat("ipad", "x")).toBe("iPad");
  });
});

describe("importar al sistema", () => {
  let db: Db;
  const batch = () => {
    const rows = parseCsv(CSV);
    return buildItems(rows.slice(1), guessInvMapping(rows[0]), { warr: WARR }).items;
  };
  beforeAll(async () => { db = await freshDb(); });

  it("crea los productos; los iPhone quedan «En revisión» y no se pueden vender", async () => {
    const r = await importInventory(db, owner, { source: "inventario.xlsx", items: batch() });
    expect(r).toMatchObject({ created: 7, units: 24, review: 2, skipped: [] });
    const [ip] = await db.select().from(items).where(eq(items.serial, I1));
    expect(ip).toMatchObject({ status: "En revisión", src: "Importado: inventario.xlsx", cost: 4_300_000, price: 5_200_000, track: "unit" });
    const [cg] = (await db.select().from(items)).filter((i) => i.name === "Cargador USB-C 20 W");
    expect(cg).toMatchObject({ status: "En vitrina", qty: 15, track: "qty" });
    await expect(createSale(db, owner, { lines: [{ item: ip.id, qty: 1 }], payments: [{ method: "Efectivo", amount: ip.price }] })).rejects.toThrow(/disponible/);
  });
  it("volver a subir el mismo archivo no duplica", async () => {
    const r = await importInventory(db, owner, { source: "inventario.xlsx", items: batch() });
    expect(r.created).toBe(0);
    expect(r.skipped).toHaveLength(7);
  });
  it("salta IMEI bloqueados y exige permiso de inventario", async () => {
    const i3 = withCheck("35822002400003");
    await db.insert(imeiBlocklist).values({ imei: i3, reason: "Reportado", t: Date.now(), by: "x" });
    const r = await importInventory(db, owner, { source: "otro.csv", items: [{ ...batch()[0], key: "s:" + i3, serial: i3 }] });
    expect(r.skipped[0].why).toMatch(/bloqueados/);
    await expect(importInventory(db, seller, { source: "x.csv", items: batch() })).rejects.toThrow(/permiso/);
  });
  it("deshacer borra lo importado que no se ha vendido", async () => {
    const [cg] = (await db.select().from(items)).filter((i) => i.name === "Cargador USB-C 20 W");
    await createSale(db, owner, { lines: [{ item: cg.id, qty: 1 }], payments: [{ method: "Efectivo", amount: cg.price }] });
    const n = await undoInventoryImport(db, owner, "inventario.xlsx");
    expect(n).toBe(6);
    const left = (await db.select().from(items)).filter((i) => i.src === "Importado: inventario.xlsx");
    expect(left.map((i) => i.name)).toEqual(["Cargador USB-C 20 W"]);
  });
});

describe("pasar a vitrina en bloque", () => {
  it("solo administradores; pasa todos los «En revisión» y lo anota", async () => {
    const db = await freshDb();
    const { releaseAllReview } = await import("@/server/inventory");
    const rows = parseCsv(CSV);
    await importInventory(db, owner, { source: "x.xlsx", items: buildItems(rows.slice(1), guessInvMapping(rows[0]), { warr: WARR }).items });
    await expect(releaseAllReview(db, owner)).rejects.toThrow(/permiso/);
    const n = await releaseAllReview(db, { ...owner, perms: [...owner.perms, "users"] });
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(items)).filter((i) => i.status === "En revisión")).toHaveLength(0);
  });
});
