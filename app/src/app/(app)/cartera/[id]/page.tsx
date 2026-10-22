import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Empty, PageHeader, StatusChip } from "@/components/ui";
import { fdatey, fmt } from "@/lib/format";
import { ALLY_MODES, allyDetail } from "@/server/allies";
import { requireMe } from "@/server/session";
import { AllyForm, PayAlly, VoidPay } from "../ally-form";

export const dynamic = "force-dynamic";

export default async function Aliada({ params }: PageProps<"/cartera/[id]">) {
  const me = await requireMe("purchase");
  const d = await allyDetail(await getDb(), (await params).id);
  if (!d) notFound();
  const { ally: x, summary: s, moves, stock, sold } = d;
  return (
    <>
      <Link href="/cartera" className="note hover:underline">← Cartera</Link>
      <PageHeader title={x.name} subtitle={`${ALLY_MODES[x.mode as keyof typeof ALLY_MODES] ?? x.mode} · plazo ${x.terms ? x.terms + " días" : "de contado"}${x.bank ? " · " + x.bank : ""}`} actions={<Link className="btn primary" href={`/ingreso?ally=${x.id}`}>➕ Ingresar producto de esta tienda</Link>} />
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="card p-3"><span className="note block">Saldo por pagar</span><b className={`text-xl tabular-nums ${s.age.overdue ? "text-red-t" : s.balance > 0 ? "text-amber-t" : ""}`}>{fmt(s.balance)}</b>{s.age.overdue > 0 && <div className="note text-red-t">vencido {fmt(s.age.overdue)} · {s.age.oldest} días</div>}{s.advance > 0 && <div className="note text-green-t">anticipo a favor {fmt(s.advance)}</div>}</div>
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
          <div className="card p-4"><h2 className="font-semibold mb-1">Registrar pago o anticipo</h2><p className="note mb-3">Puedes registrar varios. Lo que pase del saldo queda como anticipo y se cruza solo con lo que se le deba después.</p><PayAlly id={x.id} balance={s.balance} advance={s.advance} /></div>
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">Movimientos de la cuenta</h2>
            <div className="grid grid-cols-4 gap-2 px-4 pb-2 text-center text-[11.5px]">{([["0–30", s.age.d0_30], ["31–60", s.age.d31_60], ["61–90", s.age.d61_90], ["+90", s.age.d90]] as const).map(([k, v]) => <div key={k} className="rounded-md bg-gray-bg p-1.5"><span className="note block">{k} días</span><b className={k === "+90" && v ? "text-red-t" : ""}>{fmt(v)}</b></div>)}</div>
            {moves.length === 0 ? <Empty>Sin movimientos.</Empty> : (
              <table className="t"><tbody>{moves.map((m) => (
                <tr key={m.id} className={m.voided ? "opacity-50 line-through" : ""}>
                  <td><span className="block">{m.kind === "pago" && m.no && <Link href={`/cartera/egreso/${m.id}`} className="font-semibold hover:underline">{m.no}</Link>} {m.detail}</span>
                    <span className="note">{fdatey(m.t)}{m.method ? ` · ${m.method}` : ""}{m.kind === "pago" && m.ref ? ` · ref. ${m.ref}` : m.kind !== "pago" && m.ref ? ` · ${m.ref}` : ""} · {m.by}</span>
                    {m.kind === "pago" && !m.voided && me.perms.includes("approve") && <VoidPay id={m.id} no={m.no} />}</td>
                  <td className={`num font-semibold ${m.kind === "pago" ? "text-green-t" : m.amount < 0 ? "text-red-t" : ""}`}>{m.kind === "pago" ? "−" : m.amount < 0 ? "−" : "+"}{fmt(Math.abs(m.amount))}</td></tr>
              ))}</tbody></table>
            )}
          </div>
          <div className="card p-4"><h2 className="font-semibold mb-3">Datos de la tienda</h2><AllyForm id={x.id} initial={{ name: x.name, contact: x.contact, phone: x.phone, doc: x.doc, mode: x.mode, notes: x.notes, active: x.active, terms: String(x.terms), bank: x.bank }} /></div>
        </div>
      </div>
    </>
  );
}
