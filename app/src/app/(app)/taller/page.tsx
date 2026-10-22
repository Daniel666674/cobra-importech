import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { items, orders } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { uname } from "@/lib/items";
import { ORDER_FLOW } from "@/server/ops";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { Board, type Card } from "./board";

export const dynamic = "force-dynamic";

export default async function Taller() {
  const me = await requireMe("workshop");
  const db = await getDb();
  const os = await db.select().from(orders);
  const ids = os.map((o) => o.item).filter(Boolean) as string[];
  const its = new Map((ids.length ? await db.select().from(items).where(inArray(items.id, ids)) : []).map((i) => [i.id, i]));
  const canCost = hasPerm(me, "cost_view");
  const cards: Card[] = os.map((o) => {
    const it = o.item ? its.get(o.item) : undefined;
    return {
      id: o.id, st: o.st, job: o.job, tech: o.tech, notes: o.notes, cost: o.cost, t: o.t, stT: o.stT || o.t,
      item: it ? { id: it.id, name: uname(it), serial: it.serial, price: it.price, base: canCost ? it.cost + it.repairs : null } : null,
    };
  });
  return (
    <>
      <PageHeader title="Taller" subtitle="Arrastra cada orden a su etapa. Para enviar un equipo, abre su ficha en Inventario → «Enviar a taller»." actions={<Link className="btn" href="/inventario">📦 Ir a inventario</Link>} />
      <Board stages={[...ORDER_FLOW]} cards={cards} canCost={canCost} />
    </>
  );
}
