import { waLink } from "@/lib/whatsapp";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { clients, settings, sales, users } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { SaleReceipt } from "@/components/receipt";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { ReceiptPdf } from "./receipt-pdf";
import { enabledMethods } from "@/lib/catalog";
import { EditSale } from "./edit-sale";
import { SaleActions } from "./sale-actions";

export default async function SalePage({ params, searchParams }: PageProps<"/ventas/[id]">) {
  const me = await requireMe("sell");
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [s] = await db.select().from(sales).where(eq(sales.id, id));
  if (!s) notFound();
  const [cfg] = await db.select().from(settings).limit(1);
  const [client] = s.client ? await db.select().from(clients).where(eq(clients.id, s.client)) : [];
  const [u] = await db.select().from(users).where(eq(users.id, s.by));
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/ventas" className="note hover:underline">← Ventas</Link>
        <div className="flex gap-2">
          {client?.phone && <a className="btn" target="_blank" rel="noopener" href={waLink(client.phone, `Hola ${client.name.split(" ")[0]}, gracias por tu compra en ${cfg.name}. Te envío tu comprobante ${s.no} en PDF.`)}>💬 WhatsApp</a>}
          <PrintButton />
        </div>
      </div>
      <ReceiptPdf no={s.no} auto={sp.nueva === "1"} whatsapp={!!client?.phone} />
      <div id="receipt-print"><SaleReceipt s={s} cfg={cfg} client={client ?? null} seller={u?.name ?? "—"} /></div>
      {s.tradeins?.length > 0 && (
        <div className="no-print mx-auto mt-4 max-w-[820px] rounded-lg border border-line p-3 text-[13px]">
          <b>Retomas recibidas:</b> {s.tradeins.map((t) => <Link key={t.item} className="ml-2 underline" target="_blank" href={`/retomas/acta/${t.item}`}>📄 Acta de {t.name}</Link>)}
        </div>
      )}
      {s.lines.some((l) => l.supplier) && (
        <div className="no-print mx-auto mt-4 max-w-[820px] rounded-lg border border-line p-3 text-[13px]">
          <b>Proveedor (uso interno):</b> {s.lines.filter((l) => l.supplier).map((l) => `${l.name} — ${l.supplier}`).join(" · ")}
        </div>
      )}
      {hasPerm(me, "settings") && (
        <div className="no-print mx-auto mt-4 max-w-[820px]">
          <EditSale methods={[...enabledMethods(cfg), "Retoma", "Abono previo"]} sale={{
            id: s.id, no: s.no, t: s.t, disc: s.disc, notes: s.notes, prepaid: s.prepaid,
            lines: s.lines.map((l) => ({ name: l.name, item: l.item, qty: l.qty, ret: l.ret || 0, price: l.price, cost: l.cost, warr: l.warr, serial: l.serial, serial2: l.serial2 ?? "", batt: l.batt ?? null })),
            payments: s.payments.map((p) => ({ method: p.method, amount: p.amount, t: p.t })),
          }} />
        </div>
      )}
      <SaleActions sale={{ id: s.id, no: s.no, lines: s.lines.map((l) => ({ name: l.name, qty: l.qty, ret: l.ret })) }} canRefund={hasPerm(me, "refund")} canDelete={hasPerm(me, "settings")} />
    </>
  );
}
