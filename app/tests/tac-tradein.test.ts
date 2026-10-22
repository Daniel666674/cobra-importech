import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, tacModels } from "@/db/schema";
import { createItem, importTacCsv } from "@/server/inventory";
import { verifyImei } from "@/server/imei";
import type { Actor } from "@/server/core";
import { withCheck } from "@/lib/imei-test";
import { tradeQuote } from "@/lib/tradein";
import { waLink } from "@/lib/whatsapp";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["approve", "inv_view", "inv_edit", "settings", "tradein"], locked: false };
const emp: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "tradein"], locked: false };
const ok = { crc: "clean", apple: "clean" };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("modelo por TAC", () => {
  const a = withCheck("49015420111111"); // TAC desconocido
  const b = withCheck("49015420222222"); // mismo TAC
  it("un TAC desconocido pide aprobación y luego se recuerda", async () => {
    expect((await verifyImei(db, a)).verdict).toBe("review");
    await expect(createItem(db, owner, { cat: "iPhone", batt: 90, name: "iPhone 14", serial: a, price: 2000000 }, { official: ok })).rejects.toThrow(/aprobación/);
    await createItem(db, owner, { cat: "iPhone", batt: 90, name: "iPhone 14", serial: a, price: 2000000 }, { official: ok, ownerApproved: true });
    const r = await verifyImei(db, b);
    expect(r.verdict).toBe("clean");
    expect(r.modelName).toBe("iPhone 14");
  });
  it("importa solo los modelos de Apple desde un CSV", async () => {
    const n = await importTacCsv(db, owner, "tac,marca,modelo\n35305111,Apple Inc.,iPhone 15 Pro\n35305222,Samsung,Galaxy S24\n35305333;Apple;iPhone 16\n123,Apple,corto");
    expect(n).toBe(2);
    expect((await db.select().from(tacModels).where(eq(tacModels.tac, "35305111")))[0].name).toBe("iPhone 15 Pro");
    expect((await verifyImei(db, withCheck("35305333444444"))).modelName).toBe("iPhone 16");
  });
});

describe("retomas", () => {
  it("cotiza por condición y descuenta defectos", () => {
    expect(tradeQuote({ ref: 3000000, cond: "Pre-owned", deductions: [] })).toMatchObject({ base: 1860000, offer: 1860000 });
    const q = tradeQuote({ ref: 3000000, cond: "Pre-owned", deductions: ["screen"], batt: 78 });
    expect(q.dedPct).toBe(21);
    expect(q.offer).toBe(1470000);
  });
  it("quien tiene permiso de trade-in puede recibirla sin editar inventario", async () => {
    const imei = withCheck("49015420333333");
    const r = await createItem(db, emp, { cat: "iPhone", batt: 90, name: "iPhone 14", serial: imei, cost: 1500000, price: 2200000, src: "Trade-in", cond: "Usado" }, { official: ok });
    expect(r.src).toBe("Trade-in");
    await expect(createItem(db, emp, { cat: "iPhone", batt: 90, name: "iPhone 14", serial: withCheck("49015420444444"), price: 1, src: "Importación" }, { official: ok })).rejects.toThrow(/permiso/);
    expect((await db.select().from(items).where(eq(items.id, r.id)))[0].cost).toBe(1500000);
  });
});

describe("WhatsApp", () => {
  it("agrega el indicativo de Colombia y codifica el mensaje", () => {
    expect(waLink("300 111 2222", "Hola ñandú")).toBe("https://wa.me/573001112222?text=Hola%20%C3%B1and%C3%BA");
    expect(waLink("573001112222", "x")).toContain("wa.me/573001112222");
  });
});
