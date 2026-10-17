import Link from "next/link";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmt } from "@/lib/format";
import { hasPerm } from "@/server/auth";
import { reportData } from "@/server/reports";
import { requireMe } from "@/server/session";

export default async function Reportes({ searchParams }: PageProps<"/reportes">) {
  const me = await requireMe("reports");
  const sp = await searchParams;
  const days = [7, 30, 90, 365].includes(+(Array.isArray(sp.d) ? sp.d[0] : sp.d ?? 30)) ? +(Array.isArray(sp.d) ? sp.d[0] : sp.d ?? 30) : 30;
  const db = await getDb();
  const r = await reportData(db, days);
  const un = new Map((await db.select().from(users)).map((u) => [u.id, u.name]));
  const cost = hasPerm(me, "cost_view");
  const max = Math.max(1, ...r.byCat.map((c) => c.total));
  return (
    <>
      <PageHeader title="Reportes" subtitle={`Últimos ${days} días`} actions={<div className="flex gap-1">{[7, 30, 90, 365].map((d) => <Link key={d} href={`/reportes?d=${d}`} className={`btn sm ${d === days ? "primary" : ""}`}>{d === 365 ? "1 año" : d + " d"}</Link>)}</div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([["Ventas", fmt(r.total)], ["Comprobantes", String(r.count)], ...(cost ? [["Margen", fmt(r.margin)]] : []), ["Ticket promedio", fmt(r.count ? r.total / r.count : 0)]] as [string, string][]).map(([k, v]) => (
          <div key={k} className="card p-4"><div className="note">{k}</div><div className="mt-1 text-xl font-bold tabular-nums">{v}</div></div>))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h2 className="font-semibold mb-3">Ventas por categoría</h2>
          {r.byCat.length === 0 ? <p className="note">Sin ventas en el período.</p> : <ul className="space-y-3">{r.byCat.map((c) => (
            <li key={c.cat}><div className="flex justify-between text-[13px]"><span>{c.cat} <span className="note">· {c.units} uds.</span></span><b className="tabular-nums">{fmt(c.total)}</b></div>
              <div className="mt-1 h-2 rounded-full bg-gray-bg"><div className="h-full rounded-full bg-accent" style={{ width: (c.total / max) * 100 + "%" }} /></div>
              {cost && <div className="note mt-0.5">Margen {fmt(c.margin)} ({c.total ? Math.round((c.margin / c.total) * 100) : 0}%)</div>}</li>))}</ul>}</div>
        <div className="space-y-4">
          <div className="card p-4"><h2 className="font-semibold mb-3">Por método de pago</h2>{r.byMethod.length === 0 ? <p className="note">—</p> : <ul className="space-y-1.5">{r.byMethod.map(([m, v]) => <li key={m} className="flex justify-between"><span>{m}</span><b className="tabular-nums">{fmt(v)}</b></li>)}</ul>}</div>
          <div className="card p-4"><h2 className="font-semibold mb-3">Por vendedor</h2>{r.byUser.length === 0 ? <p className="note">—</p> : <ul className="space-y-1.5">{r.byUser.map(([u, v]) => <li key={u} className="flex justify-between"><span>{un.get(u) ?? u}</span><b className="tabular-nums">{fmt(v)}</b></li>)}</ul>}</div>
        </div>
      </div>
    </>
  );
}
