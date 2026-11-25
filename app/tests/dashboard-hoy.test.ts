import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { items } from "@/db/schema";
import type { Actor } from "@/server/core";
import { createSale } from "@/server/sales";
import { dashboard } from "@/server/reports";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["sell", "discount", "inv_view"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("ventas de hoy en el panel", () => {
  it("cuenta el día de Bogotá completo, también después de las 7 p. m. (medianoche UTC)", async () => {
    const it = (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 0)!;
    const t = Date.UTC(2026, 0, 15, 19, 0, 0); // 15 ene, 2:00 p. m. en Bogotá
    await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }], date: t });
    const noche = await dashboard(db, Date.UTC(2026, 0, 16, 2, 0, 0)); // 15 ene, 9:00 p. m. en Bogotá
    expect(noche.kpi.todayCount).toBe(1);
    expect(noche.kpi.todayTotal).toBe(it.price);
    const manana = await dashboard(db, Date.UTC(2026, 0, 16, 14, 0, 0)); // 16 ene, 9:00 a. m.
    expect(manana.kpi.todayCount).toBe(0);
    expect(noche.days[13].total).toBe(it.price);
  });
});
