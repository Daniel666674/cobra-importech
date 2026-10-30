import Link from "next/link";
import { desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, items, orders, technicians } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { enabledMethods } from "@/lib/catalog";
import { fdate, fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { ORDER_FLOW, orderCost, orderPrice } from "@/server/ops";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { settings } from "@/db/schema";
import { Board, type Card } from "./board";

export const dynamic = "force-dynamic";

export default async function Taller({ searchParams }: PageProps<"/taller">) {
  const me = await requireMe("workshop");
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "historial" ? "historial" : "tablero";
  const db = await getDb();
  const canCost = hasPerm(me, "cost_view");
  const tabs = (
    <div className="mb-4 flex gap-2">
      <Link href="/taller" className={`btn ${tab === "tablero" ? "primary" : ""}`}>🔧 Tablero</Link>
      <Link href="/taller?tab=historial" className={`btn ${tab === "historial" ? "primary" : ""}`}>🗂️ Historial</Link>
    </div>
  );
  if (tab === "historial") {
    const done = await db.select().from(orders).where(ne(orders.outcome, "")).orderBy(desc(orders.doneT)).limit(300);
    const ids = done.map((o) => o.item).filter(Boolean) as string[];
    const [its, cl] = await Promise.all([ids.length ? db.select().from(items).where(inArray(items.id, ids)) : [], db.select().from(clients)]);
    const im = new Map(its.map((i) => [i.id, i])), cm = new Map(cl.map((c) => [c.id, c]));
    return (
      <>
        <PageHeader title="Taller" subtitle={`Historial · ${done.length} ticket${done.length !== 1 ? "s" : ""} entregados o cancelados`} actions={<Link className="btn" href="/inventario">📦 Ir a inventario</Link>} />
        {tabs}
        <div className="card overflow-x-auto">
          {done.length === 0 ? <Empty>Aún no hay tickets terminados.</Empty> : (
            <table className="t"><thead><tr><th>Ticket</th><th>Equipo</th><th>Trabajos</th><th>Técnico</th>{canCost && <th className="num">Costo</th>}<th className="num">Cobro</th><th>Resultado</th></tr></thead>
              <tbody>{done.map((o) => {
                const it = o.item ? im.get(o.item) : undefined;
                return (
                  <tr key={o.id}>
                    <td><b>{o.id}</b><div className="note">{fdate(o.t)} → {fdate(o.doneT)}</div></td>
                    <td>{it ? <Link className="hover:underline" href={`/inventario/${it.id}`}>{uname(it)}</Link> : o.device}{o.client && <div className="note">{cm.get(o.client)?.name}</div>}</td>
                    <td>{[o.job, ...o.extras.map((x) => x.job)].join(" + ")}</td>
                    <td>{o.tech || "—"}{canCost && o.techFee > 0 && o.outcome === "entregada" && <div className="note">{fmt(o.techFee)}</div>}</td>
                    {canCost && <td className="num">{fmt(orderCost(o))}</td>}
                    <td className="num">{o.item ? <span className="note">Inventario</span> : fmt(orderPrice(o))}</td>
                    <td>{o.outcome === "entregada" ? <Chip tone="ok">Entregada</Chip> : <Chip tone="bad">Cancelada</Chip>}</td>
                  </tr>);
              })}</tbody></table>
          )}
        </div>
      </>
    );
  }
  const [os, ts, cl, [cfg]] = await Promise.all([db.select().from(orders).where(eq(orders.outcome, "")), db.select().from(technicians).where(eq(technicians.active, true)), db.select().from(clients), db.select().from(settings).limit(1)]);
  const ids = os.map((o) => o.item).filter(Boolean) as string[];
  const its = new Map((ids.length ? await db.select().from(items).where(inArray(items.id, ids)) : []).map((i) => [i.id, i]));
  const cm = new Map(cl.map((c) => [c.id, c]));
  const cards: Card[] = os.map((o) => {
    const it = o.item ? its.get(o.item) : undefined;
    const c = o.client ? cm.get(o.client) : undefined;
    return {
      id: o.id, st: o.st, job: o.job, tech: o.tech, notes: o.notes, cost: o.cost, t: o.t, stT: o.stT || o.t,
      price: o.price, techFee: canCost ? o.techFee : 0, extras: o.extras.map((x) => (canCost ? x : { ...x, cost: 0 })), device: o.device, serial: o.serial,
      client: c ? { id: c.id, name: c.name, phone: c.phone } : null,
      item: it ? { id: it.id, name: uname(it), serial: it.serial, price: it.price, base: canCost ? it.cost + it.repairs : null } : null,
    };
  });
  return (
    <>
      <PageHeader title="Taller" subtitle="Arrastra cada orden a su etapa. Para un equipo del inventario, abre su ficha → «Enviar a taller»; para un cliente, crea un ticket aquí." actions={<Link className="btn" href="/inventario">📦 Ir a inventario</Link>} />
      {tabs}
      <Board stages={[...ORDER_FLOW]} cards={cards} canCost={canCost} techs={ts.map((t) => t.name)} clients={[...cl].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))} methods={["Efectivo", ...enabledMethods(cfg).filter((m) => m !== "Efectivo")]} />
    </>
  );
}
