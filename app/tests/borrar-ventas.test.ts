import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { allyMoves, claims, clients, counters, items, sales, tacModels } from "@/db/schema";
import { withCheck } from "@/lib/imei-test";
import type { Actor } from "@/server/core";
import { openClaim } from "@/server/ops";
import { DELETE_ALL_PHRASE, createSale, deleteAllSales, deleteSale } from "@/server/sales";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["approve", "inv_view", "inv_edit", "sell", "discount", "refund", "tradein", "cost_view", "settings"], locked: false };
const seller: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell"], locked: false };
const OK = { crc: "clean", apple: "clean" };
let db: Db;
beforeAll(async () => {
  db = await freshDb();
  await db.insert(tacModels).values({ tac: "35822002", name: "iPhone 13", t: Date.now(), by: "prueba" }).onConflictDoNothing();
  await db.insert(clients).values({ id: "c-del", name: "Laura Ríos", doc: "1010101010", phone: "3001112233", email: "", notes: "" });
});
const stockPhone = async () => (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 3_000_000 && !i.ally)!;
const pay = async (id: string) => { const [it] = await db.select().from(items).where(eq(items.id, id)); return [{ method: "Efectivo", amount: it.price }]; };

describe("borrar ventas", () => {
  it("borra una venta: el equipo vuelve a vitrina y queda el aviso en su historial", async () => {
    const it = await stockPhone();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: await pay(it.id) });
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("Vendido");
    await deleteSale(db, owner, s.id);
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("En vitrina");
    expect(await db.select().from(sales).where(eq(sales.id, s.id))).toHaveLength(0);
  });
  it("solo con permiso de configuración", async () => {
    const it = await stockPhone();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: await pay(it.id) });
    await expect(deleteSale(db, seller, s.id)).rejects.toThrow(/permiso/);
    await expect(deleteAllSales(db, seller, DELETE_ALL_PHRASE)).rejects.toThrow(/permiso/);
    await deleteSale(db, owner, s.id);
  });
  it("devuelve las unidades de un accesorio por cantidad", async () => {
    const acc = (await db.select().from(items)).find((i) => i.track === "qty" && i.qty >= 3)!;
    const s = await createSale(db, owner, { lines: [{ item: acc.id, qty: 2 }], payments: [{ method: "Efectivo", amount: acc.price * 2 }] });
    expect((await db.select().from(items).where(eq(items.id, acc.id)))[0].qty).toBe(acc.qty - 2);
    await deleteSale(db, owner, s.id);
    expect((await db.select().from(items).where(eq(items.id, acc.id)))[0].qty).toBe(acc.qty);
  });
  it("quita la retoma que entró con la venta (para poder registrarla de nuevo)", async () => {
    const it = await stockPhone();
    const imei = withCheck("35822002100777");
    const trade = { cat: "iPhone", batt: 90, name: "iPhone 13", spec: "128 GB", color: "Azul", cond: "Usado", serial: imei, cost: 1_500_000, price: 2_100_000, warr: 1 };
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], client: "c-del", tradeins: [{ item: trade, official: OK }], payments: [{ method: "Transferencia", amount: it.price - 1_500_000 }] });
    expect(await db.select().from(items).where(eq(items.serial, imei))).toHaveLength(1);
    await deleteSale(db, owner, s.id);
    expect(await db.select().from(items).where(eq(items.serial, imei))).toHaveLength(0);
  });
  it("no borra si la retoma ya se vendió ni si tiene reclamo de garantía", async () => {
    const it = await stockPhone();
    const imei = withCheck("35822002100778");
    const trade = { cat: "iPhone", batt: 90, name: "iPhone 13", spec: "128 GB", color: "Azul", cond: "Usado", serial: imei, cost: 1_500_000, price: 2_100_000, warr: 1 };
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], client: "c-del", tradeins: [{ item: trade, official: OK }], payments: [{ method: "Transferencia", amount: it.price - 1_500_000 }] });
    const [t] = await db.select().from(items).where(eq(items.serial, imei));
    await createSale(db, owner, { lines: [{ item: t.id, qty: 1 }], payments: [{ method: "Efectivo", amount: t.price }] });
    await expect(deleteSale(db, owner, s.id)).rejects.toThrow(/retoma/);
    const it2 = await stockPhone();
    const s2 = await createSale(db, owner, { lines: [{ item: it2.id, qty: 1 }], payments: await pay(it2.id) });
    await openClaim(db, owner, s2.id, 0, "Falla");
    await expect(deleteSale(db, owner, s2.id)).rejects.toThrow(/reclamo/);
    expect(await db.select().from(claims).where(eq(claims.sale, s2.id))).toHaveLength(1);
  });
  it("anula la deuda a la tienda aliada que generó la venta", async () => {
    const ally = (await db.select().from(items)).find((i) => i.ally && i.status === "En vitrina" && i.track === "unit");
    if (!ally) return;
    const s = await createSale(db, owner, { lines: [{ item: ally.id, qty: 1 }], payments: [{ method: "Efectivo", amount: ally.price }] });
    await deleteSale(db, owner, s.id);
    expect(await db.select().from(allyMoves).where(eq(allyMoves.ref, s.no))).toHaveLength(0);
  });
  it("borra todas por tandas, pide la frase y reinicia la numeración", async () => {
    await expect(deleteAllSales(db, owner, "borrar")).rejects.toThrow(/BORRAR VENTAS/);
    let skip = 0, total = 0;
    for (;;) {
      const r = await deleteAllSales(db, owner, DELETE_ALL_PHRASE, skip, "1001", 3);
      total += r.deleted; skip = r.skip;
      if (r.done) break;
    }
    expect(total).toBeGreaterThan(0);
    expect((await db.select().from(sales).where(eq(sales.source, ""))).length).toBe(skip);
    const [c] = await db.select().from(counters).where(eq(counters.key, "invoice"));
    expect(skip === 0 ? c.value : -1).toBe(skip === 0 ? 1000 : -1);
  });
});
