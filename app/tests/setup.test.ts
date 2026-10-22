import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { clients, items, sales, users } from "@/db/schema";
import { loginWithPassword, meFromToken } from "@/server/auth";
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
  it("valida usuario y contraseña, y crea solo al propietario (y al desarrollador si se pide)", async () => {
    const db = await emptyDb();
    const base = { business: "Importech", ownerName: "Angelica", ownerUser: "angelica" };
    await expect(runSetup(db, { ...base, ownerPass: "2222", ownerPass2: "2222" })).rejects.toThrow(/al menos 10/);
    await expect(runSetup(db, { ...base, ownerPass: "Angelica#2025x", ownerPass2: "Angelica#2025x" })).rejects.toThrow(/nombre/);
    await expect(runSetup(db, { ...base, ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Lunaa" })).rejects.toThrow(/no coincide/);
    await expect(runSetup(db, { ...base, ownerUser: "Á b", ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna" })).rejects.toThrow(/usuario/i);
    await expect(runSetup(db, { ...base, ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna", devName: "Daniel", devUser: "angelica", devPass: "Codigo!9Rio" })).rejects.toThrow(/distinto/);
    await runSetup(db, { ...base, ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna", devName: "Daniel", devUser: "daniel", devPass: "Codigo!9Rio" });
    expect(await needsSetup(db)).toBe(false);
    expect((await db.select({ n: count() }).from(users))[0].n).toBe(2);
    expect((await db.select({ n: count() }).from(items))[0].n).toBe(0);
    await expect(runSetup(db, { ...base, ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna" })).rejects.toThrow(/ya se hizo/);
    const r = await loginWithPassword("Angelica ", "Vitrina#7Luna");
    expect(r.ok).toBe(true);
    if (r.ok) expect((await meFromToken(r.token))?.mustChange).toBe(false);
    expect(await loginWithPassword("angelica", "vitrina#7luna")).toEqual({ ok: false, error: "Usuario o contraseña incorrectos" });
    expect(await loginWithPassword("nadie", "Vitrina#7Luna")).toEqual({ ok: false, error: "Usuario o contraseña incorrectos" });
  });
  it("el propietario entra, ingresa un equipo y lo vende desde cero", async () => {
    const db = await emptyDb();
    await runSetup(db, { business: "Importech", ownerName: "Angelica", ownerUser: "angelica", ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna" });
    const login = await loginWithPassword("angelica", "Vitrina#7Luna");
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
    await runSetup(db, { business: "Importech", ownerName: "Angelica", ownerUser: "angelica", ownerPass: "Vitrina#7Luna", ownerPass2: "Vitrina#7Luna" });
    const d = await dashboard(db);
    expect(d.kpi.monthTotal).toBe(0);
    expect(d.alerts).toEqual([]);
  });
});
