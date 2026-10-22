import Link from "next/link";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fmt } from "@/lib/format";
import { allySummary } from "@/server/allies";
import { requireMe } from "@/server/session";
import { AllyForm } from "./ally-form";

export default async function Aliados() {
  await requireMe("purchase");
  const list = await allySummary(await getDb());
  const tot = (k: "balance" | "revenue" | "cost" | "earned" | "stockCost") => list.reduce((s, x) => s + x[k], 0);
  return (
    <>
      <PageHeader title="Tiendas aliadas" subtitle="Productos de otras tiendas: cuánto se les paga y cuánto gana la tienda" />
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="card p-3"><span className="note block">Por pagar a aliadas</span><b className="text-xl tabular-nums">{fmt(tot("balance"))}</b></div>
        <div className="card p-3"><span className="note block">Vendido de aliadas</span><b className="text-xl tabular-nums">{fmt(tot("revenue"))}</b></div>
        <div className="card p-3"><span className="note block">Les corresponde (costo)</span><b className="text-xl tabular-nums">{fmt(tot("cost"))}</b></div>
        <div className="card p-3"><span className="note block">Ganancia de la tienda</span><b className="text-xl tabular-nums text-green-t">{fmt(tot("earned"))}</b></div>
      </div>
      <div className="card mb-4 overflow-x-auto">
        {list.length === 0 ? <Empty>Aún no hay tiendas aliadas. Crea la primera abajo.</Empty> : (
          <table className="t">
            <thead><tr><th>Tienda</th><th>Modalidad</th><th className="num">En vitrina</th><th className="num">Vendidos</th><th className="num">Vendido</th><th className="num">Se les paga</th><th className="num">Ganancia</th><th className="num">Saldo por pagar</th></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id}>
                <td><Link className="font-semibold hover:underline" href={`/aliados/${x.id}`}>{x.name}</Link>{!x.active && <Chip>Inactiva</Chip>}<div className="note">{[x.contact, x.phone].filter(Boolean).join(" · ")}</div></td>
                <td className="note">{x.mode === "compra" ? "Compra" : "Consignación"}</td>
                <td className="num">{x.stockUnits}<div className="note">{fmt(x.stockCost)}</div></td>
                <td className="num">{x.soldUnits}</td>
                <td className="num">{fmt(x.revenue)}</td>
                <td className="num">{fmt(x.cost)}</td>
                <td className="num text-green-t font-semibold">{fmt(x.earned)}{x.revenue > 0 && <div className="note">{Math.round((x.earned / x.revenue) * 100)}%</div>}</td>
                <td className="num"><b className={x.balance > 0 ? "text-amber-t" : ""}>{fmt(x.balance)}</b></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="card p-4"><h2 className="font-semibold mb-3">Nueva tienda aliada</h2><AllyForm /></div>
    </>
  );
}
