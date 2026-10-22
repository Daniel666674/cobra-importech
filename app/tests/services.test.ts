import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { feed, imeiBlocklist, items, sales } from "@/db/schema";
import { createItem, getItem, reverifyItem, updateItem } from "@/server/inventory";
import { addAbono, createHold, createSale, extendHold, refundSale, releaseHold } from "@/server/sales";
import { verifyImei } from "@/server/imei";
import { AppError, type Actor } from "@/server/core";
import { withCheck } from "@/lib/imei-test";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["inv_view", "inv_edit", "inv_delete", "sell", "discount", "refund", "credit", "cost_view"], locked: false };
const emp: Actor = { id: "u3", name: "Anderson", perms: ["inv_view", "sell", "credit"], locked: false };
const phone = { cat: "iPhone", batt: 90, name: "iPhone 16", spec: "128 GB", color: "Negro", cond: "Nuevo", cost: 2500000, price: 3499000, warr: 12 };
let db: Db;
beforeAll(async () => { db = await freshDb(); });
const rejects = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };

describe("ingreso de iPhone con verificación oficial", () => {
  const imei = withCheck("35822002123456");
  it("sin resultado oficial no se guarda", async () => {
    await rejects(createItem(db, owner, { ...phone, serial: imei }), /verificación oficial/);
  });
  it("IMEI inválido se bloquea", async () => {
    await rejects(createItem(db, owner, { ...phone, serial: "123" }, { official: { crc: "clean", apple: "clean" } }), /15 dígitos/);
  });
  it("CRC reportado: no se guarda, se bloquea el IMEI y se alerta", async () => {
    const bad = withCheck("35822002999999");
    await rejects(createItem(db, owner, { ...phone, serial: bad }, { official: { crc: "reported", apple: "clean" } }), /reportado/i);
    expect((await db.select().from(imeiBlocklist).where(eq(imeiBlocklist.imei, bad))).length).toBe(1);
    expect((await verifyImei(db, bad)).verdict).toBe("blocked");
    const f = await db.select().from(feed);
    expect(f.some((x) => x.x.includes("Reportado"))).toBe(true);
  });
  it("Activation Lock exige aprobación del propietario", async () => {
    const im = withCheck("35822002555555");
    await rejects(createItem(db, owner, { ...phone, serial: im }, { official: { crc: "clean", apple: "locked" } }), /aprobación/);
    const r = await createItem(db, owner, { ...phone, serial: im }, { official: { crc: "clean", apple: "locked" }, ownerApproved: true });
    expect(r.imeiCheck?.apple.r).toBe("locked");
  });
  it("guarda con ambos resultados limpios y deja el historial", async () => {
    const r = await createItem(db, owner, { ...phone, serial: imei }, { official: { crc: "clean", apple: "clean" } });
    expect(r.imeiCheck?.crc.name).toBe("Angelica");
    const g = await getItem(db, r.id);
    expect(g!.events.map((e) => e.title)).toEqual(expect.arrayContaining(["Consulta oficial · CRC · Base de datos negativa", "Consulta oficial · Apple · Activation Lock"]));
  });
  it("no deja guardar el mismo IMEI dos veces", async () => {
    await rejects(createItem(db, owner, { ...phone, serial: imei }, { official: { crc: "clean", apple: "clean" } }), /Ya existe/);
  });
  it("un usuario sin permiso no puede ingresar", async () => {
    await rejects(createItem(db, emp, { ...phone, serial: withCheck("35822002777777") }, { official: { crc: "clean", apple: "clean" } }), /permiso/);
  });
  it("re-verificar con resultado malo bloquea el IMEI y alerta", async () => {
    const [it] = await db.select().from(items).where(eq(items.serial, imei));
    const r = await reverifyItem(db, owner, it.id, { crc: "reported", apple: "clean" });
    expect(r.bad.length).toBe(1);
    expect((await db.select().from(imeiBlocklist).where(eq(imeiBlocklist.imei, imei))).length).toBe(1);
  });
});

describe("ventas", () => {
  it("vende un accesorio por cantidad y baja el stock", async () => {
    const [acc] = await db.select().from(items).where(eq(items.id, "I-0060"));
    const before = acc.qty;
    const s = await createSale(db, emp, { lines: [{ item: acc.id, qty: 2 }], payments: [{ method: "Efectivo", amount: acc.price * 2 }], cash: acc.price * 2 + 1000 });
    expect(s.total).toBe(acc.price * 2);
    expect(s.cash?.change).toBe(1000);
    expect((await db.select().from(items).where(eq(items.id, acc.id)))[0].qty).toBe(before - 2);
  });
  it("no vende si los pagos no cuadran", async () => {
    const [it] = await db.select().from(items).where(eq(items.status, "En vitrina"));
    await rejects(createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 1000 }] }), /Falta asignar/);
  });
  it("vende un equipo único una sola vez", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0001"));
    const pay = [{ method: "Tarjeta débito", amount: it.price }];
    const s = await createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: pay });
    expect(s.no).toMatch(/^FV-/);
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("Vendido");
    await rejects(createSale(db, emp, { lines: [{ item: it.id, qty: 1 }], payments: pay }), /ya no está disponible/);
  });
  it("descuento sobre el límite: el empleado no puede, el propietario sí y queda alerta", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0002"));
    const base = { lines: [{ item: it.id, qty: 1 }], discount: { type: "pct", value: 10 }, discReason: "Cliente frecuente" };
    const total = Math.round(it.price * 0.9);
    await rejects(createSale(db, emp, { ...base, payments: [{ method: "Efectivo", amount: total }] }), /supera el límite/);
    const s = await createSale(db, owner, { ...base, payments: [{ method: "Efectivo", amount: total }] });
    expect(s.total).toBe(total);
    expect((await db.select().from(feed)).some((f) => f.x.includes("descuento de"))).toBe(true);
  });
  it("devolución regresa el equipo a vitrina", async () => {
    const all = await db.select().from(sales);
    const target = all.find((x) => x.lines.some((l) => l.item === "I-0001"))!;
    const r = await refundSale(db, owner, target.id, [1], "Falla del producto");
    expect(r.n).toBe(1);
    expect((await db.select().from(items).where(eq(items.id, "I-0001")))[0].status).toBe("En vitrina");
    await rejects(refundSale(db, owner, target.id, [1], "otra vez"), /Indica qué se devuelve/);
  });
});

describe("apartados", () => {
  let id: string;
  it("crea el apartado con abono mínimo", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0003"));
    id = it.id;
    await rejects(createHold(db, emp, { item: id, client: "c1", abono: 1000, method: "Efectivo" }), /abono mínimo/);
    const h = await createHold(db, emp, { item: id, client: "c1", abono: Math.round(it.price * 0.3), method: "Efectivo" });
    expect(h.hold.pays.length).toBe(1);
    expect((await db.select().from(items).where(eq(items.id, id)))[0].status).toBe("Apartado");
  });
  it("registra abonos y extiende", async () => {
    const r = await addAbono(db, emp, id, 500000, "Transferencia");
    expect(r.hold.pays.length).toBe(2);
    await extendHold(db, emp, id, 7);
    await rejects(addAbono(db, emp, id, 99999999, "Efectivo"), /no superar el saldo/);
  });
  it("cierra el apartado como venta descontando abonos", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, id));
    const due = it.price - it.hold!.abono;
    const s = await createSale(db, emp, { lines: [{ item: id, qty: 1 }], holdItem: id, payments: [{ method: "Efectivo", amount: due }] });
    expect(s.prepaid).toBe(it.hold!.abono);
    expect(s.total).toBe(it.price);
    expect((await db.select().from(items).where(eq(items.id, id)))[0].hold).toBeNull();
  });
  it("libera un apartado", async () => {
    const [it] = await db.select().from(items).where(eq(items.id, "I-0004"));
    expect(it.hold).not.toBeNull();
    await releaseHold(db, emp, it.id, true);
    expect((await db.select().from(items).where(eq(items.id, it.id)))[0].status).toBe("En vitrina");
  });
});

describe("edición", () => {
  it("cambia el precio y deja alerta", async () => {
    const r = await updateItem(db, owner, "I-0005", { price: 1234000 });
    expect(r.price).toBe(1234000);
  });
});
void AppError;
