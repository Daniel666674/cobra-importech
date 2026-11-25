import Link from "next/link";
import { getDb } from "@/db";
import { clients, items, sales } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { saleNet, saleVoid } from "@/lib/sales";
import { requireMe } from "@/server/session";
import { ClientForm } from "./client-form";

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  await requireMe("clients");
  const sp = await searchParams;
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").toLowerCase().trim();
  const db = await getDb();
  const [cl, ss, its] = await Promise.all([db.select().from(clients), db.select().from(sales), db.select().from(items)]);
  const seg = (Array.isArray(sp.seg) ? sp.seg[0] : sp.seg) ?? "";
  const orden = (Array.isArray(sp.orden) ? sp.orden[0] : sp.orden) ?? "valor";
  const now = Date.now();
  const all = cl.map((c) => {
    const mine = ss.filter((s) => s.client === c.id && !saleVoid(s));
    return { c, n: mine.length, total: mine.reduce((a, s) => a + saleNet(s), 0), last: mine.reduce((a, s) => Math.max(a, s.t), 0), holds: its.filter((i) => i.hold?.client === c.id).length, owed: mine.reduce((a, s) => a + s.pending, 0) };
  });
  const SEGS: [string, string, (r: (typeof all)[number]) => boolean][] = [
    ["saldo", "Con saldo por cobrar", (r) => r.owed > 0], ["apartado", "Con apartado", (r) => r.holds > 0], ["nuevos", "Compraron en 30 días", (r) => r.last > 0 && now - r.last <= 30 * 86400_000],
    ["inactivos", "Sin comprar hace 90+ días", (r) => r.last > 0 && now - r.last > 90 * 86400_000], ["sin", "Sin compras", (r) => r.n === 0], ["vip", "Más de 3 compras", (r) => r.n > 3],
  ];
  const cur = SEGS.find((x) => x[0] === seg);
  const SORT: Record<string, (a: (typeof all)[number], b: (typeof all)[number]) => number> = { valor: (a, b) => b.total - a.total, reciente: (a, b) => b.last - a.last, compras: (a, b) => b.n - a.n, nombre: (a, b) => a.c.name.localeCompare(b.c.name), saldo: (a, b) => b.owed - a.owed };
  const rows = all.filter((r) => (!q || `${r.c.name} ${r.c.doc} ${r.c.phone} ${r.c.email} ${r.c.address}`.toLowerCase().includes(q)) && (!cur || cur[2](r))).sort(SORT[orden] ?? SORT.valor);
  const qs = (patch: Record<string, string>) => { const p = new URLSearchParams(); const m = { q, seg, orden, ...patch }; for (const [k, v] of Object.entries(m)) if (v && !(k === "orden" && v === "valor")) p.set(k, v); const t = p.toString(); return t ? `/clientes?${t}` : "/clientes"; };
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${cl.length} registrados`} actions={<ClientForm />} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={qs({ seg: "" })} className={`btn sm ${!cur ? "primary" : ""}`}>Todos · {all.length}</Link>
        {SEGS.map(([k, l, f]) => <Link key={k} href={qs({ seg: k })} className={`btn sm ${seg === k ? "primary" : ""}`}>{l} · {all.filter(f).length}</Link>)}
      </div>
      <form className="card mb-4 flex flex-wrap items-center gap-3 p-3" action="/clientes">
        {seg && <input type="hidden" name="seg" value={seg} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, documento, celular o correo" aria-label="Buscar" className="min-w-[240px] flex-1" />
        <select name="orden" defaultValue={orden} aria-label="Ordenar"><option value="valor">Mayor valor comprado</option><option value="reciente">Compra más reciente</option><option value="compras">Más compras</option><option value="saldo">Mayor saldo por cobrar</option><option value="nombre">Nombre A–Z</option></select>
        <button className="btn">Aplicar</button>
        <a className="btn" href={`/api/clientes-csv?${new URLSearchParams({ q, seg }).toString()}`}>⬇️ Excel (CSV)</a>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>Aún no hay clientes. Se crean al vender o con el botón «Nuevo cliente».</Empty> : (
          <table className="t"><thead><tr><th>Cliente</th><th>Contacto</th><th className="num">Compras</th><th className="num">Total comprado</th><th>Última compra</th></tr></thead>
            <tbody>{rows.map(({ c, n, total, last, holds, owed }) => (
              <tr key={c.id} className="hover:bg-gray-bg/60"><td><Link href={`/clientes/${c.id}`} className="font-bold hover:underline">{c.name}</Link><div className="note">{c.doc}{holds ? ` · ${holds} apartado(s)` : ""}{owed > 0 && <> · <Link href={`/ventas?cliente=${c.id}&estado=pendiente`} className="text-red-t hover:underline">debe {fmt(owed)}</Link></>}</div></td><td>{c.phone}<div className="note">{c.email}</div></td><td className="num">{n}</td><td className="num"><b>{fmt(total)}</b></td><td>{last ? fdate(last) : "—"}</td></tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
