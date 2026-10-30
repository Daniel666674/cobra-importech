import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, sales } from "@/db/schema";
import type { Actor } from "@/server/core";
import { addCashMove, bogotaToday, cajaDay, closeDay, dayRange, payPending, receivables, voidCashMove } from "@/server/caja";
import { createSale } from "@/server/sales";
import { freshDb } from "./helpers";

const user: Actor = { id: "u2", name: "Angelica", perms: ["sell", "inv_view", "cost_view"], locked: false };
const nobody: Actor = { id: "u9", name: "Visita", perms: ["inv_view"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });
const phone = async () => (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 3_000_000 && !i.ally)!;

describe("caja del día", () => {
  it("el día va de 00:00 a 24:00 hora de Bogotá", () => {
    const r = dayRange("2026-10-30");
    expect(new Date(r.from).toISOString()).toBe("2026-10-30T05:00:00.000Z");
    expect(r.to - r.from).toBe(864e5);
    expect(() => dayRange("30/10/2026")).toThrow(/no válida/);
  });
  it("suma ventas por forma de pago, resta gastos y calcula el efectivo esperado", async () => {
    const it = await phone();
    const today = bogotaToday();
    const before = await cajaDay(db, today);
    const s = await createSale(db, user, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 1_000_000 }, { method: "Transferencia", amount: it.price - 1_000_000 }] });
    await addCashMove(db, user, { kind: "gasto", amount: "50.000", concept: "Almuerzo" });
    await addCashMove(db, user, { kind: "ingreso", amount: 20_000, concept: "Venta de cable sin factura" });
    const d = await cajaDay(db, today);
    expect(d.expected - before.expected).toBe(1_000_000 - 50_000 + 20_000);
    expect(d.byMethod.find((m) => m.method === "Transferencia")!.in - (before.byMethod.find((m) => m.method === "Transferencia")?.in ?? 0)).toBe(it.price - 1_000_000);
    expect(d.ins.some((x) => x.ref === s.no)).toBe(true);
    const gasto = d.moves.find((m) => m.concept === "Almuerzo")!;
    await voidCashMove(db, user, gasto.id);
    expect((await cajaDay(db, today)).expected - before.expected).toBe(1_000_000 + 20_000);
  });
  it("cierra el día con la diferencia y exige permiso", async () => {
    const d = await cajaDay(db, bogotaToday());
    const r = await closeDay(db, user, { day: bogotaToday(), counted: d.expected - 5000, notes: "faltan 5 mil" });
    expect(r).toEqual({ expected: d.expected, diff: -5000 });
    expect((await cajaDay(db, bogotaToday())).closes[0]).toMatchObject({ counted: d.expected - 5000 });
    await expect(closeDay(db, nobody, { day: bogotaToday(), counted: 0 })).rejects.toThrow(/permiso/);
    await expect(addCashMove(db, nobody, { kind: "gasto", amount: 1000, concept: "x" })).rejects.toThrow(/permiso/);
  });
});

describe("por cobrar", () => {
  it("lista el saldo, recibe pagos con fecha propia y los cuenta en la caja del día", async () => {
    const it = await phone();
    const s = await createSale(db, user, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 1_000_000 }] });
    expect(s.pending).toBe(it.price - 1_000_000);
    expect((await receivables(db)).map((x) => x.id)).toContain(s.id);
    const before = (await cajaDay(db, bogotaToday())).expected;
    await expect(payPending(db, user, s.id, { amount: it.price, method: "Efectivo" })).rejects.toThrow(/supera/);
    expect(await payPending(db, user, s.id, { amount: 300_000, method: "Efectivo" })).toEqual({ pending: it.price - 1_300_000 });
    expect((await cajaDay(db, bogotaToday())).expected - before).toBe(300_000);
    const [got] = await db.select().from(sales).where(eq(sales.id, s.id));
    expect(got.payments.at(-1)).toMatchObject({ method: "Efectivo", amount: 300_000 });
    expect(got.payments.at(-1)!.t).toBeGreaterThan(0);
    await payPending(db, user, s.id, { amount: it.price - 1_300_000, method: "Transferencia" });
    expect((await receivables(db)).map((x) => x.id)).not.toContain(s.id);
  });
});
