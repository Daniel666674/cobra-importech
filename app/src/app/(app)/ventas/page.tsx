import Link from "next/link";
import { getDb } from "@/db";
import { clients, users } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdt, fmt } from "@/lib/format";
import { saleNet, saleVoid } from "@/lib/sales";
import { listSales } from "@/server/sales";
import { requireMe } from "@/server/session";

export default async function Ventas({ searchParams }: PageProps<"/ventas">) {
  await requireMe("sell");
  const sp = await searchParams;
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").toLowerCase().trim();
  const db = await getDb();
  const [all, cl, us] = await Promise.all([listSales(db), db.select().from(clients), db.select().from(users)]);
  const cn = new Map(cl.map((c) => [c.id, c.name]));
  const un = new Map(us.map((u) => [u.id, u.name]));
  const rows = all.filter((s) => !q || `${s.no} ${cn.get(s.client ?? "") ?? ""} ${s.lines.map((l) => l.name + l.serial).join(" ")}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader title="Ventas" subtitle={`${rows.length} comprobantes`} actions={<Link className="btn primary" href="/venta">🧾 Nueva venta</Link>} />
      <form className="card mb-4 p-3" action="/ventas"><input name="q" defaultValue={q} placeholder="Buscar por número, cliente, producto o IMEI" aria-label="Buscar" /></form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>Sin ventas.</Empty> : (
          <table className="t">
            <thead><tr><th>Comprobante</th><th>Cliente</th><th>Productos</th><th>Pago</th><th>Atendió</th><th className="num">Total</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-bg/60">
                  <td><Link href={`/ventas/${s.id}`} className="font-semibold hover:underline">{s.no}</Link><div className="note">{fdt(s.t)}</div></td>
                  <td>{cn.get(s.client ?? "") ?? <span className="note">Mostrador</span>}</td>
                  <td className="max-w-[320px]"><span className="line-clamp-2">{s.lines.map((l) => (l.qty > 1 ? `${l.qty}× ` : "") + l.name).join(", ")}</span></td>
                  <td>{s.method}</td>
                  <td>{(un.get(s.by) ?? "—").split(" ")[0]}</td>
                  <td className="num"><b>{fmt(saleNet(s))}</b> {saleVoid(s) && <Chip tone="bad">Devuelta</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
