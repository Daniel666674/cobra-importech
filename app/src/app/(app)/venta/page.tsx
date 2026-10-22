import { enabledMethods } from "@/lib/catalog";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, items, settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { isAvail } from "@/lib/items";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { PosClient, type PosItem } from "./pos-client";

export default async function Venta({ searchParams }: PageProps<"/venta">) {
  const me = await requireMe("sell");
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const db = await getDb();
  const [[cfg], all, cl] = await Promise.all([db.select().from(settings).limit(1), db.select().from(items), db.select().from(clients).orderBy(asc(clients.name))]);
  const holdId = one("hold");
  const list: PosItem[] = all
    .filter((i) => isAvail(i) || i.id === holdId)
    .map((i) => ({ id: i.id, cat: i.cat, name: i.name, spec: i.spec, color: i.color, cond: i.cond, serial: i.serial, qty: i.qty, price: i.price, cost: i.cost + (i.track === "qty" ? 0 : i.repairs), warr: i.warr, track: i.track, hold: i.id === holdId ? i.hold : null }));
  void eq;
  return (
    <>
      <PageHeader title="Nueva venta" subtitle="Elige productos, cliente y forma de pago" />
      <PosClient
        items={list}
        clients={cl.map((c) => ({ id: c.id, name: c.name, doc: c.doc, phone: c.phone }))}
        cfg={{ maxDisc: cfg.maxDisc, apartadoMinPct: cfg.apartadoMinPct, holdDays: cfg.holdDays, methods: enabledMethods(cfg), surcharges: cfg.surcharges ?? {} }}
        can={{ discount: hasPerm(me, "discount"), cost: hasPerm(me, "cost_view"), credit: hasPerm(me, "credit"), tradein: hasPerm(me, "tradein") }}
        warr={cfg.warr}
        start={{ item: one("item"), mode: one("mode") === "apartado" ? "apartado" : "contado", hold: holdId }}
      />
    </>
  );
}
