import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { items, sales } from "@/db/schema";
import type { Actor } from "@/server/core";
import { systemHealth } from "@/server/health";
import { createSale, refundSale } from "@/server/sales";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["sell", "discount", "refund", "inv_view", "tradein", "approve", "cost_view"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("revisión de consistencia", () => {
  it("los datos de ejemplo y las operaciones normales no generan alertas graves", async () => {
    const h0 = await systemHealth(db);
    expect(h0.checks.filter((c) => c.level === "bad").map((c) => c.key + ":" + c.items.map((i) => i.label).join("|"))).toEqual([]);
    const it = (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 0 && !i.ally)!;
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    expect((await systemHealth(db)).checks.filter((c) => c.level === "bad")).toEqual([]);
    await refundSale(db, owner, s.id, [1], "Prueba");
    expect((await systemHealth(db)).checks.filter((c) => c.level === "bad").map((c) => c.key)).toEqual([]);
  });
  it("detecta un equipo vendido que sigue en vitrina", async () => {
    const it = (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 0 && !i.ally)!;
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    await db.update(items).set({ status: "En vitrina" }).where(eq(items.id, it.id));
    const h = await systemHealth(db);
    expect(h.checks.find((c) => c.key === "sale-item-stock")!.items.some((i) => i.href === `/ventas/${s.id}`)).toBe(true);
    await db.update(sales).set({ pending: 5 }).where(eq(sales.id, s.id));
    expect((await systemHealth(db)).checks.find((c) => c.key === "sale-math")!.items.some((i) => i.href === `/ventas/${s.id}`)).toBe(true);
  });
});
