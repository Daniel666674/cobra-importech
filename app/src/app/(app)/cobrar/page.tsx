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
export default async function PorCobrar({ searchParams }: PageProps<"/cobrar">) {
  await requireMe("sell");
  const sp = await searchParams;
  const edad = (Array.isArray(sp.edad) ? sp.edad[0] : sp.edad) ?? "";
  const orden = (Array.isArray(sp.orden) ? sp.orden[0] : sp.orden) ?? "antiguo";
  const db = await getDb();
  const [all, cl, [cfg]] = await Promise.all([receivables(db), db.select().from(clients), db.select().from(settings).limit(1)]);
  const BUCKETS: [string, string, number, number][] = [["0-7", "Hasta 7 días", 0, 7], ["8-30", "8 a 30 días", 8, 30], ["31-60", "31 a 60 días", 31, 60], ["61+", "Más de 60 días", 61, 1e9]];
  const inB = (s: { t: number }, b: [string, string, number, number]) => { const d = daysAgo(s.t); return d >= b[2] && d <= b[3]; };
  const cur = BUCKETS.find((b) => b[0] === edad);
  const rows = (cur ? all.filter((s) => inB(s, cur)) : [...all]).sort((a, b) => (orden === "monto" ? b.pending - a.pending : a.t - b.t));
  const cn = new Map(cl.map((c) => [c.id, c]));
  const total = rows.reduce((a, s) => a + s.pending, 0);
  const methods = enabledMethods(cfg);
  return (
    <>
      <PageHeader title="Por cobrar" subtitle={`${rows.length} venta${rows.length !== 1 ? "s" : ""} con saldo · ${fmt(total)}`} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={`/cobrar${orden === "monto" ? "?orden=monto" : ""}`} className={`btn sm ${!cur ? "primary" : ""}`}>Todas · {all.length}</Link>
        {BUCKETS.map((b) => { const g = all.filter((s) => inB(s, b)); return <Link key={b[0]} href={`/cobrar?edad=${b[0]}${orden === "monto" ? "&orden=monto" : ""}`} className={`btn sm ${edad === b[0] ? "primary" : ""}`}>{b[1]} · {g.length} · {fmt(g.reduce((a, s) => a + s.pending, 0))}</Link>; })}
        <span className="note ml-2">Orden:</span>
        <Link href={`/cobrar${edad ? `?edad=${edad}` : ""}`} className={`btn sm ${orden !== "monto" ? "primary" : ""}`}>Más antiguas</Link>
        <Link href={`/cobrar?${edad ? `edad=${edad}&` : ""}orden=monto`} className={`btn sm ${orden === "monto" ? "primary" : ""}`}>Mayor valor</Link>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No hay saldos pendientes. Cuando una venta se registra con pagos incompletos, el saldo aparece aquí.</Empty> : (
          <table className="t"><thead><tr><th>Venta</th><th>Cliente</th><th className="num">Total</th><th className="num">Debe</th><th>Cobrar</th></tr></thead>
            <tbody>{rows.map((s) => {
              const c = s.client ? cn.get(s.client) : undefined;
              const d = daysAgo(s.t);
              return (
                <tr key={s.id}>
                  <td><Link className="font-semibold hover:underline" href={`/ventas/${s.id}`}>{s.no}</Link><div className="note">{fdatey(s.t)} · hace {d} d</div></td>
                  <td>{c ? <><Link href={`/clientes/${c.id}`} className="hover:underline">{c.name}</Link><div className="note">{c.phone}</div></> : <span className="note">Mostrador</span>}{c?.phone && <a className="btn sm mt-1" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, `Hola ${c.name.split(" ")[0]}, te recordamos que tienes un saldo pendiente de ${fmt(s.pending)} de tu compra ${s.no} en ${cfg.name}.`)}>💬 Recordar</a>}</td>
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
