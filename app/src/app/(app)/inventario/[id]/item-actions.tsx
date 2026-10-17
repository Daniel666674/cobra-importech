"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteItemAction, reverifyAction, sendToWorkshopAction, updateItemAction } from "@/app/actions/inventory";
import { ItemForm, toPayload, type ItemFormValues } from "@/components/item-form";
import { OfficialPanel, type OfficialValue } from "@/components/official-panel";
import type { Cat } from "@/lib/catalog";

type Item = { id: string; cat: string; name: string; spec: string; color: string; cond: string; qty: number; cost: number; price: number; warr: number; batt: number | null; notes: string; min: number; serial: string; status: string; track: string; hasHold: boolean };
type Can = { sell: boolean; credit: boolean; edit: boolean; del: boolean; workshop: boolean; cost: boolean };

export function ItemActions({ item, sellable, can, warr }: { item: Item; sellable: boolean; can: Can; warr: Record<string, number> }) {
  const router = useRouter();
  const [panel, setPanel] = useState<"" | "edit" | "verify" | "shop">("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const [form, setForm] = useState<ItemFormValues>({ name: item.name, spec: item.spec, color: item.color, cond: item.cond, serial: item.serial, qty: String(item.qty), cost: String(item.cost), price: String(item.price), warr: String(item.warr), src: "", batt: item.batt == null ? "" : String(item.batt), notes: item.notes, min: String(item.min) });
  const [off, setOff] = useState<OfficialValue>({});
  const [job, setJob] = useState("");
  const [jobCost, setJobCost] = useState("");
  const isPhone = item.cat === "iPhone";
  const qty = item.track === "qty";

  const done = (r: { ok: boolean; error?: string }, okText: string) => {
    if (r.ok) { setMsg({ ok: true, t: okText }); setPanel(""); router.refresh(); } else setMsg({ ok: false, t: (r as { error: string }).error });
  };

  return (
    <aside className="space-y-3 self-start no-print">
      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Acciones</h2>
        {can.sell && sellable && <Link className="btn primary w-full" href={`/venta?item=${item.id}`}>🧾 Vender</Link>}
        {can.credit && sellable && !qty && <Link className="btn w-full" href={`/venta?item=${item.id}&mode=apartado`}>🔒 Apartar</Link>}
        {item.hasHold && can.sell && <Link className="btn primary w-full" href="/apartados">Ir al apartado</Link>}
        {isPhone && <button className="btn w-full" onClick={() => setPanel(panel === "verify" ? "" : "verify")}>🛡️ Verificar IMEI de nuevo</button>}
        {can.workshop && !qty && item.status !== "Vendido" && item.status !== "En taller" && <button className="btn w-full" onClick={() => setPanel(panel === "shop" ? "" : "shop")}>🔧 Enviar a taller</button>}
        {can.edit && <button className="btn w-full" onClick={() => setPanel(panel === "edit" ? "" : "edit")}>✏️ Editar</button>}
        {can.del && item.status !== "Vendido" && !item.hasHold && (
          <button className="btn danger w-full" disabled={busy} onClick={() => { if (confirm("¿Eliminar este producto? No se puede deshacer.")) start(async () => { const r = await deleteItemAction(item.id); if (r && !r.ok) setMsg({ ok: false, t: r.error }); }); }}>🗑️ Eliminar</button>
        )}
        {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      </div>

      {panel === "edit" && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Editar producto</h3>
          <ItemForm cat={item.cat as Cat} values={form} onChange={setForm} warrByCond={warr} hideSerial showCost={can.cost} />
          <button className="btn primary mt-3" disabled={busy} onClick={() => start(async () => done(await updateItemAction(item.id, { ...toPayload(item.cat as Cat, form), serial: undefined, cat: undefined, src: undefined }), "Cambios guardados"))}>Guardar cambios</button>
        </div>
      )}
      {panel === "verify" && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold">Re-verificar IMEI <span className="mono note">{item.serial}</span></h3>
          <OfficialPanel imei={item.serial} value={off} onChange={setOff} />
          <button className="btn primary" disabled={busy || !off.crc || !off.apple} onClick={() => start(async () => {
            const r = await reverifyAction(item.id, off);
            if (r.ok) { setMsg({ ok: !r.data.bad.length, t: r.data.bad.length ? "Novedades registradas: no vendas este equipo (" + r.data.bad.join(" · ") + ")" : "Verificación oficial registrada" }); setPanel(""); router.refresh(); }
            else setMsg({ ok: false, t: r.error });
          })}>Registrar verificación</button>
        </div>
      )}
      {panel === "shop" && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold">Enviar a taller</h3>
          <div><label className="lb" htmlFor="job">Trabajo</label><input id="job" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Cambio de batería" /></div>
          <div><label className="lb" htmlFor="jc">Costo estimado (COP)</label><input id="jc" type="number" min={0} step={10000} value={jobCost} onChange={(e) => setJobCost(e.target.value)} /></div>
          <button className="btn primary" disabled={busy || !job.trim()} onClick={() => start(async () => done(await sendToWorkshopAction({ item: item.id, job, cost: jobCost || 0 }), "Orden de taller creada"))}>Crear orden</button>
        </div>
      )}
    </aside>
  );
}
