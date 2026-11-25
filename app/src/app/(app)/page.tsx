import Link from "next/link";
import { getDb } from "@/db";
import { PageHeader, FeedText } from "@/components/ui";
import { fmt, fmtM, fdt } from "@/lib/format";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { dashboard } from "@/server/reports";
import { systemHealth } from "@/server/health";
import { recentFeed } from "@/server/admin";
import { settings } from "@/db/schema";
import { waLink } from "@/lib/whatsapp";
import { filtersToQuery, presetRange, ymdBogota } from "@/lib/sale-filters";

const TONE = { bad: "bad", warn: "warn", info: "info" } as const;

export default async function Home({ searchParams }: PageProps<"/">) {
  const me = await requireMe();
  const sp = await searchParams;
  const db = await getDb();
  const [d, feed, [cfg]] = await Promise.all([dashboard(db), hasPerm(me, "reports") ? recentFeed(db, 12) : Promise.resolve([]), db.select().from(settings).limit(1)]);
  if (hasPerm(me, "settings")) {
    const h = await systemHealth(db);
    if (h.bad) d.alerts.unshift({ key: "health-bad", level: "bad", title: `${h.bad} inconsistencia${h.bad !== 1 ? "s" : ""} grave${h.bad !== 1 ? "s" : ""} en el sistema`, detail: "Hay datos que no cuadran entre inventario, ventas, caja o cartera. Revísalas.", href: "/salud" });
    else if (h.warn) d.alerts.push({ key: "health-warn", level: "info", title: `${h.warn} punto${h.warn !== 1 ? "s" : ""} para revisar en la salud del sistema`, detail: "Nada grave, pero conviene mirarlo.", href: "/salud" });
  }
  const summary = `Resumen ${cfg.name}\nVentas hoy: ${fmt(d.kpi.todayTotal)} · 30 días: ${fmtM(d.kpi.monthTotal)}\n` + (d.alerts.length ? d.alerts.map((a) => "• " + a.title).join("\n") : "Sin alertas.");
  const delta = d.kpi.prevTotal ? Math.round(((d.kpi.monthTotal - d.kpi.prevTotal) / d.kpi.prevTotal) * 100) : null;
  const max = Math.max(1, ...d.days.map((x) => x.total));
  const canCost = hasPerm(me, "cost_view");
  const r30 = presetRange("30d")!;
  const q30 = filtersToQuery(r30);
  const kpis: [string, string, string, string][] = [
    ["Ventas de hoy", fmt(d.kpi.todayTotal), `${d.kpi.todayCount} comprobante${d.kpi.todayCount !== 1 ? "s" : ""}`, "/ventas?orden=hoy"],
    ["Ventas · 30 días", fmtM(d.kpi.monthTotal), delta == null ? `${d.kpi.monthCount} ventas` : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs. mes anterior`, `/ventas?${q30}`],
    canCost ? ["Margen · 30 días", fmtM(d.kpi.monthMargin), d.kpi.monthTotal ? `${Math.round((d.kpi.monthMargin / d.kpi.monthTotal) * 100)}% de las ventas` : "—", `/reportes?${q30}`] : ["Inventario", `${d.kpi.stockUnits} uds.`, "en stock", "/inventario?status=stock"],
    canCost ? ["Capital en inventario", fmtM(d.kpi.stockCost), `A precio de venta ${fmtM(d.kpi.stockPrice)}`, "/inventario?status=stock"] : ["Apartados activos", String(d.kpi.holds), `Saldo por cobrar ${fmtM(d.kpi.holdsBalance)}`, "/apartados"],
  ];
  return (
    <>
      {sp.denied && <p className="chip bad !rounded-md mb-4">No tienes permiso para abrir esa sección.</p>}
      <PageHeader title={`Hola, ${me.name.split(" ")[0]}`} subtitle="Resumen de la tienda" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([l, v, s, href]) => (
          <Link key={l} href={href} className="card block p-4 transition hover:border-accent hover:shadow-sm">
            <div className="note">{l}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{v}</div>
            <div className="note mt-0.5">{s} <span aria-hidden>→</span></div>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Ventas · últimos 14 días</h2>
          <div className="flex h-36 items-end gap-1.5">
            {d.days.map((x, i) => { const day = ymdBogota(x.t); return (
              <Link key={i} href={`/ventas?${filtersToQuery({ desde: day, hasta: day })}`} className="group flex h-full flex-1 items-end" title={`${day.slice(8)}/${day.slice(5, 7)} · ${fmt(x.total)} · ver ventas`} aria-label={`Ventas del ${day}: ${fmt(x.total)}`}>
                <div className="w-full rounded-t bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(2, (x.total / max) * 100)}%` }} />
              </Link>
            ); })}
          </div>
          <div className="mt-1 flex gap-1.5">{d.days.map((x, i) => { const day = ymdBogota(x.t); return <span key={i} className="note flex-1 text-center text-[10px]">{day.slice(8)}</span>; })}</div>
        </div>
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Alertas</h2>{cfg.ownerPhone && hasPerm(me, "reports") && (
            <a className="btn sm" target="_blank" rel="noopener noreferrer" href={waLink(cfg.ownerPhone, summary)}>💬 Enviar al dueño</a>
          )}</div>
          {d.alerts.length === 0 ? <p className="note">Todo en orden.</p> : (
            <ul className="space-y-2.5">
              {d.alerts.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="block rounded-lg border border-line p-2.5 hover:bg-gray-bg">
                    <span className={`chip ${TONE[a.level]} mb-1`}>{a.title}</span>
                    <div className="note">{a.detail}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Más vendidos · 30 días</h2>
          {d.top.length === 0 ? <p className="note">Sin ventas en el período.</p> : (
            <ol className="space-y-2">
              {d.top.map(([name, q]) => (
                <li key={name}><Link href={`/ventas?${filtersToQuery({ ...r30, q: name })}`} className="flex justify-between gap-3 rounded px-1 py-0.5 hover:bg-gray-bg"><span>{name}</span><b className="tabular-nums">{q}</b></Link></li>
              ))}
            </ol>
          )}
        </div>
        {feed.length > 0 && (
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Actividad reciente</h2>{hasPerm(me, "reports") && <Link href="/actividad" className="btn sm">Ver todo →</Link>}</div>
            <ul className="space-y-2">
              {feed.map((f) => (
                <li key={f.id} className="flex gap-2 text-[13px]"><span>{f.ic}</span><span className="flex-1"><FeedText text={f.x} /><span className="note block">{fdt(f.t)} · {f.by}</span></span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
