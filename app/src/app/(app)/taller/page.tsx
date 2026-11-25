import { filtersToQuery, ymdStart } from "@/lib/sale-filters";
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
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const tec = one("tec"), res = one("res"), desde = /^\d{4}-\d{2}-\d{2}$/.test(one("desde")) ? one("desde") : "", hasta = /^\d{4}-\d{2}-\d{2}$/.test(one("hasta")) ? one("hasta") : "";
  const db = await getDb();
  const canCost = hasPerm(me, "cost_view");
  const tabs = (
    <div className="mb-4 flex gap-2">
      <Link href="/taller" className={`btn ${tab === "tablero" ? "primary" : ""}`}>🔧 Tablero</Link>
      <Link href="/taller?tab=historial" className={`btn ${tab === "historial" ? "primary" : ""}`}>🗂️ Historial</Link>
    </div>
  );
  if (tab === "historial") {
    const doneAll = await db.select().from(orders).where(ne(orders.outcome, "")).orderBy(desc(orders.doneT)).limit(1000);
    const techs = [...new Set(doneAll.map((o) => o.tech).filter(Boolean))].sort();
    const from = desde ? ymdStart(desde) : null, to = hasta ? ymdStart(hasta) : null;
    const done = doneAll.filter((o) => (!tec || o.tech === tec) && (!res || o.outcome === res) && (from == null || o.doneT >= from) && (to == null || o.doneT < to + 86400_000)).slice(0, 300);
    const tq = (p: Record<string, string>) => `/taller?${filtersToQuery({ tab: "historial", tec, res, desde, hasta } as never, p)}`;
    const ids = done.map((o) => o.item).filter(Boolean) as string[];
    const [its, cl] = await Promise.all([ids.length ? db.select().from(items).where(inArray(items.id, ids)) : [], db.select().from(clients)]);
    const im = new Map(its.map((i) => [i.id, i])), cm = new Map(cl.map((c) => [c.id, c]));
    return (
      <>
        <PageHeader title="Taller" subtitle={`Historial · ${done.length} ticket${done.length !== 1 ? "s" : ""} entregados o cancelados`} actions={<Link className="btn" href="/inventario">📦 Ir a inventario</Link>} />
        {tabs}
        <div className="card mb-3 space-y-2 p-3">
          <form action="/taller" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="tab" value="historial" />
            <label className="text-[12px]"><span className="lb">Técnico</span><select name="tec" defaultValue={tec}><option value="">Todos</option>{techs.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-[12px]"><span className="lb">Resultado</span><select name="res" defaultValue={res}><option value="">Todos</option><option value="entregada">Entregadas</option><option value="cancelada">Canceladas</option></select></label>
            <label className="text-[12px]"><span className="lb">Desde</span><input type="date" name="desde" defaultValue={desde} /></label>
            <label className="text-[12px]"><span className="lb">Hasta</span><input type="date" name="hasta" defaultValue={hasta} /></label>
            <div className="flex items-end gap-2"><button className="btn primary">Aplicar</button>{(tec || res || desde || hasta) && <Link className="btn" href="/taller?tab=historial">Quitar</Link>}</div>
          </form>
          <p className="note">{done.length} ticket{done.length !== 1 ? "s" : ""}{canCost ? ` · costo ${fmt(done.reduce((a, o) => a + orderCost(o), 0))}` : ""} · cobrado a clientes {fmt(done.filter((o) => !o.item && o.outcome === "entregada").reduce((a, o) => a + orderPrice(o), 0))}</p>
        </div>
        <div className="card overflow-x-auto">
          {done.length === 0 ? <Empty>Aún no hay tickets terminados.</Empty> : (
            <table className="t"><thead><tr><th>Ticket</th><th>Equipo</th><th>Trabajos</th><th>Técnico</th>{canCost && <th className="num">Costo</th>}<th className="num">Cobro</th><th>Resultado</th></tr></thead>
              <tbody>{done.map((o) => {
                const it = o.item ? im.get(o.item) : undefined;
                return (
                  <tr key={o.id}>
                    <td><b>{o.id}</b><div className="note">{fdate(o.t)} → {fdate(o.doneT)}</div></td>
                    <td>{it ? <Link className="hover:underline" href={`/inventario/${it.id}`}>{uname(it)}</Link> : o.device}{o.client && <div className="note"><Link className="hover:underline" href={`/clientes/${o.client}`}>{cm.get(o.client)?.name}</Link></div>}</td>
                    <td>{[o.job, ...o.extras.map((x) => x.job)].join(" + ")}</td>
                    <td>{o.tech ? <Link className="hover:underline" href={tq({ tec: o.tech })}>{o.tech}</Link> : "—"}{canCost && o.techFee > 0 && o.outcome === "entregada" && <div className="note">{fmt(o.techFee)}</div>}</td>
                    {canCost && <td className="num">{fmt(orderCost(o))}</td>}
                    <td className="num">{o.item ? <span className="note">Inventario</span> : fmt(orderPrice(o))}</td>
                    <td><Link href={tq({ res: o.outcome })}>{o.outcome === "entregada" ? <Chip tone="ok">Entregada</Chip> : <Chip tone="bad">Cancelada</Chip>}</Link></td>
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
  const cards: Card[] = os.filter((o) => !tec || o.tech === tec).map((o) => {
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
      <div className="mb-3 flex flex-wrap items-center gap-1.5"><span className="note">Técnico:</span><Link href="/taller" className={`btn sm ${!tec ? "primary" : ""}`}>Todos · {os.length}</Link>{[...new Set(os.map((o) => o.tech).filter(Boolean))].sort().map((t) => <Link key={t} href={`/taller?tec=${encodeURIComponent(t)}`} className={`btn sm ${tec === t ? "primary" : ""}`}>{t} · {os.filter((o) => o.tech === t).length}</Link>)}</div>
      <Board stages={[...ORDER_FLOW]} cards={cards} canCost={canCost} techs={ts.map((t) => t.name)} clients={[...cl].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))} methods={["Efectivo", ...enabledMethods(cfg).filter((m) => m !== "Efectivo")]} />
    </>
  );
}
