import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, sales, settings, users } from "@/db/schema";
import { getMe, hasPerm } from "@/server/auth";
import { buildReceiptPdf } from "@/server/receipt-pdf";

export const dynamic = "force-dynamic";

/** Comprobante de venta en PDF (generado en el servidor). Solo con sesión y permiso de ventas. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || me.mustChange || !hasPerm(me, "sell")) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [s] = await db.select().from(sales).where(eq(sales.id, id));
  if (!s) return new Response("Venta no encontrada", { status: 404 });
  const [[cfg], [client], [u]] = await Promise.all([
    db.select().from(settings).limit(1),
    s.client ? db.select().from(clients).where(eq(clients.id, s.client)) : Promise.resolve([]),
    db.select().from(users).where(eq(users.id, s.by)),
  ]);
  const pdf = await buildReceiptPdf(s, cfg, client ?? null, u?.name ?? "—");
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Comprobante ${s.no}.pdf"`, "Cache-Control": "private, no-store" } });
}
