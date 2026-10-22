import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { Chip, CondChip, PageHeader, StatusChip } from "@/components/ui";
import { OFFICIAL_LABEL, OFFICIAL_TEXT } from "@/lib/imei";
import { fdatey, fdt, fmt } from "@/lib/format";
import { holdBal, holdLeft } from "@/lib/hold";
import { daysIn, isAvail, isQty, itemState, uname } from "@/lib/items";
import { hasPerm } from "@/server/auth";
import { getItem } from "@/server/inventory";
import { requireMe } from "@/server/session";
import { ItemActions } from "./item-actions";
import { ApprovalButtons } from "@/components/approval-buttons";

const TONE: Record<string, string> = { ok: "bg-green-t", warn: "bg-amber-t", bad: "bg-red-t", "": "bg-t3" };

export default async function ItemPage({ params }: PageProps<"/inventario/[id]">) {
  const me = await requireMe("inv_view");
  const { id } = await params;
  const db = await getDb();
  const data = await getItem(db, id);
  if (!data) notFound();
  const { item: it, events } = data;
  const [cfg] = await db.select().from(settings).limit(1);
  const canCost = hasPerm(me, "cost_view");
  const hold = it.hold;
  return (
    <>
      <p className="mb-2 no-print"><Link href="/inventario" className="note hover:underline">← Inventario</Link></p>
      <PageHeader title={uname(it)} subtitle={`${it.sku}${it.color ? " · " + it.color : ""}`}
        actions={<><StatusChip status={itemState(it)} /><CondChip cond={it.cond} />{it.approval && <span className="chip warn">🕒 {it.approval.kind === "alta" ? "Por aprobar" : "Eliminación pedida"}</span>}</>} />
      {it.approval && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 border-amber-t/40 bg-amber-bg/40 p-3">
          <p className="flex-1 min-w-[220px] text-[13.5px]">
            {it.approval.kind === "alta"
              ? <>🕒 <b>Producto nuevo por aprobar</b>: lo ingresó {it.approval.name} el {fdt(it.approval.t)}. No se puede vender hasta que la propietaria lo apruebe.</>
              : <>🕒 <b>{it.approval.name} pidió eliminarlo</b> el {fdt(it.approval.t)}{it.approval.note ? ` («${it.approval.note}»)` : ""}. Sigue en el inventario hasta que la propietaria lo apruebe.</>}
          </p>
          {me.perms.includes("approve") && <ApprovalButtons id={it.id} kind={it.approval.kind} compact />}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <div className="card p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {([
                ["Precio de venta", fmt(it.price)],
                ...(canCost ? [["Costo real", fmt(it.cost + it.repairs)], ["Ganancia", fmt(it.price - it.cost - it.repairs)]] : []),
                ["Garantía", it.warr + " meses"],
                ["Recibido", `${fdatey(it.acq)} (${daysIn(it)} días)`],
                [isQty(it) ? "Cantidad" : it.cat === "iPhone" ? "IMEI" : "Serie", isQty(it) ? String(it.qty) : it.serial || "—"],
                ...(it.serial2 ? [["IMEI 2", it.serial2]] : []),
                ...(it.batt != null ? [["Batería", it.batt + "%"]] : []),
                ["Origen", it.src || "—"],
                ["Sede", it.branch],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><dt className="note">{k}</dt><dd className="font-semibold mono-ish break-all">{v}</dd></div>
              ))}
            </dl>
            {it.notes && <p className="mt-3 text-t2">{it.notes}</p>}
          </div>
          {hold && (
            <div className="card p-4">
              <h2 className="font-semibold mb-1">🔒 Apartado {hold.no}</h2>
              <p className="text-t2">Abonado {fmt(hold.abono)} · saldo {fmt(holdBal(it.price, hold))} · {holdLeft(hold) >= 0 ? `vence en ${holdLeft(hold)} día(s)` : "vencido"}</p>
              <Link href="/apartados" className="btn sm mt-3">Ver apartados</Link>
            </div>
          )}
          {it.cat === "iPhone" && (
            <div className="card p-4">
              <h2 className="font-semibold mb-2">🛡️ Verificación oficial</h2>
              {it.imeiCheck ? (
                <ul className="space-y-1.5">
                  {(["crc", "apple"] as const).map((k) => (
                    <li key={k} className="flex flex-wrap items-center gap-2">
                      <Chip tone={it.imeiCheck![k].r === "clean" ? "ok" : "bad"}>{OFFICIAL_TEXT[it.imeiCheck![k].r]}</Chip>
                      <span>{OFFICIAL_LABEL[k]}</span>
                      <span className="note">· {it.imeiCheck![k].name} · {fdt(it.imeiCheck![k].t)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="note">Sin verificación oficial registrada.</p>}
            </div>
          )}
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Historial</h2>
            <ol className="relative ml-2 space-y-4 border-l border-line pl-5">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${TONE[e.tone] ?? TONE[""]}`} />
                  <b className="block text-[13.5px]">{e.title}</b>
                  {e.detail && <span className="text-t2 text-[13px]">{e.detail}</span>}
                  <span className="note block">{fdt(e.t)} · {e.by}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <ItemActions
          item={{ id: it.id, cat: it.cat, name: it.name, spec: it.spec, color: it.color, cond: it.cond, qty: it.qty, cost: it.cost, price: it.price, warr: it.warr, batt: it.batt, notes: it.notes, min: it.min, serial2: it.serial2, serial: it.serial, status: it.status, pendingDel: it.approval?.kind === "baja", track: it.track, hasHold: !!it.hold }}
          sellable={isAvail(it)}
          can={{ sell: hasPerm(me, "sell"), credit: hasPerm(me, "credit"), edit: hasPerm(me, "inv_edit"), del: hasPerm(me, "inv_delete"), workshop: hasPerm(me, "workshop"), cost: canCost, approve: me.perms.includes("approve") }}
          warr={cfg.warr}
        />
      </div>
    </>
  );
}
