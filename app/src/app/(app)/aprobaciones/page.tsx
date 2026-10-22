import Link from "next/link";
import { getDb } from "@/db";
import { ApprovalButtons, ApproveAll } from "@/components/approval-buttons";
import { CondChip, Empty, PageHeader } from "@/components/ui";
import { fdt, fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { pendingList } from "@/server/approvals";
import { requireMe } from "@/server/session";

export const dynamic = "force-dynamic";

/** Bandeja de la propietaria: productos nuevos y eliminaciones que esperan su aprobación. */
export default async function AprobacionesPage() {
  const me = await requireMe("inv_view");
  const mine = me.perms.includes("approve");
  const db = await getDb();
  const list = await pendingList(db);
  const altas = list.filter((i) => i.approval?.kind === "alta"), bajas = list.filter((i) => i.approval?.kind === "baja");
  const Row = ({ it }: { it: (typeof list)[number] }) => (
    <li className="card p-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <Link href={`/inventario/${it.id}`} className="font-semibold hover:underline">{uname(it)}</Link> <CondChip cond={it.cond} />
        <div className="note">{it.id}{it.color ? ` · ${it.color}` : ""}{it.serial ? ` · ${it.serial}` : ""}{it.serial2 ? ` / ${it.serial2}` : ""}{it.track === "qty" ? ` · ${it.qty} uds.` : ""}</div>
        <div className="note">Precio {fmt(it.price)}{mine ? ` · costo ${fmt(it.cost)}` : ""} · {it.src}</div>
        <div className="note">Pidió <b>{it.approval!.name}</b> · {fdt(it.approval!.t)}{it.approval!.note ? ` · «${it.approval!.note}»` : ""}</div>
      </div>
      {mine ? <ApprovalButtons id={it.id} kind={it.approval!.kind} compact /> : <span className="chip warn">Espera a la propietaria</span>}
    </li>
  );
  return (
    <>
      <PageHeader title="Aprobaciones" subtitle={mine ? "Nada entra ni sale del inventario hasta que lo apruebes" : "Solicitudes que esperan a la propietaria"}
        actions={mine && list.length > 1 ? <ApproveAll count={list.length} /> : undefined} />
      {list.length === 0 ? <Empty>No hay nada pendiente.</Empty> : (
        <div className="space-y-6">
          {altas.length > 0 && <section><h2 className="font-semibold mb-2">🆕 Productos nuevos ({altas.length}) <span className="note">· no se pueden vender hasta aprobarlos</span></h2><ul className="space-y-2">{altas.map((it) => <Row key={it.id} it={it} />)}</ul></section>}
          {bajas.length > 0 && <section><h2 className="font-semibold mb-2">🗑️ Pidieron eliminar ({bajas.length}) <span className="note">· siguen en el inventario hasta aprobarlo</span></h2><ul className="space-y-2">{bajas.map((it) => <Row key={it.id} it={it} />)}</ul></section>}
        </div>
      )}
    </>
  );
}
