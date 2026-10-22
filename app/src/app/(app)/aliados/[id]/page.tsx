import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Empty, PageHeader, StatusChip } from "@/components/ui";
import { fdatey, fmt } from "@/lib/format";
import { ALLY_MODES, allyDetail } from "@/server/allies";
import { requireMe } from "@/server/session";
import { AllyForm, PayAlly } from "../ally-form";

export default async function Aliada({ params }: PageProps<"/aliados/[id]">) {
  await requireMe("purchase");
  const d = await allyDetail(await getDb(), (await params).id);
  if (!d) notFound();
  const { ally: x, summary: s, moves, stock, sold } = d;
  return (
    <>
      <Link href="/aliados" className="note hover:underline">← Tiendas aliadas</Link>
      <PageHeader title={x.name} subtitle={ALLY_MODES[x.mode as keyof typeof ALLY_MODES] ?? x.mode} actions={<Link className="btn primary" href={`/ingreso?ally=${x.id}`}>➕ Ingresar producto de esta tienda</Link>} />
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="card p-3"><span className="note block">Saldo por pagar</span><b className={`text-xl tabular-nums ${s.balance > 0 ? "text-amber-t" : ""}`}>{fmt(s.balance)}</b></div>
        <div className="card p-3"><span className="note block">Ya pagado</span><b className="text-xl tabular-nums">{fmt(s.paid)}</b></div>
        <div className="card p-3"><span className="note block">Vendido ({s.soldUnits} uds.)</span><b className="text-xl tabular-nums">{fmt(s.revenue)}</b></div>
        <div className="card p-3"><span className="note block">Ganancia de la tienda</span><b className="text-xl tabular-nums text-green-t">{fmt(s.earned)}</b>{s.revenue > 0 && <span className="note"> · {Math.round((s.earned / s.revenue) * 100)}%</span>}</div>
        <div className="card p-3"><span className="note block">En vitrina ({s.stockUnits} uds.)</span><b className="text-xl tabular-nums">{fmt(s.stockPrice)}</b><div className="note">costo {fmt(s.stockCost)} · ganancia esperada {fmt(s.stockPrice - s.stockCost)}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">Vendidos</h2>
            {sold.length === 0 ? <Empty>Todavía no se ha vendido nada de esta tienda.</Empty> : (
              <table className="t"><thead><tr><th>Producto</th><th>Venta</th><th className="num">Cobrado</th><th className="num">Se le paga</th><th className="num">Ganancia</th></tr></thead>
                <tbody>{sold.map((l, i) => (
                  <tr key={i}><td><b>{l.qty > 1 ? `${l.qty}× ` : ""}{l.name}</b>{l.serial && <div className="note mono">{l.serial}</div>}</td>
                    <td><Link className="hover:underline" href={`/ventas/${l.sale}`}>{l.no}</Link><div className="note">{fdatey(l.t)}</div></td>
                    <td className="num">{fmt(l.revenue)}</td><td className="num">{fmt(l.cost)}</td><td className="num text-green-t font-semibold">{fmt(l.revenue - l.cost)}</td></tr>
                ))}</tbody></table>
            )}
          </div>
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">En vitrina</h2>
            {stock.length === 0 ? <Empty>No hay productos de esta tienda en vitrina.</Empty> : (
              <table className="t"><thead><tr><th>Producto</th><th>Estado</th><th className="num">Se le paga</th><th className="num">Precio</th><th className="num">Ganancia esperada</th></tr></thead>
                <tbody>{stock.map((i) => (
                  <tr key={i.id}><td><Link className="font-semibold hover:underline" href={`/inventario/${i.id}`}>{i.qty > 1 ? `${i.qty}× ` : ""}{i.name}</Link><div className="note">desde {fdatey(i.acq)}</div></td>
                    <td><StatusChip status={i.status} /></td><td className="num">{fmt(i.cost * i.qty)}</td><td className="num">{fmt(i.price * i.qty)}</td><td className="num">{fmt((i.price - i.cost) * i.qty)}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4"><h2 className="font-semibold mb-3">Registrar pago</h2><PayAlly id={x.id} balance={s.balance} /></div>
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">Cuenta</h2>
            {moves.length === 0 ? <Empty>Sin movimientos.</Empty> : (
              <table className="t"><tbody>{moves.map((m) => (
                <tr key={m.id}><td><span className="block">{m.detail}</span><span className="note">{fdatey(m.t)} · {m.ref || m.by}</span></td>
                  <td className={`num font-semibold ${m.kind === "pago" ? "text-green-t" : m.amount < 0 ? "text-red-t" : ""}`}>{m.kind === "pago" ? "−" : m.amount < 0 ? "−" : "+"}{fmt(Math.abs(m.amount))}</td></tr>
              ))}</tbody></table>
            )}
          </div>
          <div className="card p-4"><h2 className="font-semibold mb-3">Datos de la tienda</h2><AllyForm id={x.id} initial={{ name: x.name, contact: x.contact, phone: x.phone, doc: x.doc, mode: x.mode, notes: x.notes, active: x.active }} /></div>
        </div>
      </div>
    </>
  );
}
