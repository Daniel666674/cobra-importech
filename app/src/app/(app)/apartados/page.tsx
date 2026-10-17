import Link from "next/link";
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, holdHistory, items } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { holdBal, holdLeft } from "@/lib/hold";
import { uname } from "@/lib/items";
import { requireMe } from "@/server/session";
import { waLink } from "@/lib/whatsapp";
import { HoldActions } from "./hold-actions";

export default async function Apartados() {
  await requireMe("credit");
  const db = await getDb();
  const [its, cl, hist] = await Promise.all([
    db.select().from(items).where(isNotNull(items.hold)),
    db.select().from(clients),
    db.select().from(holdHistory).orderBy(desc(holdHistory.t)).limit(15),
  ]);
  const cn = new Map(cl.map((c) => [c.id, c]));
  const rows = its.filter((i) => i.hold).sort((a, b) => a.hold!.expires - b.hold!.expires);
  void eq;
  return (
    <>
      <PageHeader title="Apartados" subtitle="Equipos separados con abono. Se cierran como venta o se liberan." actions={<Link className="btn primary" href="/venta?mode=apartado">🔒 Nuevo apartado</Link>} />
      {rows.length === 0 ? <div className="card"><Empty>No hay apartados activos.</Empty></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((it) => {
            const h = it.hold!;
            const left = holdLeft(h);
            const pct = Math.min(100, Math.round((h.abono / it.price) * 100));
            const c = cn.get(h.client);
            return (
              <div key={it.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><Link href={`/inventario/${it.id}`} className="font-semibold hover:underline">{uname(it)}</Link><div className="note">{h.no} · {c?.name ?? "—"}{c?.phone ? ` · ${c.phone}` : ""}</div></div>
                  <Chip tone={left < 0 ? "bad" : left <= 2 ? "warn" : "info"}>{left < 0 ? `Vencido hace ${-left} d` : left === 0 ? "Vence hoy" : `Vence en ${left} d`}</Chip>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-bg"><div className="h-full bg-accent" style={{ width: pct + "%" }} /></div>
                  <div className="mt-1.5 flex justify-between text-[13px]"><span>Abonado <b>{fmt(h.abono)}</b></span><span>Saldo <b>{fmt(holdBal(it.price, h))}</b> de {fmt(it.price)}</span></div>
                  <div className="note">{h.pays.length} abono(s) · vence {fdate(h.expires)}</div>
                </div>
                <HoldActions itemId={it.id} balance={holdBal(it.price, h)} />
                {c?.phone && <a className="btn sm" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, `Hola ${c.name.split(" ")[0]}, te recordamos que tu apartado ${h.no} (${uname(it)}) tiene un saldo de ${fmt(holdBal(it.price, h))} y vence el ${fdate(h.expires)}.`)}>💬 Recordar por WhatsApp</a>}
              </div>
            );
          })}
        </div>
      )}
      {hist.length > 0 && (
        <div className="card mt-5 overflow-x-auto">
          <h2 className="p-4 pb-2 font-semibold">Apartados cerrados</h2>
          <table className="t"><thead><tr><th>Fecha</th><th>Equipo</th><th>Cliente</th><th className="num">Abonado</th><th>Resultado</th></tr></thead>
            <tbody>{hist.map((h) => <tr key={h.id}><td>{fdate(h.t)}</td><td>{h.item}</td><td>{h.client}</td><td className="num">{fmt(h.abono)}</td><td>{h.outcome}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
