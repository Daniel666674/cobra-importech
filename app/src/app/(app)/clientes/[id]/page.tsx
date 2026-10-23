import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { clients, items } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fdt, fmt } from "@/lib/format";
import { holdBal } from "@/lib/hold";
import { saleNet, saleVoid } from "@/lib/sales";
import { listSales } from "@/server/sales";
import { requireMe } from "@/server/session";
import { EditClient } from "./edit-client";

export default async function ClienteDetalle({ params }: PageProps<"/clientes/[id]">) {
  await requireMe("clients");
  const { id } = await params;
  const db = await getDb();
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  if (!c) notFound();
  const [all, its] = await Promise.all([listSales(db), db.select().from(items)]);
  const mine = all.filter((s) => s.client === id);
  const valid = mine.filter((s) => !saleVoid(s));
  const total = valid.reduce((a, s) => a + saleNet(s), 0);
  const last = valid.reduce((a, s) => Math.max(a, s.t), 0);
  const holds = its.filter((i) => i.hold?.client === id);
  return (
    <>
      <div className="mb-3"><Link href="/clientes" className="note hover:underline">← Clientes</Link></div>
      <PageHeader title={c.name} subtitle={[c.doc, c.phone, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"} actions={<EditClient id={c.id} init={{ name: c.name, doc: c.doc, phone: c.phone, email: c.email, notes: c.notes }} />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="note">Total comprado</div><div className="text-xl font-bold">{fmt(total)}</div></div>
        <div className="card p-4"><div className="note">Compras</div><div className="text-xl font-bold">{valid.length}</div></div>
        <div className="card p-4"><div className="note">Última compra</div><div className="text-xl font-bold">{last ? fdate(last) : "—"}</div></div>
      </div>
      {c.notes && <div className="card mb-4 p-3 text-[13px]"><b>Notas:</b> {c.notes}</div>}
      {holds.length > 0 && (
        <div className="card mb-4 overflow-x-auto">
          <h2 className="px-4 pt-3 font-semibold">Apartados activos</h2>
          <table className="t"><thead><tr><th>Recibo</th><th>Equipo</th><th>Vence</th><th className="num">Abonado</th><th className="num">Saldo</th></tr></thead>
            <tbody>{holds.map((i) => i.hold && (
              <tr key={i.id}><td><Link href={`/apartados/${i.id}`} className="font-semibold hover:underline">{i.hold.no}</Link></td><td>{i.name}<div className="note">{i.serial}</div></td><td>{fdate(i.hold.expires)}</td><td className="num">{fmt(i.hold.abono)}</td><td className="num"><b>{fmt(holdBal(i.price, i.hold))}</b></td></tr>))}</tbody></table>
        </div>
      )}
      <div className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Historial de compras</h2>
        {mine.length === 0 ? <Empty>Este cliente aún no tiene compras.</Empty> : (
          <table className="t"><thead><tr><th>Comprobante</th><th>Productos</th><th>Pago</th><th className="num">Total</th></tr></thead>
            <tbody>{mine.map((s) => (
              <tr key={s.id} className="hover:bg-gray-bg/60">
                <td><Link href={`/ventas/${s.id}`} className="font-semibold hover:underline">{s.no}</Link><div className="note">{fdt(s.t)}</div></td>
                <td className="max-w-[320px]"><span className="line-clamp-2">{s.lines.map((l) => (l.qty > 1 ? `${l.qty}× ` : "") + l.name).join(", ")}</span></td>
                <td>{s.method}</td>
                <td className="num"><b>{fmt(saleNet(s))}</b> {saleVoid(s) && <Chip tone="bad">Devuelta</Chip>}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
