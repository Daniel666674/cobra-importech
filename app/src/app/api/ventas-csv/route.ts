import { getDb } from "@/db";
import { clients, items, users } from "@/db/schema";
import { parseSaleFilters, matchSale } from "@/lib/sale-filters";
import { saleCost, saleNet, saleVoid } from "@/lib/sales";
import { getMe, hasPerm } from "@/server/auth";
import { listSales } from "@/server/sales";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => { const t = String(v ?? ""); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** Ventas con los mismos filtros de la pantalla, para abrir en Excel. */
export async function GET(req: Request) {
  const me = await getMe();
  if (!me || me.mustChange || !hasPerm(me, "sell")) return new Response("No autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = parseSaleFilters(sp);
  const db = await getDb();
  const [all, cl, us, its] = await Promise.all([listSales(db), db.select().from(clients), db.select().from(users), db.select({ id: items.id, cat: items.cat }).from(items)]);
  const cn = new Map(cl.map((c) => [c.id, c]));
  const un = new Map(us.map((u) => [u.id, u.name]));
  const ctx = { itemCat: new Map(its.map((i) => [i.id, i.cat])), clientText: new Map(cl.map((c) => [c.id, `${c.name} ${c.doc} ${c.phone}`])) };
  const cost = hasPerm(me, "cost_view");
  const rows = all.filter((s) => matchSale(s, f, ctx));
  const head = ["Comprobante", "Fecha", "Cliente", "Documento", "Productos", "Forma de pago", "Vendedor", "Sede", "Total", "Saldo pendiente", "Estado", ...(cost ? ["Costo", "Margen"] : [])];
  const lines = [head.join(";")];
  for (const s of rows) {
    const c = s.client ? cn.get(s.client) : null;
    const net = saleNet(s);
    lines.push([s.no, new Date(s.t - 5 * 3600_000).toISOString().slice(0, 16).replace("T", " "), c?.name ?? "Mostrador", c?.doc ?? "", s.lines.map((l) => `${l.qty}x ${l.name}${l.serial ? " (" + l.serial + ")" : ""}`).join(" | "), s.method, un.get(s.by) ?? "", s.branch, net, s.pending, saleVoid(s) ? "Devuelta" : s.pending > 0 ? "Con saldo" : "Pagada", ...(cost ? [saleCost(s), net - saleCost(s)] : [])].map(cell).join(";"));
  }
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ventas.csv"`, "Cache-Control": "private, no-store" } });
}
