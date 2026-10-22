import Link from "next/link";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdatey, fmt } from "@/lib/format";
import { allySummary } from "@/server/allies";
import { requireMe } from "@/server/session";
import { AllyForm } from "./ally-form";

export const dynamic = "force-dynamic";

const plazo = (d: number) => (d ? `${d} días` : "Contado");

/** Cartera con las tiendas aliadas: lo que se les debe por edades, lo vencido y los anticipos. */
export default async function Cartera() {
  await requireMe("purchase");
  const list = await allySummary(await getDb());
  const sum = (f: (x: (typeof list)[number]) => number) => list.reduce((s, x) => s + f(x), 0);
  return (
    <>
      <PageHeader title="Cartera" subtitle="Cuentas con las tiendas aliadas: saldos, vencimientos, abonos y anticipos" />
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="card p-3"><span className="note block">Total por pagar</span><b className="text-xl tabular-nums">{fmt(sum((x) => x.balance))}</b></div>
        <div className="card p-3"><span className="note block">Vencido</span><b className={`text-xl tabular-nums ${sum((x) => x.age.overdue) ? "text-red-t" : ""}`}>{fmt(sum((x) => x.age.overdue))}</b></div>
        <div className="card p-3"><span className="note block">Anticipos (saldo a favor)</span><b className="text-xl tabular-nums text-green-t">{fmt(sum((x) => x.advance))}</b></div>
        <div className="card p-3"><span className="note block">Pagado este mes</span><b className="text-xl tabular-nums">{fmt(sum((x) => x.paidMonth))}</b></div>
      </div>
      <div className="card mb-4 overflow-x-auto">
        {list.length === 0 ? <Empty>Aún no hay tiendas aliadas. Crea la primera abajo.</Empty> : (
          <table className="t">
            <thead><tr><th>Tienda</th><th>Plazo</th><th className="num">0–30 días</th><th className="num">31–60</th><th className="num">61–90</th><th className="num">+90</th><th className="num">Saldo</th><th className="num">Anticipo</th><th>Último pago</th></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id}>
                <td><Link className="font-semibold hover:underline" href={`/cartera/${x.id}`}>{x.name}</Link>{!x.active && <Chip>Inactiva</Chip>}<div className="note">{x.mode === "compra" ? "Compra" : "Consignación"}{x.phone ? ` · ${x.phone}` : ""}</div></td>
                <td className="note">{plazo(x.terms)}</td>
                <td className="num">{x.age.d0_30 ? fmt(x.age.d0_30) : "—"}</td>
                <td className="num">{x.age.d31_60 ? fmt(x.age.d31_60) : "—"}</td>
                <td className="num">{x.age.d61_90 ? fmt(x.age.d61_90) : "—"}</td>
                <td className="num">{x.age.d90 ? <b className="text-red-t">{fmt(x.age.d90)}</b> : "—"}</td>
                <td className="num"><b className={x.age.overdue ? "text-red-t" : x.balance ? "text-amber-t" : ""}>{fmt(x.balance)}</b>{x.age.overdue > 0 && <div className="note text-red-t">vencido {fmt(x.age.overdue)}</div>}</td>
                <td className="num">{x.advance ? <b className="text-green-t">{fmt(x.advance)}</b> : "—"}</td>
                <td className="note">{x.lastPay ? fdatey(x.lastPay) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="card p-4"><h2 className="font-semibold mb-3">Nueva tienda aliada</h2><AllyForm /></div>
    </>
  );
}
