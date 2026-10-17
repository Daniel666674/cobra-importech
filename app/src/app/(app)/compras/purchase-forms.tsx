"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPurchaseAction, receivePurchaseAction } from "@/app/actions/ops";
import { CATS, CONDS } from "@/lib/catalog";
import { fmt } from "@/lib/format";
import { landed } from "@/lib/landed";

export function PurchaseForm({ trm }: { trm: number }) {
  const router = useRouter();
  const [v, setV] = useState({ sup: "", desc: "", qty: "1", usd: "", trm: String(trm), freight: "1.5", arancel: "0", iva: "19" });
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const L = landed({ usd: +v.usd || 0, qty: Math.max(1, +v.qty || 1), trm: +v.trm || 0, freight: +v.freight || 0, arancel: +v.arancel || 0, iva: +v.iva || 0 });
  const f = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="lb" htmlFor={"po-" + k}>{label}</label><input id={"po-" + k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} /></div>
  );
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-3">Registrar compra</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        {f("sup", "Proveedor")}{f("desc", "Descripción")}{f("qty", "Unidades", { type: "number", min: 1 })}{f("usd", "USD por unidad", { type: "number", min: 0 })}
        {f("trm", "TRM (COP/USD)", { type: "number" })}{f("freight", "Flete y seguro (%)", { type: "number", step: 0.1 })}{f("arancel", "Arancel (%)", { type: "number", step: 0.1 })}{f("iva", "IVA (%)", { type: "number" })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-t2">Costo real por unidad: <b className="tabular-nums">{fmt(L.unit)}</b> · lote: <b className="tabular-nums">{fmt(L.total)}</b></p>
        <button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await createPurchaseAction({ ...v, st: "En tránsito" }); if (r.ok) { setErr(""); setV({ ...v, sup: "", desc: "", usd: "" }); router.refresh(); } else setErr(r.error); })}>Registrar compra</button>
      </div>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal mt-3">{err}</p>}
    </div>
  );
}

export function ReceiveForm({ po }: { po: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ cat: "iPhone", name: "", spec: "", color: "", cond: "Nuevo", price: "", qty: "1", serials: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  if (!open) return <button className="btn sm primary" onClick={() => setOpen(true)}>Recibir</button>;
  const qtyTrack = v.cat === "AirPods" || v.cat === "Accesorios";
  return (
    <div className="card fixed inset-x-3 top-16 z-30 mx-auto max-w-lg space-y-2 p-4 shadow-xl">
      <h3 className="font-semibold">Recibir {po}</h3>
      <div className="grid grid-cols-2 gap-2">
        <select value={v.cat} onChange={(e) => setV({ ...v, cat: e.target.value })} aria-label="Categoría">{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={v.cond} onChange={(e) => setV({ ...v, cond: e.target.value })} aria-label="Condición">{CONDS.map((c) => <option key={c}>{c}</option>)}</select>
        <input className="col-span-2" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Producto (ej. iPhone 17 Pro Max)" aria-label="Producto" />
        <input value={v.spec} onChange={(e) => setV({ ...v, spec: e.target.value })} placeholder="Capacidad / detalle" aria-label="Detalle" />
        <input value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} placeholder="Color" aria-label="Color" />
        <input type="number" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="Precio de venta (vacío = costo + 20%)" aria-label="Precio" className="col-span-2" />
        {qtyTrack ? <input type="number" min={1} value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} placeholder="Cantidad" aria-label="Cantidad" /> :
          <textarea className="col-span-2" rows={4} value={v.serials} onChange={(e) => setV({ ...v, serials: e.target.value })} placeholder="Pega los IMEI o seriales (uno por línea)" aria-label="IMEI o seriales" />}
      </div>
      {v.cat === "iPhone" && <p className="note">Los iPhone entran «En revisión» y no se pueden vender hasta registrar su verificación oficial (CRC y Apple) en la ficha de cada equipo.</p>}
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      <div className="flex gap-2">
        <button className="btn primary" disabled={busy || !v.name} onClick={() => start(async () => {
          const r = await receivePurchaseAction(po, { ...v, serials: v.serials.split(/[\s,;]+/).filter(Boolean) });
          if (r.ok) {
            if (!r.data.bad.length) { router.push(v.cat === "iPhone" ? "/inventario?status=En%20revisi%C3%B3n" : "/inventario"); return; }
            setMsg({ ok: false, t: `${r.data.ok.length} ingresado(s) · ${r.data.bad.length} bloqueado(s): ` + r.data.bad.map((b) => `••${b[0].slice(-6)} ${b[1]}`).join("; ") });
            router.refresh();
          }
          else setMsg({ ok: false, t: r.error });
        })}>Ingresar al inventario</button>
        <button className="btn" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
    </div>
  );
}
