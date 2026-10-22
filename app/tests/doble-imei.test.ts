import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { imeiBlocklist, items, tacModels } from "@/db/schema";
import { withCheck } from "@/lib/imei-test";
import { mergeRead, parseLabelText } from "@/lib/scan-parse";
import type { Actor } from "@/server/core";
import { createItem, listItems, updateItem } from "@/server/inventory";
import { createSale } from "@/server/sales";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["inv_view", "inv_edit", "sell", "cost_view"], locked: false };
const OK = { crc: "clean", apple: "clean" };
const I1 = withCheck("35822002600001"), I2 = withCheck("35822002600002"), I3 = withCheck("35822002600003");
const phone = (serial: string, serial2: string) => ({ cat: "iPhone", name: "iPhone 15", spec: "128 GB", color: "Negro", cond: "Usado", serial, serial2, batt: 88, cost: 2_000_000, price: 2_600_000, warr: 1 });

let db: Db;
beforeAll(async () => {
  db = await freshDb();
  await db.insert(tacModels).values({ tac: "35822002", name: "iPhone 15", t: Date.now(), by: "prueba" }).onConflictDoNothing();
});

describe("doble IMEI", () => {
  it("guarda el IMEI 2, se busca por él y sale en la venta", async () => {
    const it = await createItem(db, owner, phone(I1, I2), { official: OK });
    expect(it.serial2).toBe(I2);
    expect((await listItems(db, { q: I2.slice(-6) })).map((x) => x.id)).toEqual([it.id]);
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    expect(s.lines[0]).toMatchObject({ serial: I1, serial2: I2, batt: 88 });
  });
  it("rechaza IMEI 2 inválido, igual al 1, repetido o bloqueado", async () => {
    await expect(createItem(db, owner, phone(I3, "123"), { official: OK })).rejects.toThrow(/IMEI 2 no es válido/);
    await expect(createItem(db, owner, phone(I3, I3), { official: OK })).rejects.toThrow(/igual al IMEI 1/);
    await expect(createItem(db, owner, phone(I3, I2), { official: OK })).rejects.toThrow(/ya está registrado/);
    const b = withCheck("35822002600009");
    await db.insert(imeiBlocklist).values({ imei: b, reason: "Reportado", t: Date.now(), by: "x" });
    await expect(createItem(db, owner, phone(I3, b), { official: OK })).rejects.toThrow(/bloqueado/);
    expect(await db.select().from(items).where(eq(items.serial, I3))).toHaveLength(0);
  });
  it("se puede agregar o corregir el IMEI 2 al editar", async () => {
    const it = await createItem(db, owner, phone(I3, ""), { official: OK });
    const i4 = withCheck("35822002600004");
    await updateItem(db, owner, it.id, { serial2: i4 });
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].serial2).toBe(i4);
  });
  it("el escáner reconoce los dos IMEI de la caja", () => {
    expect(parseLabelText(`IMEI ${I1} IMEI2 ${I2}`)).toMatchObject({ imei: I1, imei2: I2 });
    expect(parseLabelText(`IMEI2: ${I2}  IMEI: ${I1}`)).toMatchObject({ imei: I1, imei2: I2 });
    expect(mergeRead({ imei: I1 }, { imei: I2 })).toMatchObject({ imei: I1, imei2: I2 });
    expect(mergeRead({ imei: I1, imei2: I2 }, { imei: I1 })).toMatchObject({ imei: I1, imei2: I2 });
  });
});

describe("editar sin tocar el IMEI 2", () => {
  it("cambiar el precio no borra el IMEI 2 ni la batería", async () => {
    const db2 = await freshDb();
    await db2.insert(tacModels).values({ tac: "35822002", name: "iPhone 15", t: Date.now(), by: "prueba" }).onConflictDoNothing();
    const it = await createItem(db2, owner, phone(withCheck("35822002600011"), withCheck("35822002600012")), { official: OK });
    await updateItem(db2, owner, it.id, { price: 2_700_000 });
    expect((await db2.select().from(items).where(eq(items.id, it.id)))[0]).toMatchObject({ price: 2_700_000, serial2: withCheck("35822002600012"), batt: 88 });
  });
});
