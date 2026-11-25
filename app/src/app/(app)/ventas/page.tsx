import Link from "next/link";
import { getDb } from "@/db";
import { clients, items, users } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { ScanSearch } from "@/components/scan-search";
import { fdt, fmt } from "@/lib/format";
import { CATS, METHODS } from "@/lib/catalog";
import { ESTADOS, activeFilterCount, filtersToQuery, matchSale, parseSaleFilters, presetRange, type SaleFilters } from "@/lib/sale-filters";
import { saleCost, saleNet, saleVoid } from "@/lib/sales";
import { hasPerm } from "@/server/auth";
import { bogotaToday } from "@/server/caja";
import { listSales } from "@/server/sales";
import { requireMe } from "@/server/session";

const PAGE = 150;
const PRESETS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "7 días"], ["30d", "30 días"], ["mes", "Este mes"], ["mes_ant", "Mes anterior"], ["anio", "Este año"]] as const;

export default async function Ventas({ searchParams }: PageProps<"/ventas">) {
  const me = await requireMe("sell");
  const sp = await searchParams;
  const f = parseSaleFilters(sp);
  const orden = (Array.isArray(sp.orden) ? sp.orden[0] : sp.orden) ?? "numero";
  const db = await getDb();
  const [all, cl, us, its] = await Promise.all([listSales(db), db.select().from(clients), db.select().from(users), db.select({ id: items.id, cat: items.cat }).from(items)]);
  const cn = new Map(cl.map((c) => [c.id, c.name]));
  const clientText = new Map(cl.map((c) => [c.id, `${c.name} ${c.doc} ${c.phone}`]));
  const un = new Map(us.map((u) => [u.id, u.name]));
  const itemCat = new Map(its.map((i) => [i.id, i.cat]));
  const canCost = hasPerm(me, "cost_view");
  const today = bogotaToday();
  const todayCount = all.filter((s) => bogotaToday(s.t) === today).length;
  const sorted = orden === "fecha" ? [...all].sort((a, b) => b.t - a.t) : all;
  const rows = sorted.filter((s) => matchSale(s, orden === "hoy" ? { ...f, desde: today, hasta: today } : f, { itemCat, clientText }));
  const valid = rows.filter((s) => !saleVoid(s));
  const total = valid.reduce((a, s) => a + saleNet(s), 0);
  const margin = valid.reduce((a, s) => a + saleNet(s) - saleCost(s), 0);
  const owed = valid.reduce((a, s) => a + s.pending, 0);
  const limit = Math.max(PAGE, Number(Array.isArray(sp.n) ? sp.n[0] : sp.n) || PAGE);
  const shown = rows.slice(0, limit);
  const href = (patch: Partial<SaleFilters> & { orden?: string; n?: number }) => {
    const { orden: po, n, ...pf } = patch;
    const o = po ?? orden;
    const qs = filtersToQuery({ ...f, ...pf }, { ...(o !== "numero" ? { orden: o } : {}), ...(n ? { n: String(n) } : {}) });
    return qs ? `/ventas?${qs}` : "/ventas";
  };
  const chips: [string, string, Partial<SaleFilters>][] = [];
  if (f.desde || f.hasta) chips.push(["Fechas", `${f.desde || "…"} → ${f.hasta || "…"}`, { desde: "", hasta: "" }]);
  if (f.vendedor) chips.push(["Vendedor", (un.get(f.vendedor) ?? f.vendedor).split(" ")[0], { vendedor: "" }]);
  if (f.metodo) chips.push(["Pago", f.metodo, { metodo: "" }]);
  if (f.cat) chips.push(["Categoría", f.cat, { cat: "" }]);
  if (f.estado) chips.push(["Estado", ESTADOS.find((e) => e[0] === f.estado)?.[1] ?? f.estado, { estado: "" }]);
  if (f.cliente) chips.push(["Cliente", cn.get(f.cliente) ?? f.cliente, { cliente: "" }]);
  const csvQuery = filtersToQuery(f);
  return (
    <>
      <PageHeader title="Ventas" subtitle={`${rows.length} comprobantes${activeFilterCount(f) ? " con los filtros aplicados" : ""}`} actions={<><a className="btn" href={`/api/ventas-csv?${csvQuery}`}>⬇️ Excel (CSV)</a><Link className="btn primary" href="/venta">🧾 Nueva venta</Link></>} />
      <div className="card mb-3 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="note mr-1">Período:</span>
          {PRESETS.map(([k, l]) => { const r = presetRange(k)!; const on = f.desde === r.desde && f.hasta === r.hasta; return <Link key={k} href={href(r)} className={`btn sm ${on ? "primary" : ""}`}>{l}</Link>; })}
        </div>
        <form action="/ventas" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {f.q && <input type="hidden" name="q" value={f.q} />}
          {orden !== "numero" && <input type="hidden" name="orden" value={orden} />}
          <label className="text-[12px]"><span className="lb">Desde</span><input type="date" name="desde" defaultValue={f.desde} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Hasta</span><input type="date" name="hasta" defaultValue={f.hasta} max={today} /></label>
          <label className="text-[12px]"><span className="lb">Vendedor</span><select name="vendedor" defaultValue={f.vendedor}><option value="">Todos</option>{us.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Forma de pago</span><select name="metodo" defaultValue={f.metodo}><option value="">Todas</option>{[...METHODS, "Retoma", "Abono previo"].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Categoría</span><select name="cat" defaultValue={f.cat}><option value="">Todas</option>{[...CATS, "Otros"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-[12px]"><span className="lb">Estado</span><select name="estado" defaultValue={f.estado}><option value="">Todos</option>{ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {f.cliente && <input type="hidden" name="cliente" value={f.cliente} />}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6"><button className="btn primary">Aplicar filtros</button>{activeFilterCount(f) > 0 && <Link className="btn" href="/ventas">Quitar todos</Link>}</div>
        </form>
        {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map(([k, v, patch]) => <Link key={k} href={href(patch)} className="chip info" title="Quitar este filtro">{k}: <b>{v}</b> ✕</Link>)}</div>}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-3"><div className="note">Ventas</div><b className="text-lg tabular-nums">{fmt(total)}</b><div className="note">{valid.length} comprobante{valid.length !== 1 ? "s" : ""}</div></div>
        <div className="card p-3"><div className="note">Ticket promedio</div><b className="text-lg tabular-nums">{fmt(valid.length ? total / valid.length : 0)}</b></div>
        {canCost && <div className="card p-3"><div className="note">Margen</div><b className="text-lg tabular-nums">{fmt(margin)}</b><div className="note">{total ? Math.round((margin / total) * 100) : 0}% de las ventas</div></div>}
        <Link href={href({ estado: "pendiente" })} className="card p-3 hover:bg-gray-bg"><div className="note">Saldo por cobrar</div><b className="text-lg tabular-nums">{fmt(owed)}</b><div className="note">Ver solo las que deben →</div></Link>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([["numero", "Por número de comprobante"], ["fecha", "Más recientes primero"], ["hoy", `Solo hoy (${todayCount})`]] as const).map(([k, l]) => <Link key={k} href={href({ orden: k })} className={`btn sm ${orden === k ? "primary" : ""}`}>{l}</Link>)}
        {orden === "numero" && todayCount > 0 && <span className="note">Si una venta de hoy no aparece arriba, mira «Más recientes primero» o «Solo hoy».</span>}
      </div>
      <form className="card mb-4 p-3" action="/ventas">
        {Object.entries({ desde: f.desde, hasta: f.hasta, vendedor: f.vendedor, metodo: f.metodo, cat: f.cat, estado: f.estado, cliente: f.cliente, ...(orden !== "numero" ? { orden } : {}) }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <ScanSearch defaultValue={f.q} placeholder="Buscar por número, cliente, cédula, teléfono, producto o IMEI" ariaLabel="Buscar" />
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>Sin ventas con estos filtros.</Empty> : (
          <table className="t">
            <thead><tr><th>Comprobante</th><th>Cliente</th><th>Productos</th><th>Pago</th><th>Atendió</th><th className="num">Total</th></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="hover:bg-gray-bg/60">
                  <td><Link href={`/ventas/${s.id}`} className="font-semibold hover:underline">{s.no}</Link><div className="note"><Link href={href({ desde: new Date(s.t - 5 * 3600_000).toISOString().slice(0, 10), hasta: new Date(s.t - 5 * 3600_000).toISOString().slice(0, 10) })} className="hover:underline">{fdt(s.t)}</Link></div>{s.mode === "historico" && <Chip tone="warn">Histórica</Chip>}</td>
                  <td>{s.client ? <Link href={`/clientes/${s.client}`} className="hover:underline">{cn.get(s.client) ?? s.client}</Link> : <span className="note">Mostrador</span>}</td>
                  <td className="max-w-[320px]"><span className="line-clamp-2">{s.lines.map((l, i) => <span key={i}>{i > 0 && ", "}{l.item ? <Link href={`/inventario/${l.item}`} className="hover:underline">{(l.qty > 1 ? `${l.qty}× ` : "") + l.name}</Link> : (l.qty > 1 ? `${l.qty}× ` : "") + l.name}</span>)}</span></td>
                  <td><Link href={href({ metodo: s.method })} className="hover:underline">{s.method}</Link></td>
                  <td>{s.by && un.get(s.by) ? <Link href={href({ vendedor: s.by })} className="hover:underline">{un.get(s.by)!.split(" ")[0]}</Link> : (s.notes.match(/Vendedor: ([^·]+)/)?.[1]?.trim() ?? "—").split(" ")[0]}</td>
                  <td className="num"><b>{fmt(saleNet(s))}</b> {saleVoid(s) && <Chip tone="bad">Devuelta</Chip>} {s.pending > 0 && <Link href={href({ estado: "pendiente" })}><Chip tone="warn">Debe {fmt(s.pending)}</Chip></Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > limit && <div className="mt-3 text-center"><Link className="btn" href={href({ n: limit + PAGE })} scroll={false}>Mostrar más ({rows.length - limit} restantes)</Link></div>}
    </>
  );
}
