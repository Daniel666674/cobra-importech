import Link from "next/link";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { enabledMethods } from "@/lib/catalog";
import { fdt, fmt } from "@/lib/format";
import { bogotaToday, cajaDay } from "@/server/caja";
import { requireMe } from "@/server/session";
import { settings } from "@/db/schema";
import { CloseForm, MoveForm, VoidMove } from "./caja-forms";

export const dynamic = "force-dynamic";

/** Caja del día: lo que entró y salió por cada forma de pago, el efectivo que debería haber y el cierre. */
export default async function Caja({ searchParams }: PageProps<"/caja">) {
  await requireMe("sell");
  const sp = await searchParams;
  const q = Array.isArray(sp.dia) ? sp.dia[0] : sp.dia;
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : bogotaToday();
  const db = await getDb();
  const [d, [cfg]] = await Promise.all([cajaDay(db, day), db.select().from(settings).limit(1)]);
  const methods = [...new Set(["Efectivo", ...enabledMethods(cfg), "Transferencia", "Nequi", "Daviplata"])];
  return (
    <>
      <PageHeader title="Caja" subtitle={`${day === bogotaToday() ? "Hoy" : "Día"} ${day} · entró ${fmt(d.totalIn)}`} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" action="/caja">
        <div><label className="lb" htmlFor="dia">Día</label><input id="dia" type="date" name="dia" defaultValue={day} max={bogotaToday()} /></div>
        <button className="btn">Ver</button>
        {day !== bogotaToday() && <Link className="btn" href="/caja">Hoy</Link>}
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="note">Efectivo que debería haber</div><div className="text-2xl font-bold tabular-nums">{fmt(d.expected)}</div></div>
        <div className="card p-4"><div className="note">Entró en total</div><div className="text-2xl font-bold tabular-nums">{fmt(d.totalIn)}</div></div>
        <div className="card p-4"><div className="note">Último cierre</div><div className="text-lg font-bold">{d.closes[0] ? <>{fmt(d.closes[0].counted)} <Chip tone={d.closes[0].counted === d.closes[0].expected ? "ok" : "warn"}>{d.closes[0].counted === d.closes[0].expected ? "Cuadró" : `${d.closes[0].counted > d.closes[0].expected ? "Sobran" : "Faltan"} ${fmt(Math.abs(d.closes[0].counted - d.closes[0].expected))}`}</Chip></> : "Sin cerrar"}</div>{d.closes[0] && <div className="note">{d.closes[0].by} · {fdt(d.closes[0].t)}</div>}</div>
      </div>
      <div className="card mb-4 overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Por forma de pago</h2>
        {d.byMethod.length === 0 ? <Empty>No hay movimientos este día.</Empty> : (
          <table className="t"><thead><tr><th>Forma</th><th className="num">Entró</th><th className="num">Salió</th><th className="num">Neto</th></tr></thead>
            <tbody>{d.byMethod.map((m) => <tr key={m.method}><td>{m.method}</td><td className="num">{fmt(m.in)}</td><td className="num">{m.out ? fmt(m.out) : "—"}</td><td className="num"><b>{fmt(m.in - m.out)}</b></td></tr>)}</tbody></table>
        )}
        <p className="note px-4 pb-3 pt-1">Addi, Vanti y las tarjetas figuran aquí pero el dinero llega al banco días después. Las devoluciones de dinero a clientes se registran como retiro.</p>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <MoveForm day={day} methods={methods} />
        <CloseForm day={day} expected={d.expected} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto"><h2 className="px-4 pt-3 font-semibold">Entradas</h2>
          {d.ins.length === 0 ? <Empty>Sin entradas.</Empty> : <table className="t"><tbody>{d.ins.map((x, i) => (
            <tr key={i}><td className="note whitespace-nowrap">{fdt(x.when).split("·")[1]}</td><td>{x.href ? <Link className="hover:underline" href={x.href}>{x.ref}</Link> : x.ref}<div className="note">{x.what} · {x.method}</div></td><td className="num"><b>{fmt(x.amount)}</b></td></tr>))}</tbody></table>}
        </div>
        <div className="card overflow-x-auto"><h2 className="px-4 pt-3 font-semibold">Salidas</h2>
          {d.outs.length === 0 ? <Empty>Sin salidas.</Empty> : <table className="t"><tbody>{d.outs.map((x, i) => (
            <tr key={i}><td className="note whitespace-nowrap">{fdt(x.when).split("·")[1]}</td><td>{x.what}<div className="note">{x.method}</div></td><td className="num"><b>{fmt(x.amount)}</b></td><td>{x.id ? <VoidMove id={x.id} /> : null}</td></tr>))}</tbody></table>}
        </div>
      </div>
      {d.closes.length > 0 && (
        <div className="card mt-4 overflow-x-auto"><h2 className="px-4 pt-3 font-semibold">Cierres de este día</h2>
          <table className="t"><thead><tr><th>Hora</th><th>Hizo</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Notas</th></tr></thead>
            <tbody>{d.closes.map((c) => <tr key={c.id}><td>{fdt(c.t)}</td><td>{c.by}</td><td className="num">{fmt(c.expected)}</td><td className="num">{fmt(c.counted)}</td><td className="num"><b>{fmt(c.counted - c.expected)}</b></td><td>{c.notes}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
