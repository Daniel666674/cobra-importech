import { waLink } from "@/lib/whatsapp";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { allies, clients, itemEvents, items, settings, sales, users } from "@/db/schema";
import { fdatey, fdt, fmt } from "@/lib/format";
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
  // Trazabilidad: de dónde salió cada equipo vendido y qué le pasó desde que entró al inventario.
  const ids = [...new Set(s.lines.map((l) => l.item).filter(Boolean))];
  const canTrace = hasPerm(me, "inv_view") && ids.length > 0;
  const traced = canTrace ? await db.select().from(items).where(inArray(items.id, ids)) : [];
  const evs = canTrace ? await db.select().from(itemEvents).where(inArray(itemEvents.itemId, ids)).orderBy(asc(itemEvents.t), asc(itemEvents.id)) : [];
  const allyName = new Map((await db.select({ id: allies.id, name: allies.name }).from(allies)).map((x) => [x.id, x.name]));
  const canCost = hasPerm(me, "cost_view");
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
      {canTrace && (
        <div className="no-print mx-auto mt-4 max-w-[820px] rounded-lg border border-line p-3 text-[13px]">
          <b className="text-[14px]">🔎 Trazabilidad de los equipos de esta venta</b>
          <div className="mt-2 space-y-4">
            {traced.map((it) => {
              const hist = evs.filter((e) => e.itemId === it.id);
              return (
                <div key={it.id} className="rounded-md bg-bg p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b>{it.name}{it.spec ? ` · ${it.spec}` : ""}{it.color ? ` · ${it.color}` : ""}</b>
                    <Link className="underline" href={`/inventario/${it.id}`} target="_blank">Ver ficha completa →</Link>
                  </div>
                  <dl className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div><dt className="note inline">IMEI / serie: </dt><dd className="inline mono-ish">{it.serial || "—"}{it.serial2 ? ` · ${it.serial2}` : ""}</dd></div>
                    <div><dt className="note inline">Entró al inventario: </dt><dd className="inline"><b>{fdatey(it.acq)}</b></dd></div>
                    <div><dt className="note inline">Origen: </dt><dd className="inline"><b>{it.src || "—"}</b>{it.ally ? ` · tienda ${allyName.get(it.ally) ?? it.ally}` : ""}{it.seller?.name ? ` · lo entregó ${it.seller.name}${it.seller.doc ? " (" + it.seller.doc + ")" : ""}` : ""}</dd></div>
                    {canCost && <div><dt className="note inline">Costo: </dt><dd className="inline">{fmt(it.cost)}{it.repairs ? ` + reparaciones ${fmt(it.repairs)}` : ""}</dd></div>}
                  </dl>
                  {it.notes && <p className="mt-1 text-t2">{it.notes}</p>}
                  <ol className="mt-2 space-y-1 border-l border-line pl-3">
                    {hist.map((e) => (
                      <li key={e.id}><b>{e.title}</b>{e.detail ? <span className="text-t2"> · {e.detail}</span> : null}<span className="note"> · {fdt(e.t)} · {e.by}</span></li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasPerm(me, "settings") && (
        <div className="no-print mx-auto mt-4 max-w-[820px]">
          <EditSale banks={cfg.banks} methods={[...enabledMethods(cfg), "Retoma", "Abono previo"]} sale={{
            id: s.id, no: s.no, t: s.t, disc: s.disc, notes: s.notes, prepaid: s.prepaid,
            lines: s.lines.map((l) => ({ name: l.name, item: l.item, qty: l.qty, ret: l.ret || 0, price: l.price, cost: l.cost, warr: l.warr, serial: l.serial, serial2: l.serial2 ?? "", batt: l.batt ?? null })),
            payments: s.payments.map((p) => ({ method: p.method, amount: p.amount, t: p.t, bank: p.bank })),
          }} />
        </div>
      )}
      <SaleActions sale={{ id: s.id, no: s.no, lines: s.lines.map((l) => ({ name: l.name, qty: l.qty, ret: l.ret })) }} canRefund={hasPerm(me, "refund")} canDelete={hasPerm(me, "settings")} />
    </>
  );
}
