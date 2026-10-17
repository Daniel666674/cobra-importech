import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { clients, items, sales, users } from "@/db/schema";
import { checkLogin, meFromToken } from "@/server/auth";
import { runSetup, needsSetup } from "@/server/setup";
import { createItem } from "@/server/inventory";
import { createSale } from "@/server/sales";
import { dashboard } from "@/server/reports";
import { withCheck } from "@/lib/imei-test";
import { emptyDb } from "./helpers";

describe("tienda nueva y vacía", () => {
  it("empieza sin datos y pide la configuración inicial", async () => {
    const db = await emptyDb();
    expect(await needsSetup(db)).toBe(true);
    for (const t of [items, sales, clients, users]) expect((await db.select({ n: count() }).from(t))[0].n).toBe(0);
  });
  it("valida el PIN y crea solo al propietario (y al desarrollador si se pide)", async () => {
    const db = await emptyDb();
    await expect(runSetup(db, { business: "Importech", ownerName: "Angelica", ownerPin: "12" })).rejects.toThrow(/PIN/);
    await runSetup(db, { business: "Importech", ownerName: "Angelica", ownerPin: "2222", devName: "Daniel", devPin: "1111" });
    expect(await needsSetup(db)).toBe(false);
    expect((await db.select({ n: count() }).from(users))[0].n).toBe(2);
    expect((await db.select({ n: count() }).from(items))[0].n).toBe(0);
    await expect(runSetup(db, { business: "Otra", ownerName: "Otra", ownerPin: "1234" })).rejects.toThrow(/ya se hizo/);
  });
  it("el propietario entra, ingresa un equipo y lo vende desde cero", async () => {
    const db = await emptyDb();
    await runSetup(db, { business: "Importech", ownerName: "Angelica", ownerPin: "2222" });
    const login = await checkLogin("u1", "2222");
    expect(login.ok).toBe(true);
    const me = login.ok ? await meFromToken(login.token) : null;
    const a = { id: me!.id, name: me!.name, perms: me!.perms, locked: me!.locked };
    const imei = withCheck("35822002000001");
    const it = await createItem(db, a, { cat: "iPhone", name: "iPhone 16", spec: "128 GB", serial: imei, cost: 2500000, price: 3499000, warr: 12 }, { official: { crc: "clean", apple: "clean" }, ownerApproved: true });
    const s = await createSale(db, a, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: 3499000 }] });
    expect(s.no).toBe("FV-1001");
    expect(s.id).toBe("S-0001");
    const d = await dashboard(db);
    expect(d.kpi.todayCount).toBe(1);
    expect(d.kpi.stockUnits).toBe(0);
  });
  it("el panel funciona con la tienda vacía", async () => {
    const db = await emptyDb();
    await runSetup(db, { business: "Importech", ownerName: "Angelica", ownerPin: "2222" });
    const d = await dashboard(db);
    expect(d.kpi.monthTotal).toBe(0);
    expect(d.alerts).toEqual([]);
  });
});
