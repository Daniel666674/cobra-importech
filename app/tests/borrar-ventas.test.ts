import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { allyMoves, claims, clients, counters, items, sales, tacModels } from "@/db/schema";
import { withCheck } from "@/lib/imei-test";
import type { Actor } from "@/server/core";
import { openClaim } from "@/server/ops";
import { DELETE_ALL_PHRASE, createSale, deleteAllSales, deleteSale, renameSale } from "@/server/sales";
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

describe("cambiar el número de comprobante", () => {
  it("lo cambia a mano, no deja repetir y solo con permiso", async () => {
    const it = await stockPhone();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: await pay(it.id) });
    const it2 = await stockPhone();
    const s2 = await createSale(db, owner, { lines: [{ item: it2.id, qty: 1 }], payments: await pay(it2.id) });
    expect(await renameSale(db, owner, s.id, " A-2001 ")).toBe("A-2001");
    expect((await db.select().from(sales).where(eq(sales.id, s.id)))[0].no).toBe("A-2001");
    await expect(renameSale(db, owner, s2.id, "A-2001")).rejects.toThrow(/Ya existe/);
    await expect(renameSale(db, owner, s2.id, "mal número!")).rejects.toThrow(/Solo letras/);
    await expect(renameSale(db, seller, s2.id, "B-1")).rejects.toThrow(/permiso/);
  });
});

describe("producto fuera de inventario con proveedor", () => {
  it("anota la deuda a la tienda aliada en consignación y exige lo que se le paga", async () => {
    const { allies } = await import("@/db/schema");
    await db.insert(allies).values({ id: "al-x", name: "Aliada X", mode: "consignacion", active: true, t: Date.now() }).onConflictDoNothing();
    const custom = { name: "iPhone 14 Pro", spec: "256 GB", color: "Morado", cond: "Usado", serial: "359128122127265", batt: 100, price: 3_000_000, warr: 1, ally: "al-x" };
    await expect(createSale(db, owner, { custom: [{ ...custom, cost: 0 }], payments: [{ method: "Efectivo", amount: 3_000_000 }] })).rejects.toThrow(/se le paga/);
    const s = await createSale(db, owner, { custom: [{ ...custom, cost: 2_500_000 }], payments: [{ method: "Efectivo", amount: 3_000_000 }] });
    expect(s.lines[0].ally).toBe("al-x");
    const moves = await db.select().from(allyMoves).where(eq(allyMoves.ref, s.no));
    expect(moves).toMatchObject([{ ally: "al-x", kind: "deuda", amount: 2_500_000 }]);
    await expect(createSale(db, owner, { custom: [{ ...custom, ally: "no-existe", cost: 1 }], payments: [{ method: "Efectivo", amount: 3_000_000 }] })).rejects.toThrow(/ya no existe/);
  });
});

describe("dirección del cliente", () => {
  it("se guarda al crear o editar un cliente y al crearlo en una venta", async () => {
    const { saveClient } = await import("@/server/ops");
    const id = await saveClient(db, { ...owner, perms: [...owner.perms, "clients"] }, null, { name: "Ana", address: "Calle 10 # 5-20" });
    expect((await db.select().from(clients).where(eq(clients.id, id)))[0].address).toBe("Calle 10 # 5-20");
    const it = await stockPhone();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], newClient: { name: "Pedro", address: " Carrera 7 # 1-2 " }, payments: await pay(it.id) });
    const [c] = await db.select().from(clients).where(eq(clients.id, s.client!));
    expect(c.address).toBe("Carrera 7 # 1-2");
  });
});

describe("tienda proveedora escrita a mano", () => {
  const custom = { name: "iPhone 14 Pro", spec: "256 GB", color: "Morado", cond: "Usado", batt: 100, price: 3_000_000, warr: 1, supplier: "  Celulares El Centro " };
  it("exige lo que se le paga, crea la tienda aliada sola y anota la deuda en su cartera", async () => {
    const { allies } = await import("@/db/schema");
    const pay1 = [{ method: "Efectivo", amount: 3_000_000 }];
    await expect(createSale(db, owner, { custom: [{ ...custom, serial: "359128122127270", cost: 0 }], payments: pay1 })).rejects.toThrow(/se le paga/);
    const s = await createSale(db, owner, { custom: [{ ...custom, serial: "359128122127271", cost: 2_400_000 }], payments: pay1 });
    expect(s.lines[0]).toMatchObject({ supplier: "Celulares El Centro" });
    const found = (await db.select().from(allies)).filter((x) => x.name === "Celulares El Centro");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ mode: "consignacion", active: true });
    expect(s.lines[0].ally).toBe(found[0].id);
    expect(await db.select().from(allyMoves).where(eq(allyMoves.ref, s.no))).toMatchObject([{ ally: found[0].id, kind: "deuda", amount: 2_400_000 }]);
    // Segunda venta con el mismo nombre (otras mayúsculas): reutiliza la tienda y suma la deuda.
    const s2 = await createSale(db, owner, { custom: [{ ...custom, supplier: "celulares el centro", serial: "359128122127272", cost: 1_000_000 }], payments: pay1 });
    expect((await db.select().from(allies)).filter((x) => x.name.toLowerCase() === "celulares el centro")).toHaveLength(1);
    expect(s2.lines[0].ally).toBe(found[0].id);
    expect(await db.select().from(allyMoves).where(eq(allyMoves.ref, s2.no))).toMatchObject([{ ally: found[0].id, amount: 1_000_000 }]);
  });
  it("una tienda de tipo «compra» también recibe la deuda de un producto fuera de inventario", async () => {
    const { allies } = await import("@/db/schema");
    await db.insert(allies).values({ id: "al-compra", name: "Tienda Compra", mode: "compra", active: true, t: Date.now() });
    const s = await createSale(db, owner, { custom: [{ ...custom, supplier: "Tienda Compra", serial: "359128122127273", cost: 500_000 }], payments: [{ method: "Efectivo", amount: 3_000_000 }] });
    expect(await db.select().from(allyMoves).where(eq(allyMoves.ref, s.no))).toMatchObject([{ ally: "al-compra", amount: 500_000 }]);
  });
});

describe("fecha de la venta y accesorios fuera de inventario", () => {
  it("guarda el día escogido, no acepta fechas futuras y el comprobante usa esa fecha", async () => {
    const it = await stockPhone();
    const day = new Date(2026, 8, 10, 12).getTime();
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: await pay(it.id), date: day });
    expect(s.t).toBe(day);
    const it2 = await stockPhone();
    await expect(createSale(db, owner, { lines: [{ item: it2.id, qty: 1 }], payments: await pay(it2.id), date: Date.now() + 3 * 864e5 })).rejects.toThrow(/futura/);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const s2 = await createSale(db, owner, { lines: [{ item: it2.id, qty: 1 }], payments: await pay(it2.id), date: today.getTime() + 864e5 / 2 });
    expect(s2.t).toBeLessThanOrEqual(Date.now());
  });
  it("un accesorio manual no pide batería aunque diga iPhone, usa la cantidad y su tienda genera deuda", async () => {
    const acc = { cat: "Accesorios", name: "Funda iPhone 15 Pro", spec: "", color: "Negro", cond: "Nuevo", qty: 3, price: 50_000, cost: 20_000, warr: 0, supplier: "Accesorios Ruiz" };
    const s = await createSale(db, owner, { custom: [acc], payments: [{ method: "Efectivo", amount: 150_000 }] });
    expect(s.total).toBe(150_000);
    expect(s.lines[0]).toMatchObject({ qty: 3, supplier: "Accesorios Ruiz" });
    expect(await db.select().from(allyMoves).where(eq(allyMoves.ref, s.no))).toMatchObject([{ kind: "deuda", amount: 60_000 }]);
    await expect(createSale(db, owner, { custom: [{ ...acc, cat: "iPhone", supplier: "" }], payments: [{ method: "Efectivo", amount: 150_000 }] })).rejects.toThrow(/batería/);
  });
});
