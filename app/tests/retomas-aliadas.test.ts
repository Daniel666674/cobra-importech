import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { allyMoves, clients, items, sales, tacModels } from "@/db/schema";
import { withCheck } from "@/lib/imei-test";
import { allyDetail, allySummary, payAlly, saveAlly } from "@/server/allies";
import type { Actor } from "@/server/core";
import { createItem } from "@/server/inventory";
import { createSale, refundSale } from "@/server/sales";
import { verifyImei } from "@/server/imei";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["inv_view", "inv_edit", "sell", "discount", "refund", "tradein", "cost_view", "purchase"], locked: false };
const seller: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell"], locked: false };
const OK = { crc: "clean", apple: "clean" };
const tradePhone = (imei: string, cost = 1_500_000) => ({ cat: "iPhone", name: "iPhone 13", spec: "128 GB", color: "Azul", cond: "Usado", serial: imei, cost, price: 2_100_000, warr: 1 });

let db: Db;
let clientId: string;
beforeAll(async () => {
  db = await freshDb();
  clientId = "c-ret";
  await db.insert(tacModels).values({ tac: "35822002", name: "iPhone 13", t: Date.now(), by: "prueba" }).onConflictDoNothing();
  await db.insert(clients).values({ id: clientId, name: "Laura Ríos", doc: "1010101010", phone: "3001112233", email: "", notes: "" });
});
const stockPhone = async () => (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 3_000_000 && !i.ally)!;

describe("retoma como parte de pago", () => {
  it("el equipo entra solo al inventario y su valor cuenta como pago", async () => {
    const it = await stockPhone();
    const imei = withCheck("35822002100001");
    const s = await createSale(db, owner, {
      lines: [{ item: it.id, qty: 1 }], client: clientId,
      tradeins: [{ item: tradePhone(imei), official: OK }],
      payments: [{ method: "Transferencia", amount: it.price - 1_500_000 }],
    });
    expect(s.total).toBe(it.price);
    expect(s.payments).toEqual([{ method: "Retoma", amount: 1_500_000 }, { method: "Transferencia", amount: it.price - 1_500_000 }]);
    expect(s.tradeins).toHaveLength(1);
    const [got] = await db.select().from(items).where(eq(items.id, s.tradeins[0].item));
    expect(got).toMatchObject({ serial: imei, status: "En vitrina", cost: 1_500_000, price: 2_100_000, src: "Trade-in", cond: "Usado" });
    expect(got.notes).toContain(`Recibido como parte de pago en ${s.no} de Laura Ríos (C.C. 1010101010`);
    expect(got.imeiCheck?.crc.r).toBe("clean");
  });
  it("la retoma puede cubrir todo el valor (sin otros pagos)", async () => {
    const it = await stockPhone();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100002"), it.price), official: OK }] });
    expect(s.payments).toEqual([{ method: "Retoma", amount: it.price }]);
  });
  it("exige cédula del cliente, verificación oficial y permiso de retomas", async () => {
    const it = await stockPhone();
    const base = { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price - 1_500_000 }] };
    await expect(createSale(db, owner, { ...base, tradeins: [{ item: tradePhone(withCheck("35822002100003")), official: OK }] })).rejects.toThrow(/cédula/);
    await expect(createSale(db, owner, { ...base, client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100003")) }] })).rejects.toThrow(/verificación oficial|oficial/i);
    await expect(createSale(db, seller, { ...base, client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100003")), official: OK }] })).rejects.toThrow(/permiso/);
    await expect(createSale(db, owner, { ...base, client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100003")), official: { crc: "reported", apple: "clean" } }] })).rejects.toThrow(/reportado/i);
    // Nada quedó a medias: ni el equipo de retoma ni la venta.
    expect(await db.select().from(items).where(eq(items.serial, withCheck("35822002100003")))).toHaveLength(0);
    expect((await stockPhone()).id).toBe(it.id);
  });
  it("si la retoma supera el total, no se mezcla con la venta", async () => {
    const it = await stockPhone();
    await expect(createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100004"), it.price + 10_000), official: OK }] })).rejects.toThrow(/supera/);
  });
  it("los pagos deben cuadrar con lo que falta después de la retoma", async () => {
    const it = await stockPhone();
    await expect(createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], client: clientId, tradeins: [{ item: tradePhone(withCheck("35822002100005")), official: OK }], payments: [{ method: "Efectivo", amount: it.price }] })).rejects.toThrow(/superan/);
  });
  it("un equipo que la tienda vendió antes puede volver como retoma", async () => {
    const [sold] = (await db.select().from(items)).filter((i) => i.status === "Vendido" && i.cat === "iPhone" && i.serial.length === 15);
    const r = await verifyImei(db, sold.serial);
    expect(r.verdict).not.toBe("blocked");
    expect(r.steps.map((x) => x.detail).join(" ")).toMatch(/Lo vendimos antes/);
  });
});

describe("tiendas aliadas", () => {
  let consig: string, compra: string;
  it("crea aliadas (solo con permiso)", async () => {
    consig = await saveAlly(db, owner, null, { name: "Celulares Don Pedro", mode: "consignacion", phone: "3005550000" });
    compra = await saveAlly(db, owner, null, { name: "iStore Centro", mode: "compra" });
    await expect(saveAlly(db, seller, null, { name: "X tienda" })).rejects.toThrow(/permiso/);
  });
  it("producto de aliada exige lo que se le paga; en compra se le debe desde que se recibe", async () => {
    await expect(createItem(db, owner, { cat: "Accesorios", name: "Funda", price: 80_000, cost: 0, qty: 2, ally: consig })).rejects.toThrow(/se le paga/);
    const a = await createItem(db, owner, { cat: "Accesorios", name: "Cargador 20 W", price: 120_000, cost: 70_000, qty: 3, ally: compra });
    expect(a).toMatchObject({ ally: compra, src: "Aliada: iStore Centro" });
    const [s] = (await allySummary(db)).filter((x) => x.id === compra);
    expect(s.balance).toBe(210_000);
  });
  it("en consignación se le debe al vender, con la ganancia de la tienda; la devolución lo descuenta", async () => {
    const it = await createItem(db, owner, { cat: "iPhone", name: "iPhone 14", spec: "128 GB", cond: "Usado", serial: withCheck("35822002100099"), price: 2_800_000, cost: 2_300_000, warr: 1, ally: consig }, { official: OK });
    let [s] = (await allySummary(db)).filter((x) => x.id === consig);
    expect(s).toMatchObject({ balance: 0, stockUnits: 1, stockCost: 2_300_000 });
    const sale = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], discount: { type: "cop", value: 100_000 }, discReason: "Cliente", payments: [{ method: "Efectivo", amount: 2_700_000 }] });
    expect(sale.lines[0].ally).toBe(consig);
    [s] = (await allySummary(db)).filter((x) => x.id === consig);
    expect(s).toMatchObject({ balance: 2_300_000, soldUnits: 1, revenue: 2_700_000, cost: 2_300_000, earned: 400_000, stockUnits: 0 });
    await refundSale(db, owner, sale.id, [1], "No le gustó");
    [s] = (await allySummary(db)).filter((x) => x.id === consig);
    expect(s).toMatchObject({ balance: 0, soldUnits: 0, earned: 0, stockUnits: 1 });
    const moves = await db.select().from(allyMoves).where(eq(allyMoves.ally, consig));
    expect(moves.map((m) => m.amount)).toEqual([2_300_000, -2_300_000]);
  });
  it("pagos a la aliada: no más de lo que se debe", async () => {
    const [it] = (await db.select().from(items)).filter((i) => i.ally === consig);
    await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    await expect(payAlly(db, owner, consig, { amount: 2_300_001 })).rejects.toThrow(/supera/);
    expect(await payAlly(db, owner, consig, { amount: 1_000_000, note: "Abono" })).toBe(1_300_000);
    expect(await payAlly(db, owner, consig, { amount: 1_300_000 })).toBe(0);
    const d = await allyDetail(db, consig);
    expect(d!.summary).toMatchObject({ balance: 0, paid: 2_300_000, earned: 500_000 });
    expect(d!.sold).toHaveLength(1);
  });
  it("una venta sin productos de aliadas no toca sus cuentas", async () => {
    const before = (await db.select().from(allyMoves)).length;
    const it = await stockPhone();
    await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    expect((await db.select().from(allyMoves)).length).toBe(before);
    expect((await db.select().from(sales).where(eq(sales.id, "x"))).length).toBe(0);
  });
});
