import Link from "next/link";
import { getDb } from "@/db";
import { clients, items, sales } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { saleNet, saleVoid } from "@/lib/sales";
import { requireMe } from "@/server/session";
import { ClientForm } from "./client-form";

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  await requireMe("clients");
  const sp = await searchParams;
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").toLowerCase().trim();
  const db = await getDb();
  const [cl, ss, its] = await Promise.all([db.select().from(clients), db.select().from(sales), db.select().from(items)]);
  const rows = cl.filter((c) => !q || `${c.name} ${c.doc} ${c.phone} ${c.email} ${c.address}`.toLowerCase().includes(q)).map((c) => {
    const mine = ss.filter((s) => s.client === c.id && !saleVoid(s));
    return { c, n: mine.length, total: mine.reduce((a, s) => a + saleNet(s), 0), last: mine.reduce((a, s) => Math.max(a, s.t), 0), holds: its.filter((i) => i.hold?.client === c.id).length };
  }).sort((a, b) => b.total - a.total);
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${cl.length} registrados`} actions={<ClientForm />} />
      <form className="card mb-4 p-3" action="/clientes"><input name="q" defaultValue={q} placeholder="Buscar por nombre, documento, celular o correo" aria-label="Buscar" /></form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>Aún no hay clientes. Se crean al vender o con el botón «Nuevo cliente».</Empty> : (
          <table className="t"><thead><tr><th>Cliente</th><th>Contacto</th><th className="num">Compras</th><th className="num">Total comprado</th><th>Última compra</th></tr></thead>
            <tbody>{rows.map(({ c, n, total, last, holds }) => (
              <tr key={c.id} className="hover:bg-gray-bg/60"><td><Link href={`/clientes/${c.id}`} className="font-bold hover:underline">{c.name}</Link><div className="note">{c.doc}{holds ? ` · ${holds} apartado(s)` : ""}</div></td><td>{c.phone}<div className="note">{c.email}</div></td><td className="num">{n}</td><td className="num"><b>{fmt(total)}</b></td><td>{last ? fdate(last) : "—"}</td></tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
