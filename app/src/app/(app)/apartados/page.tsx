import Link from "next/link";
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, holdHistory, items, settings } from "@/db/schema";
import { enabledMethods } from "@/lib/catalog";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { holdBal, holdLeft } from "@/lib/hold";
import { uname } from "@/lib/items";
import { requireMe } from "@/server/session";
import { waLink } from "@/lib/whatsapp";
import { HoldActions } from "./hold-actions";

export default async function Apartados({ searchParams }: PageProps<"/apartados">) {
  await requireMe("credit");
  const sp = await searchParams;
  const f = (Array.isArray(sp.f) ? sp.f[0] : sp.f) ?? "";
  const orden = (Array.isArray(sp.o) ? sp.o[0] : sp.o) ?? "vence";
  const cliente = (Array.isArray(sp.cliente) ? sp.cliente[0] : sp.cliente) ?? "";
  const db = await getDb();
  const [its, cl, hist, [cfg]] = await Promise.all([
    db.select().from(items).where(isNotNull(items.hold)),
    db.select().from(clients),
    db.select().from(holdHistory).orderBy(desc(holdHistory.t)).limit(15),
    db.select().from(settings).limit(1),
  ]);
  const methods = enabledMethods(cfg);
  const cn = new Map(cl.map((c) => [c.id, c]));
  const all = its.filter((i) => i.hold);
  const B: [string, string, (i: (typeof all)[number]) => boolean][] = [["vencidos", "Vencidos", (i) => holdLeft(i.hold!) < 0], ["pronto", "Vencen en 2 días o menos", (i) => holdLeft(i.hold!) >= 0 && holdLeft(i.hold!) <= 2], ["semana", "Vencen en la semana", (i) => holdLeft(i.hold!) >= 0 && holdLeft(i.hold!) <= 7], ["casi", "Casi pagados (80 %+)", (i) => i.price > 0 && i.hold!.abono / i.price >= 0.8]];
  const cur = B.find((b) => b[0] === f);
  const rows = all.filter((i) => (!cur || cur[2](i)) && (!cliente || i.hold!.client === cliente)).sort((a, b) => (orden === "saldo" ? holdBal(b.price, b.hold!) - holdBal(a.price, a.hold!) : orden === "cliente" ? (cn.get(a.hold!.client)?.name ?? "").localeCompare(cn.get(b.hold!.client)?.name ?? "") : a.hold!.expires - b.hold!.expires));
  const qs = (p: Record<string, string>) => { const m = new URLSearchParams(); for (const [k, v] of Object.entries({ f, o: orden, cliente, ...p })) if (v && !(k === "o" && v === "vence")) m.set(k, v); const t = m.toString(); return t ? `/apartados?${t}` : "/apartados"; };
  void eq;
  const total = rows.reduce((a, i) => a + holdBal(i.price, i.hold!), 0);
  return (
    <>
      <PageHeader title="Apartados" subtitle="Equipos separados con abono. Se cierran como venta o se liberan." actions={<Link className="btn primary" href="/venta?mode=apartado">🔒 Nuevo apartado</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link href={qs({ f: "" })} className={`btn sm ${!cur ? "primary" : ""}`}>Todos · {all.length}</Link>
        {B.map(([k, l, fn]) => <Link key={k} href={qs({ f: k })} className={`btn sm ${f === k ? "primary" : ""}`}>{l} · {all.filter(fn).length}</Link>)}
        <span className="note ml-2">Orden:</span>
        {([["vence", "Vencimiento"], ["saldo", "Mayor saldo"], ["cliente", "Cliente"]] as const).map(([k, l]) => <Link key={k} href={qs({ o: k })} className={`btn sm ${orden === k ? "primary" : ""}`}>{l}</Link>)}
        {cliente && <Link href={qs({ cliente: "" })} className="chip info">Cliente: <b>{cn.get(cliente)?.name ?? cliente}</b> ✕</Link>}
        <span className="note ml-auto">Saldo por cobrar: <b>{fmt(total)}</b></span>
      </div>
      {rows.length === 0 ? <div className="card"><Empty>No hay apartados con este filtro.</Empty></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((it) => {
            const h = it.hold!;
            const left = holdLeft(h);
            const pct = Math.min(100, Math.round((h.abono / it.price) * 100));
            const c = cn.get(h.client);
            return (
              <div key={it.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><Link href={`/inventario/${it.id}`} className="font-semibold hover:underline">{uname(it)}</Link><div className="note">{h.no} · {c ? <Link href={`/clientes/${h.client}`} className="hover:underline">{c.name}</Link> : "—"}{c?.phone ? ` · ${c.phone}` : ""}{c && <> · <Link href={qs({ cliente: h.client })} className="hover:underline">sus apartados</Link></>}</div></div>
                  <Chip tone={left < 0 ? "bad" : left <= 2 ? "warn" : "info"}>{left < 0 ? `Vencido hace ${-left} d` : left === 0 ? "Vence hoy" : `Vence en ${left} d`}</Chip>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-bg"><div className="h-full bg-accent" style={{ width: pct + "%" }} /></div>
                  <div className="mt-1.5 flex justify-between text-[13px]"><span>Abonado <b>{fmt(h.abono)}</b></span><span>Saldo <b>{fmt(holdBal(it.price, h))}</b> de {fmt(it.price)}</span></div>
                  <div className="note">{h.pays.length} abono(s) · vence {fdate(h.expires)}</div>
                </div>
                <HoldActions itemId={it.id} balance={holdBal(it.price, h)} methods={methods} expires={h.expires} />
                {c?.phone && <a className="btn sm" target="_blank" rel="noopener noreferrer" href={waLink(c.phone, `Hola ${c.name.split(" ")[0]}, te recordamos que tu apartado ${h.no} (${uname(it)}) tiene un saldo de ${fmt(holdBal(it.price, h))} y vence el ${fdate(h.expires)}.`)}>💬 Recordar por WhatsApp</a>}
              </div>
            );
          })}
        </div>
      )}
      {hist.length > 0 && (
        <div className="card mt-5 overflow-x-auto">
          <h2 className="p-4 pb-2 font-semibold">Apartados cerrados</h2>
          <table className="t"><thead><tr><th>Fecha</th><th>Equipo</th><th>Cliente</th><th className="num">Abonado</th><th>Resultado</th></tr></thead>
            <tbody>{hist.map((h) => <tr key={h.id}><td>{fdate(h.t)}</td><td>{h.item}</td><td>{h.client}</td><td className="num">{fmt(h.abono)}</td><td>{h.outcome}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
