import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { feed, items, sales } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { MODULES, moduleOf, refHref } from "@/lib/activity";
import { fdt } from "@/lib/format";
import { filtersToQuery, presetRange, ymdStart } from "@/lib/sale-filters";
import { bogotaToday } from "@/server/caja";
import { requireMe } from "@/server/session";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const PAGE = 100;

export default async function Actividad({ searchParams }: PageProps<"/actividad">) {
  await requireMe("reports");
  const sp = await searchParams;
  const f = { modulo: one(sp.modulo), usuario: one(sp.usuario), desde: ymd(one(sp.desde)), hasta: ymd(one(sp.hasta)), q: one(sp.q).toLowerCase().trim() };
  const db = await getDb();
  const [all, ss, its] = await Promise.all([db.select().from(feed).orderBy(desc(feed.t), desc(feed.id)).limit(5000), db.select({ id: sales.id, no: sales.no }).from(sales), db.select({ id: items.id, sku: items.sku }).from(items)]);
  const saleMap = new Map(ss.map((s) => [s.no, s.id])), skuMap = new Map(its.map((i) => [i.sku, i.id]));
  const from = f.desde ? ymdStart(f.desde) : null, to = f.hasta ? ymdStart(f.hasta) : null;
  const rows = all.map((r) => ({ ...r, mod: moduleOf(r.ic) })).filter((r) =>
    (!f.modulo || r.mod === f.modulo) && (!f.usuario || r.by === f.usuario) && (from == null || r.t >= from) && (to == null || r.t < to + 86400_000) && (!f.q || unesc(r.x).toLowerCase().includes(f.q)));
  const users = [...new Set(all.map((r) => r.by))].sort();
  const limit = Math.max(PAGE, Number(one(sp.n)) || PAGE);
  const today = bogotaToday();
  const q = (patch: Partial<typeof f> & { n?: number }) => { const { n, ...p } = patch; const s = filtersToQuery({ ...f, ...p }, n ? { n: String(n) } : {}); return s ? `/actividad?${s}` : "/actividad"; };
  const counts = new Map<string, number>(); for (const r of all.map((x) => ({ ...x, mod: moduleOf(x.ic) })).filter((r) => (from == null || r.t >= from) && (to == null || r.t < to + 86400_000))) counts.set(r.mod, (counts.get(r.mod) ?? 0) + 1);
  const render = (text: string) => unesc(text).split(/(\b[A-Z]{1,4}-\d{3,8}\b)/g).map((p, i) => { const h = /^[A-Z]{1,4}-\d{3,8}$/.test(p) ? refHref(p, saleMap, skuMap) : null; return h ? <Link key={i} href={h} className="font-semibold underline decoration-dotted">{p}</Link> : <span key={i}>{p}</span>; });
  return (
    <>
      <PageHeader title="Registro de actividad" subtitle={`${rows.length} movimientos · cada venta, retoma, pago, cambio y acceso queda anotado con quién y cuándo`} />
      <div className="card mb-3 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="note mr-1">Período:</span>
          {([["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "7 días"], ["30d", "30 días"]] as const).map(([k, l]) => { const r = presetRange(k)!; return <Link key={k} href={q(r)} className={`btn sm ${f.desde === r.desde && f.hasta === r.hasta ? "primary" : ""}`}>{l}</Link>; })}
          {(f.desde || f.hasta) && <Link href={q({ desde: "", hasta: "" })} className="btn sm">Todo el historial</Link>}
        </div>
        <form action="/actividad" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[12px]"><span className="lb">Desde</span><input type="date" name="desde" defaultValue={f.desde} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Hasta</span><input type="date" name="hasta" defaultValue={f.hasta} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Quién</span><select name="usuario" defaultValue={f.usuario}><option value="">Todos</option>{users.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Módulo</span><select name="modulo" defaultValue={f.modulo}><option value="">Todos</option>{MODULES.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Buscar</span><input name="q" defaultValue={f.q} placeholder="comprobante, IMEI, cliente…" /></label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5"><button className="btn primary">Aplicar</button>{(f.modulo || f.usuario || f.q || f.desde) && <Link className="btn" href="/actividad">Quitar todos</Link>}</div>
        </form>
        <div className="flex flex-wrap gap-1.5">{MODULES.filter((m) => counts.get(m)).map((m) => <Link key={m} href={q({ modulo: f.modulo === m ? "" : m })} className={`chip ${f.modulo === m ? "info" : "gray"}`}>{m} · {counts.get(m)}</Link>)}</div>
      </div>
      <div className="card p-4">
        {rows.length === 0 ? <Empty>Sin movimientos con estos filtros.</Empty> : (
          <ul className="divide-y divide-line">
            {rows.slice(0, limit).map((r) => (
              <li key={r.id} className="flex gap-3 py-2.5 text-[13.5px]">
                <span className="w-6 shrink-0 text-center text-[17px]">{r.ic}</span>
                <span className="min-w-0 flex-1">{render(r.x.replace(/<\/?b>/g, ""))}<span className="note block">{fdt(r.t)} · <Link href={q({ usuario: r.by })} className="hover:underline">{r.by}</Link> · <Link href={q({ modulo: r.mod })} className="hover:underline">{r.mod}</Link></span></span>
              </li>))}
          </ul>)}
        {rows.length > limit && <div className="mt-3 text-center"><Link className="btn" href={q({ n: limit + PAGE })} scroll={false}>Mostrar más ({rows.length - limit} restantes)</Link></div>}
      </div>
    </>
  );
}
