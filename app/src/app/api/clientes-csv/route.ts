import { getDb } from "@/db";
import { clients, sales } from "@/db/schema";
import { saleNet, saleVoid } from "@/lib/sales";
import { getMe, hasPerm } from "@/server/auth";

export const dynamic = "force-dynamic";
const cell = (v: string | number) => { const t = String(v ?? ""); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export async function GET(req: Request) {
  const me = await getMe();
  if (!me || me.mustChange || !hasPerm(me, "clients")) return new Response("No autorizado", { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase().trim();
  const db = await getDb();
  const [cl, ss] = await Promise.all([db.select().from(clients), db.select().from(sales)]);
  const lines = [["Cliente", "Documento", "Teléfono", "Correo", "Dirección", "Compras", "Total comprado", "Saldo por cobrar", "Última compra"].join(";")];
  for (const c of cl) {
    if (q && !`${c.name} ${c.doc} ${c.phone} ${c.email} ${c.address}`.toLowerCase().includes(q)) continue;
    const mine = ss.filter((s) => s.client === c.id && !saleVoid(s));
    const last = mine.reduce((a, s) => Math.max(a, s.t), 0);
    lines.push([c.name, c.doc, c.phone, c.email, c.address, mine.length, mine.reduce((a, s) => a + saleNet(s), 0), mine.reduce((a, s) => a + s.pending, 0), last ? new Date(last - 5 * 3600_000).toISOString().slice(0, 10) : ""].map(cell).join(";"));
  }
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="clientes.csv"`, "Cache-Control": "private, no-store" } });
}
