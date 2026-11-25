import { getDb } from "@/db";
import { matchItem, originOf, parseItemFilters } from "@/lib/item-filters";
import { stockQty } from "@/lib/items";
import { getMe, hasPerm } from "@/server/auth";
import { listItems } from "@/server/inventory";

export const dynamic = "force-dynamic";
const cell = (v: string | number) => { const t = String(v ?? ""); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** Inventario con los mismos filtros de la pantalla, para abrir en Excel. */
export async function GET(req: Request) {
  const me = await getMe();
  if (!me || me.mustChange || !hasPerm(me, "inv_view")) return new Response("No autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const xf = parseItemFilters(sp);
  const db = await getDb();
  const rows = (await listItems(db, { q: sp.q ?? "", cat: sp.cat ?? "", cond: sp.cond ?? "", status: sp.status ?? "stock" })).filter((it) => (!sp.model || it.name === sp.model) && matchItem(it, xf));
  const cost = hasPerm(me, "cost_view");
  const lines = [["SKU", "Categoría", "Producto", "Detalle", "Color", "Condición", "Estado", "IMEI/Serie", "Cantidad", "Origen", "Sede", "Ingresó", "Precio", ...(cost ? ["Costo", "Reparaciones"] : [])].join(";")];
  for (const it of rows) lines.push([it.sku, it.cat, it.name, it.spec, it.color, it.cond, it.status, it.serial, stockQty(it), `${originOf(it.src)}${it.src ? " (" + it.src + ")" : ""}`, it.branch, new Date(it.acq - 5 * 3600_000).toISOString().slice(0, 10), it.price, ...(cost ? [it.cost, it.repairs] : [])].map(cell).join(";"));
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventario.csv"`, "Cache-Control": "private, no-store" } });
}
