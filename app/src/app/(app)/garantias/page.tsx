import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, sales } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fdatey } from "@/lib/format";
import { lineNet, warrEnd, warrLeft } from "@/lib/sales";
import { requireMe } from "@/server/session";
import { ClaimActions } from "./claim-actions";

export default async function Garantias({ searchParams }: PageProps<"/garantias">) {
  await requireMe("sell");
  const sp = await searchParams;
  const f = (Array.isArray(sp.f) ? sp.f[0] : sp.f) ?? "vigente";
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").toLowerCase().replace(/\s+/g, "");
  const db = await getDb();
  const [cl, ss] = await Promise.all([db.select().from(claims).orderBy(desc(claims.t)), db.select().from(sales).orderBy(desc(sales.t))]);
  const sm = new Map(ss.map((s) => [s.id, s]));
  const open = cl.filter((c) => c.status !== "Resuelto");
  const rows = ss.flatMap((s) => s.lines.map((l, i) => ({ s, l, i }))).filter(({ l }) => lineNet(l) > 0 && l.warr > 0).map((x) => ({ ...x, left: warrLeft(x.s.t, x.l) }))
    .filter((x) => (q ? `${x.l.serial}${x.l.name}${x.s.no}`.toLowerCase().replace(/\s+/g, "").includes(q) : f === "vigente" ? x.left > 0 : f === "por-vencer" ? x.left > 0 && x.left <= 30 : x.left <= 0)).sort((a, b) => a.left - b.left).slice(0, 80);
  return (
    <>
      <PageHeader title="Garantías" subtitle="Cobertura de cada producto vendido y reclamos abiertos" />
      {cl.length > 0 && (
        <div className="card mb-4 overflow-x-auto">
          <h2 className="p-4 pb-2 font-semibold">Reclamos {open.length ? `· ${open.length} abierto(s)` : ""}</h2>
          <table className="t"><thead><tr><th>Reclamo</th><th>Producto</th><th>Problema</th><th>Estado</th><th /></tr></thead>
            <tbody>{cl.map((c) => { const s = sm.get(c.sale); const l = s?.lines[c.line]; return (
              <tr key={c.id}><td><b>{c.id}</b><div className="note">{fdate(c.t)} · <Link className="hover:underline" href={`/ventas/${c.sale}`}>{s?.no}</Link></div></td><td>{l?.name}</td><td>{c.note}</td>
                <td>{c.status === "Resuelto" ? <Chip tone="ok">Resuelto</Chip> : <Chip tone="warn">Abierto</Chip>}{c.resolution && <div className="note">{c.resolution}</div>}</td>
                <td>{c.status !== "Resuelto" && <ClaimActions id={c.id} />}</td></tr>); })}</tbody></table>
        </div>
      )}
      <form className="card mb-3 p-3" action="/garantias"><input name="q" defaultValue={q} placeholder="Buscar por IMEI, serie, producto o comprobante (incluye ventas importadas)" aria-label="Buscar garantía" /></form>
      <div className="mb-3 flex gap-2">{([["vigente", "Vigentes"], ["por-vencer", "Por vencer (30 d)"], ["vencida", "Vencidas"]] as const).map(([k, l]) => <Link key={k} href={`/garantias?f=${k}`} className={`btn sm ${f === k ? "primary" : ""}`}>{l}</Link>)}</div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No hay garantías en esta vista.</Empty> : (
          <table className="t"><thead><tr><th>Producto</th><th>Venta</th><th>IMEI / serie</th><th>Vence</th><th className="num">Días</th></tr></thead>
            <tbody>{rows.map(({ s, l, i, left }) => (
              <tr key={s.id + i}><td><b>{l.name}</b><div className="note">{l.cond}</div></td><td><Link className="hover:underline" href={`/ventas/${s.id}`}>{s.no}</Link></td><td className="mono text-[12px]">{l.serial || "—"}</td><td>{fdatey(warrEnd(s.t, l))}</td>
                <td className="num"><Chip tone={left <= 0 ? "bad" : left <= 30 ? "warn" : "ok"}>{left <= 0 ? "Vencida" : left + " d"}</Chip></td></tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
