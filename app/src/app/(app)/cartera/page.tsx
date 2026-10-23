import Link from "next/link";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdatey, fmt } from "@/lib/format";
import { allySummary, paymentsLog } from "@/server/allies";
import { PAY_METHODS } from "@/lib/cartera";
import { requireMe } from "@/server/session";
import { AllyForm } from "./ally-form";

export const dynamic = "force-dynamic";


/** Cartera con las tiendas aliadas: lo que se les debe por edades, lo vencido y los anticipos. */
export default async function Cartera({ searchParams }: PageProps<"/cartera">) {
  await requireMe("purchase");
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const db = await getDb();
  const list = await allySummary(db);
  const tab = one("tab") === "pagos" ? "pagos" : "saldos";
  const tabs = (
    <div className="mb-4 flex gap-2">
      <Link href="/cartera" className={`btn ${tab === "saldos" ? "primary" : ""}`}>💼 Saldos por tienda</Link>
      <Link href="/cartera?tab=pagos" className={`btn ${tab === "pagos" ? "primary" : ""}`}>🧾 Historial de pagos</Link>
    </div>
  );
  if (tab === "pagos") return <Pagos list={list} f={{ desde: one("desde"), hasta: one("hasta"), tienda: one("tienda"), forma: one("forma") }} tabs={tabs} db={db} />;
  const sum = (f: (x: (typeof list)[number]) => number) => list.reduce((s, x) => s + f(x), 0);
  return (
    <>
      <PageHeader title="Cartera" subtitle="Cuentas con las tiendas aliadas: saldos, vencimientos, abonos y anticipos" />
      {tabs}
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="card p-3"><span className="note block">Total por pagar</span><b className="text-xl tabular-nums">{fmt(sum((x) => x.balance))}</b></div>
        <div className="card p-3"><span className="note block">Vencido</span><b className={`text-xl tabular-nums ${sum((x) => x.age.overdue) ? "text-red-t" : ""}`}>{fmt(sum((x) => x.age.overdue))}</b></div>
        <div className="card p-3"><span className="note block">Anticipos (saldo a favor)</span><b className="text-xl tabular-nums text-green-t">{fmt(sum((x) => x.advance))}</b></div>
        <div className="card p-3"><span className="note block">Pagado este mes</span><b className="text-xl tabular-nums">{fmt(sum((x) => x.paidMonth))}</b></div>
      </div>
      <div className="card mb-4 overflow-x-auto">
        {list.length === 0 ? <Empty>Aún no hay tiendas aliadas. Crea la primera abajo.</Empty> : (
          <table className="t">
            <thead><tr><th>Tienda</th><th>Fecha de pago</th><th className="num">0–30 días</th><th className="num">31–60</th><th className="num">61–90</th><th className="num">+90</th><th className="num">Saldo</th><th className="num">Anticipo</th><th>Último pago</th></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id}>
                <td><Link className="font-semibold hover:underline" href={`/cartera/${x.id}`}>{x.name}</Link>{!x.active && <Chip>Inactiva</Chip>}<div className="note">{x.mode === "compra" ? "Compra" : "Consignación"}{x.phone ? ` · ${x.phone}` : ""}</div></td>
                <td>{x.due ? <><span className="block">{fdatey(x.due)}</span>{x.balance > 0 && <DueChip t={x.due} />}</> : <span className="note">{x.terms ? `${x.terms} días` : "—"}</span>}</td>
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

function DueChip({ t }: { t: number }) {
  const d0 = new Date(); d0.setHours(12, 0, 0, 0);
  const left = Math.round((new Date(t).setHours(12, 0, 0, 0) - d0.getTime()) / 864e5);
  return <span className={`chip ${left < 0 ? "bad" : left <= 3 ? "warn" : "gray"}`}>{left < 0 ? `vencida hace ${-left} d` : left === 0 ? "vence hoy" : `en ${left} d`}</span>;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (s: string) => (s ? new Date(s + "T12:00:00").getTime() : null);

/** Todos los pagos registrados a las aliadas (control): por fechas del calendario, tienda y forma de pago. */
async function Pagos({ list, f, tabs, db }: { list: { id: string; name: string }[]; f: { desde: string; hasta: string; tienda: string; forma: string }; tabs: React.ReactNode; db: Awaited<ReturnType<typeof getDb>> }) {
  const log = await paymentsLog(db, { from: at(f.desde), to: at(f.hasta), ally: f.tienda, method: f.forma });
  const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1), pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1), pm1 = new Date(now.getFullYear(), now.getMonth(), 0);
  const q = (o: Record<string, string>) => "/cartera?" + new URLSearchParams({ tab: "pagos", ...Object.fromEntries(Object.entries({ ...f, ...o }).filter(([, v]) => v)) }).toString();
  const csv = "/api/export/pagos-aliadas?" + new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
  return (
    <>
      <PageHeader title="Cartera" subtitle="Cada pago a las tiendas aliadas queda registrado aquí" actions={<a className="btn" href={csv}>⬇️ Exportar a Excel</a>} />
      {tabs}
      <form className="card mb-3 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_1.3fr_auto] lg:items-end" action="/cartera">
        <input type="hidden" name="tab" value="pagos" />
        <div><label className="lb" htmlFor="f-desde">📅 Desde</label><input id="f-desde" type="date" name="desde" defaultValue={f.desde} /></div>
        <div><label className="lb" htmlFor="f-hasta">📅 Hasta</label><input id="f-hasta" type="date" name="hasta" defaultValue={f.hasta} /></div>
        <div><label className="lb" htmlFor="f-tienda">Tienda</label><select id="f-tienda" name="tienda" defaultValue={f.tienda}><option value="">Todas</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label className="lb" htmlFor="f-forma">Forma de pago</label><select id="f-forma" name="forma" defaultValue={f.forma}><option value="">Todas</option>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <button className="btn primary">Filtrar</button>
      </form>
      <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
        <Link className="btn sm" href={q({ desde: ymd(now), hasta: ymd(now) })}>Hoy</Link>
        <Link className="btn sm" href={q({ desde: ymd(m0), hasta: ymd(now) })}>Este mes</Link>
        <Link className="btn sm" href={q({ desde: ymd(pm0), hasta: ymd(pm1) })}>Mes pasado</Link>
        <Link className="btn sm" href="/cartera?tab=pagos">Todo</Link>
      </div>
      <div className="mb-3 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="card p-3"><span className="note block">Total pagado</span><b className="text-xl tabular-nums">{fmt(log.total)}</b></div>
        <div className="card p-3"><span className="note block">Pagos</span><b className="text-xl tabular-nums">{log.count}</b>{log.voided > 0 && <span className="note"> · {log.voided} anulado(s)</span>}</div>
        <div className="card p-3 col-span-2"><span className="note block">Por forma de pago</span><div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{log.byMethod.length ? log.byMethod.map(([m, v]) => <span key={m}>{m}: <b>{fmt(v)}</b></span>) : "—"}</div></div>
      </div>
      <div className="card overflow-x-auto">
        {log.rows.length === 0 ? <Empty>No hay pagos con estos filtros.</Empty> : (
          <table className="t">
            <thead><tr><th>Comprobante</th><th>Fecha</th><th>Tienda</th><th>Concepto</th><th>Forma de pago</th><th>Referencia</th><th>Registró</th><th className="num">Valor</th></tr></thead>
            <tbody>{log.rows.map((m) => (
              <tr key={m.id} className={m.voided ? "opacity-50 line-through" : ""}>
                <td><Link className="font-semibold hover:underline" href={`/cartera/egreso/${m.id}`}>{m.no || `#${m.id}`}</Link></td>
                <td className="note whitespace-nowrap">{fdatey(m.t)}</td>
                <td><Link className="hover:underline" href={`/cartera/${m.ally}`}>{m.allyName}</Link></td>
                <td className="note">{m.detail}</td><td>{m.method || "—"}</td><td className="mono note">{m.ref || "—"}</td><td className="note">{m.by}</td>
                <td className="num font-semibold">{fmt(m.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
