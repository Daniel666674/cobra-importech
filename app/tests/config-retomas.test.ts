import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import type { Actor } from "@/server/core";
import { saveTradeinConfig } from "@/server/admin";
import { dedTable, rateTable, tradeQuote } from "@/lib/tradein";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["settings"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("cotizador de retomas configurable", () => {
  it("usa los valores de fábrica y luego los del negocio", async () => {
    const base = tradeQuote({ ref: 2_000_000, cond: "Usado", deductions: [] });
    expect(base.rate).toBe(0.5);
    await saveTradeinConfig(db, owner, { rates: { Usado: 40, Nuevo: 90 }, deds: [{ key: "screen", label: "Pantalla rota", pct: 20 }, { key: "x1", label: "Sin garantía Apple", pct: 5 }] });
    const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
    const c = { rates: cfg.tradeRates, deds: cfg.tradeDeds };
    expect(rateTable(c).Usado).toBe(0.4);
    expect(rateTable(c)["Pre-owned"]).toBe(0.62); // lo no configurado conserva el de fábrica
    expect(dedTable(c).map((d) => d.key)).toEqual(["screen", "x1"]);
    const q = tradeQuote({ ref: 2_000_000, cond: "Usado", deductions: ["screen", "x1"], cfg: c });
    expect(q.rate).toBe(0.4);
    expect(q.dedPct).toBe(25);
    expect(q.offer).toBe(600_000); // 2.000.000 × 40 % = 800.000 − 25 % = 600.000
  });
  it("valida y se puede restablecer", async () => {
    await expect(saveTradeinConfig(db, owner, { rates: { Usado: 150 }, deds: [] })).rejects.toThrow(/entre 1 y 100/);
    await expect(saveTradeinConfig(db, owner, { rates: {}, deds: [{ key: "a", label: "Uno", pct: 5 }, { key: "a", label: "Dos", pct: 5 }] })).rejects.toThrow(/misma clave/);
    await saveTradeinConfig(db, owner, { rates: {}, deds: [], reset: true });
    const [cfg] = await db.select().from(settings).where(eq(settings.id, 1));
    expect(cfg.tradeRates).toEqual({});
    expect(cfg.tradeDeds).toEqual([]);
  });
  it("solo quien tiene permiso de configuración", async () => {
    await expect(saveTradeinConfig(db, { ...owner, perms: [] }, { rates: {}, deds: [] })).rejects.toThrow(/permiso/);
  });
});
