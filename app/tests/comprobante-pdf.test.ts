import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clients, items, sales, settings, users } from "@/db/schema";
import type { Actor } from "@/server/core";
import { createSale } from "@/server/sales";
import { buildReceiptPdf } from "@/server/receipt-pdf";
import { freshDb } from "./helpers";

const owner: Actor = { id: "u2", name: "Angelica", perms: ["sell", "discount", "inv_view"], locked: false };
let db: Db;
beforeAll(async () => { db = await freshDb(); });

describe("comprobante en PDF", () => {
  it("se genera en el servidor con los datos de la venta", async () => {
    const it = (await db.select().from(items)).find((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 0)!;
    const s = await createSale(db, owner, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    const [row] = await db.select().from(sales).where(eq(sales.id, s.id));
    const [cfg] = await db.select().from(settings).limit(1);
    const [u] = await db.select().from(users).limit(1);
    const [c] = await db.select().from(clients).limit(1);
    const pdf = await buildReceiptPdf(row, cfg, c ?? null, u.name);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
