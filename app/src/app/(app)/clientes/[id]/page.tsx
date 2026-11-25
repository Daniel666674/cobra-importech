import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { claims, clients, feed, items } from "@/db/schema";
import { Chip, Empty, FeedText, PageHeader } from "@/components/ui";
import { fdate, fdt, fmt } from "@/lib/format";
import { holdBal } from "@/lib/hold";
import { lineNet, saleNet, saleVoid, warrEnd } from "@/lib/sales";
import { hasPerm } from "@/server/auth";
import { listSales } from "@/server/sales";
import { requireMe } from "@/server/session";
import { EditClient } from "./edit-client";

export default async function ClienteDetalle({ params }: PageProps<"/clientes/[id]">) {
  const me = await requireMe("clients");
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
  const pendingTotal = valid.reduce((a, s) => a + s.pending, 0);
  const now = Date.now();
  const warrs = valid.flatMap((s) => s.lines.map((l) => ({ s, l })).filter(({ l }) => lineNet(l) > 0 && l.warr > 0 && warrEnd(s.t, l) > now));
  const trades = mine.flatMap((s) => (s.tradeins ?? []).map((t) => ({ s, t })));
  const myClaims = (await db.select().from(claims)).filter((cl) => mine.some((s) => s.id === cl.sale));
  const trail = hasPerm(me, "reports") ? await db.select().from(feed).where(or(ilike(feed.x, `%${c.name.replace(/[%_]/g, "")}%`), ...mine.slice(0, 30).map((s) => ilike(feed.x, `%${s.no.replace(/[%_]/g, "")}%`)))).orderBy(desc(feed.t)).limit(40) : [];
  return (
    <>
      <div className="mb-3"><Link href="/clientes" className="note hover:underline">← Clientes</Link></div>
      <PageHeader title={c.name} subtitle={[c.doc, c.phone, c.address, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"} actions={<EditClient id={c.id} init={{ name: c.name, doc: c.doc, phone: c.phone, address: c.address, email: c.email, notes: c.notes }} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card p-4"><div className="note">Total comprado</div><div className="text-xl font-bold">{fmt(total)}</div></div>
        <div className="card p-4"><div className="note">Compras</div><div className="text-xl font-bold">{valid.length}</div><div className="note">ticket {fmt(valid.length ? total / valid.length : 0)}</div></div>
        <div className="card p-4"><div className="note">Última compra</div><div className="text-xl font-bold">{last ? fdate(last) : "—"}</div></div>
        <Link href={pendingTotal ? `/ventas?cliente=${id}&estado=pendiente` : "/cobrar"} className="card block p-4 hover:border-accent"><div className="note">Saldo por cobrar</div><div className={`text-xl font-bold ${pendingTotal ? "text-red-t" : ""}`}>{fmt(pendingTotal)}</div></Link>
        <div className="card p-4"><div className="note">Garantías vigentes</div><div className="text-xl font-bold">{warrs.length}</div></div>
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
      {warrs.length > 0 && (
        <div className="card mb-4 p-4"><h2 className="mb-2 font-semibold">Garantías vigentes</h2>
          <ul className="space-y-1 text-[13px]">{warrs.map(({ s, l }, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span>{l.item ? <Link href={`/inventario/${l.item}`} className="hover:underline">{l.name}</Link> : l.name} <span className="note">· {l.serial ? "••" + l.serial.slice(-6) : "sin serie"} · <Link href={`/ventas/${s.id}`} className="hover:underline">{s.no}</Link></span></span><span className="note">hasta {fdate(warrEnd(s.t, l))}</span></li>)}</ul></div>
      )}
      {(trades.length > 0 || myClaims.length > 0) && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {trades.length > 0 && <div className="card p-4"><h2 className="mb-2 font-semibold">Equipos que entregó como retoma</h2><ul className="space-y-1 text-[13px]">{trades.map(({ s, t }) => <li key={t.item} className="flex justify-between gap-2"><Link href={`/inventario/${t.item}`} className="hover:underline">{t.name} · {t.cond}</Link><span className="note">{fmt(t.amount)} · {s.no}</span></li>)}</ul></div>}
          {myClaims.length > 0 && <div className="card p-4"><h2 className="mb-2 font-semibold">Reclamos de garantía</h2><ul className="space-y-1 text-[13px]">{myClaims.map((cl) => <li key={cl.id} className="flex justify-between gap-2"><Link href="/garantias" className="hover:underline">{cl.id} · {cl.note.slice(0, 50)}</Link><Chip tone={cl.status === "Resuelto" ? "ok" : "warn"}>{cl.status}</Chip></li>)}</ul></div>}
        </div>
      )}
      <div className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Historial de compras</h2>
        {mine.length === 0 ? <Empty>Este cliente aún no tiene compras.</Empty> : (
          <table className="t"><thead><tr><th>Comprobante</th><th>Productos</th><th>Pago</th><th className="num">Total</th></tr></thead>
            <tbody>{mine.map((s) => (
              <tr key={s.id} className="hover:bg-gray-bg/60">
                <td><Link href={`/ventas/${s.id}`} className="font-semibold hover:underline">{s.no}</Link><div className="note">{fdt(s.t)}</div></td>
                <td className="max-w-[320px]"><span className="line-clamp-2">{s.lines.map((l, i) => <span key={i}>{i > 0 && ", "}{l.item ? <Link href={`/inventario/${l.item}`} className="hover:underline">{(l.qty > 1 ? `${l.qty}× ` : "") + l.name}</Link> : (l.qty > 1 ? `${l.qty}× ` : "") + l.name}</span>)}</span></td>
                <td>{s.method}</td>
                <td className="num"><b>{fmt(saleNet(s))}</b> {saleVoid(s) && <Chip tone="bad">Devuelta</Chip>}</td>
              </tr>))}</tbody></table>
        )}
      </div>
      {trail.length > 0 && (
        <div className="card mt-4 p-4"><h2 className="mb-2 font-semibold">📜 Historial de movimientos</h2>
          <ul className="space-y-1.5 text-[13px]">{trail.map((f) => <li key={f.id} className="flex gap-2"><span>{f.ic}</span><span className="flex-1"><FeedText text={f.x} /><span className="note block">{fdt(f.t)} · {f.by}</span></span></li>)}</ul></div>
      )}
    </>
  );
}
