import Link from "next/link";
import { getDb } from "@/db";
import { clients, settings } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { enabledMethods } from "@/lib/catalog";
import { daysAgo, fdatey, fmt } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { receivables } from "@/server/caja";
import { requireMe } from "@/server/session";
import { PayPending } from "./pay-pending";

export const dynamic = "force-dynamic";

/** Ventas que quedaron con saldo sin cobrar: cuánto falta, desde cuándo y quién debe. */
export default async function PorCobrar() {
  await requireMe("sell");
  const db = await getDb();
  const [rows, cl, [cfg]] = await Promise.all([receivables(db), db.select().from(clients), db.select().from(settings).limit(1)]);
  const cn = new Map(cl.map((c) => [c.id, c]));
  const total = rows.reduce((a, s) => a + s.pending, 0);
  const methods = enabledMethods(cfg);
  return (
    <>
      <PageHeader title="Por cobrar" subtitle={`${rows.length} venta${rows.length !== 1 ? "s" : ""} con saldo · ${fmt(total)}`} />
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No hay saldos pendientes. Cuando una venta se registra con pagos incompletos, el saldo aparece aquí.</Empty> : (
          <table className="t"><thead><tr><th>Venta</th><th>Cliente</th><th className="num">Total</th><th className="num">Debe</th><th>Cobrar</th></tr></thead>
            <tbody>{rows.map((s) => {
              const c = s.client ? cn.get(s.client) : undefined;
              const d = daysAgo(s.t);
              return (
                <tr key={s.id}>
                  <td><Link className="font-semibold hover:underline" href={`/ventas/${s.id}`}>{s.no}</Link><div className="note">{fdatey(s.t)} · hace {d} d</div></td>
                  <td>{c ? <>{c.name}<div className="note">{c.phone}</div></> : <span className="note">Mostrador</span>}{c?.phone && <a className="btn sm mt-1" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, `Hola ${c.name.split(" ")[0]}, te recordamos que tienes un saldo pendiente de ${fmt(s.pending)} de tu compra ${s.no} en ${cfg.name}.`)}>💬 Recordar</a>}</td>
                  <td className="num">{fmt(s.total)}</td>
                  <td className="num"><b>{fmt(s.pending)}</b> {d > 30 && <Chip tone="bad">+30 d</Chip>}</td>
                  <td><PayPending id={s.id} pending={s.pending} methods={methods} /></td>
                </tr>);
            })}</tbody></table>
        )}
      </div>
    </>
  );
}
