import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, orders } from "@/db/schema";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { ORDER_FLOW } from "@/server/ops";
import { requireMe } from "@/server/session";
import { OrderActions } from "./order-actions";

export default async function Taller() {
  await requireMe("workshop");
  const db = await getDb();
  const os = await db.select().from(orders);
  const its = new Map((await db.select().from(items).where(eq(items.status, "En taller"))).map((i) => [i.id, i]));
  return (
    <>
      <PageHeader title="Taller" subtitle="Reparaciones en curso. Para enviar un equipo, abre su ficha en Inventario." actions={<Link className="btn" href="/inventario">📦 Ir a inventario</Link>} />
      {os.length === 0 ? <div className="card"><Empty>No hay órdenes de taller abiertas.</Empty></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ORDER_FLOW.map((st) => (
            <section key={st} className="space-y-2">
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-t3">{st} · {os.filter((o) => o.st === st).length}</h2>
              {os.filter((o) => o.st === st).map((o) => { const it = o.item ? its.get(o.item) : null; return (
                <div key={o.id} className="card p-3 space-y-1.5">
                  <div className="flex justify-between gap-2"><b>{o.id}</b><Chip tone="gray">{o.tech}</Chip></div>
                  {it && <Link href={`/inventario/${it.id}`} className="block font-semibold hover:underline">{uname(it)}</Link>}
                  <div className="text-t2">{o.job}</div>
                  <div className="note">Costo {fmt(o.cost)} · {fdate(o.t)}</div>
                  <OrderActions id={o.id} last={st === "Listo"} />
                </div>); })}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
