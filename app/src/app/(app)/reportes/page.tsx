import Link from "next/link";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { CATS, METHODS } from "@/lib/catalog";
import { fmt, fmtM } from "@/lib/format";
import { filtersToQuery, presetRange, type SaleFilters } from "@/lib/sale-filters";
import { hasPerm } from "@/server/auth";
import { bogotaToday } from "@/server/caja";
import { advancedReport } from "@/server/reports";
import { requireMe } from "@/server/session";

const PRESETS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "7 días"], ["30d", "30 días"], ["90d", "90 días"], ["mes", "Este mes"], ["mes_ant", "Mes anterior"], ["anio", "Este año"]] as const;
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <span className="note">{cur ? "sin período anterior" : "—"}</span>;
  const p = Math.round(((cur - prev) / prev) * 100);
  return <span className={p >= 0 ? "text-green-t" : "text-red-t"}>{p >= 0 ? "▲" : "▼"} {Math.abs(p)}% <span className="note">vs. período anterior</span></span>;
}
const Bar = ({ v, max, tone = "bg-accent" }: { v: number; max: number; tone?: string }) => <div className="mt-1 h-2 rounded-full bg-gray-bg"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(1, (v / Math.max(1, max)) * 100)}%` }} /></div>;

export default async function Reportes({ searchParams }: PageProps<"/reportes">) {
  const me = await requireMe("reports");
  const sp = await searchParams;
  const r30 = presetRange("30d")!;
  const today = bogotaToday();
  let desde = ymd(one(sp.desde)) || r30.desde, hasta = ymd(one(sp.hasta)) || r30.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (hasta > today) hasta = today;
  const f = { desde, hasta, vendedor: one(sp.vendedor), metodo: one(sp.metodo), cat: one(sp.cat) };
  const db = await getDb();
  const [r, us] = await Promise.all([advancedReport(db, f), db.select().from(users)]);
  const cost = hasPerm(me, "cost_view");
  const { cur, prev } = r;
  const vq = (patch: Partial<SaleFilters> = {}) => `/ventas?${filtersToQuery({ ...f, ...patch } as Partial<SaleFilters>)}`;
  const rq = (patch: Record<string, string>) => `/reportes?${filtersToQuery({ ...f, ...patch })}`;
  const maxDay = Math.max(1, ...r.days.map((d) => d.total));
  const maxCat = Math.max(1, ...cur.byCat.map(([, c]) => c.total));
  const maxWd = Math.max(1, ...cur.byWeekday.map((d) => d.total));
  const used = cur.byHour.map((h, i) => (h.n ? i : -1)).filter((i) => i >= 0);
  const h0 = Math.min(7, ...(used.length ? used : [7])), h1 = Math.max(21, ...(used.length ? used : [21]));
  const hours = cur.byHour.map((h, i) => ({ ...h, i })).filter((h) => h.i >= h0 && h.i <= h1);
  const maxHr = Math.max(1, ...hours.map((h) => h.total));
  const active = [f.vendedor && `Vendedor: ${(r.userName.get(f.vendedor) ?? f.vendedor).split(" ")[0]}`, f.metodo && `Pago: ${f.metodo}`, f.cat && `Categoría: ${f.cat}`].filter(Boolean);
  const kpis: { l: string; v: string; d: React.ReactNode; href: string }[] = [
    { l: "Ventas", v: fmt(cur.total), d: <Delta cur={cur.total} prev={prev.total} />, href: vq() },
    { l: "Comprobantes", v: String(cur.count), d: <Delta cur={cur.count} prev={prev.count} />, href: vq() },
    { l: "Unidades vendidas", v: String(cur.units), d: <Delta cur={cur.units} prev={prev.units} />, href: vq() },
    { l: "Ticket promedio", v: fmt(cur.ticket), d: <Delta cur={cur.ticket} prev={prev.ticket} />, href: vq() },
    ...(cost ? [{ l: "Margen", v: fmt(cur.margin), d: <span className="note">{cur.total ? Math.round((cur.margin / cur.total) * 100) : 0}% de las ventas · <Delta cur={cur.margin} prev={prev.margin} /></span>, href: vq() }] : []),
    { l: "Descuentos dados", v: fmt(cur.discount), d: <span className="note">{cur.total + cur.discount ? Math.round((cur.discount / (cur.total + cur.discount)) * 100) : 0}% del precio de lista</span>, href: vq() },
    { l: "Recargos cobrados", v: fmt(cur.surcharge), d: <span className="note">Addi, Vanti, tarjetas, datáfono</span>, href: vq({ metodo: "" }) },
    { l: "Saldo por cobrar", v: fmt(cur.pending), d: <span className="note">de estas ventas · ver todas →</span>, href: "/cobrar" },
  ];
  return (
    <>
      <PageHeader title="Reportes" subtitle={`${desde} → ${hasta} · ${r.ndays} día${r.ndays !== 1 ? "s" : ""} · comparado con los ${r.ndays} anteriores`}
        actions={<a className="btn" href={`/api/ventas-csv?${filtersToQuery(f)}`}>⬇️ Ventas del período (CSV)</a>} />
      <div className="card mb-4 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="note mr-1">Período:</span>
          {PRESETS.map(([k, l]) => { const p = presetRange(k)!; const on = p.desde === desde && p.hasta === hasta; return <Link key={k} href={rq({ desde: p.desde, hasta: p.hasta })} className={`btn sm ${on ? "primary" : ""}`}>{l}</Link>; })}
        </div>
        <form action="/reportes" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-[12px]"><span className="lb">Desde</span><input type="date" name="desde" defaultValue={desde} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Hasta</span><input type="date" name="hasta" defaultValue={hasta} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Vendedor</span><select name="vendedor" defaultValue={f.vendedor}><option value="">Todos</option>{us.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Forma de pago</span><select name="metodo" defaultValue={f.metodo}><option value="">Todas</option>{[...METHODS, "Retoma", "Abono previo"].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Categoría</span><select name="cat" defaultValue={f.cat}><option value="">Todas</option>{[...CATS, "Otros"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <div className="flex items-end gap-2"><button className="btn primary">Aplicar</button>{active.length > 0 && <Link className="btn" href={rq({ vendedor: "", metodo: "", cat: "" })}>Quitar filtros</Link>}</div>
        </form>
        {active.length > 0 && <div className="flex flex-wrap gap-1.5">{active.map((a) => <span key={String(a)} className="chip info">{a}</span>)}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.l} href={k.href} className="card block p-4 transition hover:border-accent hover:shadow-sm">
            <div className="note">{k.l}</div><div className="mt-1 text-xl font-bold tabular-nums">{k.v}</div><div className="mt-0.5 text-[12px]">{k.d}</div>
          </Link>))}
      </div>

      <div className="card mt-4 p-4">
        <h2 className="mb-1 font-semibold">Ventas {r.days.length > 0 && r.days[0].key.length === 7 ? "por mes" : "por día"}</h2>
        <p className="note mb-3">Toca una barra para ver los comprobantes de ese {r.days[0]?.key.length === 7 ? "mes" : "día"}.</p>
        {cur.count === 0 ? <p className="note">Sin ventas en el período.</p> : (
          <>
            <div className="flex h-40 items-end gap-1">
              {r.days.map((d) => (
                <Link key={d.key} href={vq({ desde: d.from, hasta: d.to })} className="group flex h-full min-w-0 flex-1 items-end" title={`${d.key} · ${fmt(d.total)} · ${d.n} comprobante${d.n !== 1 ? "s" : ""}`} aria-label={`${d.key}: ${fmt(d.total)}`}>
                  <div className="w-full rounded-t bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(d.total ? 3 : 0, (d.total / maxDay) * 100)}%` }} />
                </Link>))}
            </div>
            <div className="mt-1 flex gap-1">{r.days.map((d, i) => <span key={d.key} className="note min-w-0 flex-1 text-center text-[10px]">{r.days.length > 20 && i % Math.ceil(r.days.length / 14) ? "" : d.label}</span>)}</div>
          </>)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 className="mb-3 font-semibold">Por categoría</h2>
          {cur.byCat.length === 0 ? <p className="note">—</p> : <ul className="space-y-1">{cur.byCat.map(([cat, c]) => (
            <li key={cat}><Link href={vq({ cat })} className="block rounded px-1 py-1 hover:bg-gray-bg"><div className="flex justify-between text-[13px]"><span>{cat} <span className="note">· {c.units} uds. · {c.n} ventas</span></span><b className="tabular-nums">{fmt(c.total)}</b></div><Bar v={c.total} max={maxCat} />{cost && <div className="note mt-0.5">Margen {fmt(c.margin)} ({c.total ? Math.round((c.margin / c.total) * 100) : 0}%)</div>}</Link></li>))}</ul>}</div>
        <div className="card p-4"><h2 className="mb-3 font-semibold">Productos más vendidos</h2>
          {cur.byProduct.length === 0 ? <p className="note">—</p> : <ol className="space-y-0.5">{cur.byProduct.slice(0, 15).map(([name, p], i) => (
            <li key={name}><Link href={vq({ q: name } as Partial<SaleFilters>)} className="flex justify-between gap-3 rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span><span className="note">{i + 1}.</span> {name} <span className="note">· {p.units} uds.</span></span><span className="text-right"><b className="tabular-nums">{fmt(p.total)}</b>{cost && <span className="note block">margen {fmt(p.margin)}</span>}</span></Link></li>))}</ol>}</div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-4"><h2 className="mb-3 font-semibold">Por vendedor</h2>
          {cur.bySeller.length === 0 ? <p className="note">—</p> : <ul className="space-y-1">{cur.bySeller.map(([u, v]) => (
            <li key={u}><Link href={vq({ vendedor: u })} className="block rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><div className="flex justify-between"><span>{(r.userName.get(u) ?? u).split(" ")[0]} <span className="note">· {v.n} ventas</span></span><b className="tabular-nums">{fmt(v.total)}</b></div><div className="note">Ticket {fmt(v.n ? v.total / v.n : 0)}{cost ? ` · margen ${fmt(v.margin)}` : ""}</div></Link></li>))}</ul>}</div>
        <div className="card p-4"><h2 className="mb-3 font-semibold">Por forma de pago</h2>
          {cur.byMethod.length === 0 ? <p className="note">—</p> : <ul className="space-y-1">{cur.byMethod.map(([m, v]) => (
            <li key={m}><Link href={vq({ metodo: m })} className="flex justify-between rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span>{m} <span className="note">· {v.n}</span></span><b className="tabular-nums">{fmt(v.amount)}</b></Link></li>))}</ul>}</div>
        <div className="card p-4"><h2 className="mb-3 font-semibold">Mejores clientes</h2>
          {cur.byClient.length === 0 ? <p className="note">—</p> : <ul className="space-y-1">{cur.byClient.slice(0, 10).map(([c, v]) => (
            <li key={c || "mostrador"}>{c ? <Link href={`/clientes/${c}`} className="flex justify-between rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span>{r.clientName.get(c) ?? c} <span className="note">· {v.n}</span></span><b className="tabular-nums">{fmt(v.total)}</b></Link> : <div className="flex justify-between px-1 py-1 text-[13px]"><span className="note">Mostrador (sin cliente) · {v.n}</span><b className="tabular-nums">{fmt(v.total)}</b></div>}</li>))}</ul>}</div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 className="mb-3 font-semibold">Por día de la semana</h2>
          <ul className="space-y-1.5">{cur.byWeekday.map((d, i) => <li key={i} className="text-[13px]"><div className="flex justify-between"><span>{WD[i]} <span className="note">· {d.n}</span></span><b className="tabular-nums">{fmt(d.total)}</b></div><Bar v={d.total} max={maxWd} /></li>)}</ul></div>
        <div className="card p-4"><h2 className="mb-3 font-semibold">Por hora del día</h2>
          <div className="flex h-32 items-end gap-1">{hours.map((h) => <div key={h.i} className="flex h-full min-w-0 flex-1 items-end" title={`${h.i}:00 · ${fmt(h.total)} · ${h.n} ventas`}><div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(h.total ? 3 : 0, (h.total / maxHr) * 100)}%` }} /></div>)}</div>
          <div className="mt-1 flex gap-1">{hours.map((h) => <span key={h.i} className="note min-w-0 flex-1 text-center text-[10px]">{h.i}</span>)}</div>
          <p className="note mt-2">Hora de Bogotá. Sirve para saber a qué horas poner más gente en tienda.</p></div>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Inventario hoy</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1"><h3 className="mb-3 font-semibold">Capital por categoría</h3>
          {r.capByCat.length === 0 ? <p className="note">Sin stock.</p> : <ul className="space-y-1">{r.capByCat.map(([cat, c]) => (
            <li key={cat}><Link href={`/inventario?cat=${encodeURIComponent(cat)}`} className="flex justify-between rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span>{cat} <span className="note">· {c.units} uds.</span></span><span className="text-right"><b className="tabular-nums">{fmtM(cost ? c.cost : c.price)}</b>{cost && <span className="note block">a precio {fmtM(c.price)}</span>}</span></Link></li>))}</ul>}</div>
        <div className="card p-4"><h3 className="mb-3 font-semibold">Antigüedad en vitrina</h3>
          <ul className="space-y-1">{r.aging.map((a) => (
            <li key={a.label}><Link href={`/inventario?status=En vitrina&edad=${a.label}`} className="flex justify-between rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span>{a.label === "91+" ? "Más de 90 días" : `${a.label} días`} <span className="note">· {a.count} equipos</span></span>{cost && <b className="tabular-nums">{fmtM(a.cost)}</b>}</Link></li>))}</ul>
          <p className="note mt-2">Toca un rango para ver esos equipos.</p></div>
        <div className="card p-4"><h3 className="mb-3 font-semibold">Más tiempo sin venderse</h3>
          {r.slow.length === 0 ? <p className="note">—</p> : <ul className="space-y-1">{r.slow.map((s) => (
            <li key={s.id}><Link href={`/inventario/${s.id}`} className="flex justify-between gap-2 rounded px-1 py-1 text-[13px] hover:bg-gray-bg"><span className="truncate">{s.name}</span><span className="shrink-0 note">{s.days} d · {fmt(s.price)}</span></Link></li>))}</ul>}</div>
      </div>
    </>
  );
}
