import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { clients, items, settings, users } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { ReceiptFrame } from "@/components/receipt";
import { fdt, fmt } from "@/lib/format";
import { holdBal } from "@/lib/hold";
import { uname } from "@/lib/items";
import { requireMe } from "@/server/session";
import { inWords } from "@/lib/words";

export default async function HoldReceipt({ params }: PageProps<"/apartados/[id]">) {
  await requireMe("credit");
  const { id } = await params;
  const db = await getDb();
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it?.hold) notFound();
  const h = it.hold;
  const [cfg] = await db.select().from(settings).limit(1);
  const [c] = await db.select().from(clients).where(eq(clients.id, h.client));
  const us = new Map((await db.select().from(users)).map((u) => [u.id, u.name]));
  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between"><Link href="/apartados" className="note hover:underline">← Apartados</Link><PrintButton /></div>
      <ReceiptFrame cfg={cfg} kind="Recibo de apartado" no={h.no} t={h.t} stamp={["APARTADO", "warn"]}>
        <div className="mt-5 grid gap-1 text-[13px]">
          <p><b>Cliente:</b> {c?.name ?? "—"} {c?.doc ? `· ${c.doc}` : ""} {c?.phone ? `· ${c.phone}` : ""}</p>
          <p><b>Equipo:</b> {uname(it)} {it.color ? `· ${it.color}` : ""} · {it.serial}</p>
          <p><b>Precio:</b> {fmt(it.price)} · <b>Vence:</b> {fdt(h.expires)}</p>
        </div>
        <table className="mt-4 w-full text-[12.5px]"><thead><tr className="border-b-2 border-gray-300 text-left text-[10.5px] uppercase tracking-wider text-gray-500"><th className="py-2">Recibo</th><th>Fecha</th><th>Método</th><th>Recibió</th><th className="text-right">Valor</th></tr></thead>
          <tbody>{h.pays.map((p) => <tr key={p.no} className="border-b border-gray-100"><td className="py-2">{p.no}</td><td>{fdt(p.t)}</td><td>{p.method}</td><td>{(us.get(p.by) ?? "—").split(" ")[0]}</td><td className="text-right tabular-nums">{fmt(p.amount)}</td></tr>)}</tbody></table>
        <div className="mt-4 space-y-1 text-right text-[13px]"><div>Total abonado: <b>{fmt(h.abono)}</b></div><div className="text-[16px] font-extrabold">Saldo pendiente: {fmt(holdBal(it.price, h))}</div></div>
        <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-[12px] font-semibold tracking-wide text-gray-700">{inWords(h.abono)} (total abonado)</p>
        <p className="mt-3 text-[11.5px] text-gray-500">El equipo queda separado hasta la fecha de vencimiento. Pasada la fecha sin completar el pago, el apartado se libera según la política del establecimiento.</p>
      </ReceiptFrame>
    </>
  );
}
