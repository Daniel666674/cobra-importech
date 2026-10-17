import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { items, sales } from "@/db/schema";
import { getMe, hasPerm } from "@/server/auth";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const me = await getMe();
  if (!me) return new NextResponse("No autorizado", { status: 401 });
  if (!hasPerm(me, "reports")) return new NextResponse("Sin permiso", { status: 403 });
  const { kind } = await ctx.params;
  const db = await getDb();
  let head: string[]; let rows: unknown[][];
  if (kind === "inventario") {
    head = ["id", "sku", "categoria", "producto", "detalle", "color", "condicion", "serial_imei", "cantidad", "costo", "precio", "garantia_meses", "estado", "ingreso", "origen"];
    rows = (await db.select().from(items)).map((i) => [i.id, i.sku, i.cat, i.name, i.spec, i.color, i.cond, i.serial, i.qty, i.cost, i.price, i.warr, i.status, new Date(i.acq).toISOString(), i.src]);
  } else if (kind === "ventas") {
    head = ["id", "comprobante", "fecha", "cliente_id", "vendedor_id", "metodo", "total", "descuento_pct", "productos"];
    rows = (await db.select().from(sales)).map((s) => [s.id, s.no, new Date(s.t).toISOString(), s.client, s.by, s.method, s.total, s.disc, s.lines.map((l) => `${l.qty}x ${l.name}`).join(" | ")]);
  } else return new NextResponse("No existe", { status: 404 });
  const csv = "﻿" + [head.join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
