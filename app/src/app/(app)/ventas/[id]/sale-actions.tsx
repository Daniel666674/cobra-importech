"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSaleAction, openClaimAction, refundAction, renameSaleAction } from "@/app/actions/sales";

const REASONS = ["Falla del producto", "Cliente se arrepintió", "Error de facturación", "Otro"];

export function SaleActions({ sale, canRefund, canDelete }: { sale: { id: string; no: string; lines: { name: string; qty: number; ret: number }[] }; canRefund: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "refund" | "claim" | "rename">("");
  const [newNo, setNewNo] = useState(sale.no);
  const [ret, setRet] = useState<number[]>(sale.lines.map(() => 0));
  const [reason, setReason] = useState(REASONS[0]);
  const [line, setLine] = useState(0);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const refundable = sale.lines.some((l) => l.qty - l.ret > 0);
  return (
    <div className="no-print mx-auto mt-5 max-w-[820px] space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => setMode(mode === "claim" ? "" : "claim")}>🛡️ Abrir reclamo de garantía</button>
        {canDelete && <button className="btn" onClick={() => setMode(mode === "rename" ? "" : "rename")}>✏️ Cambiar número</button>}
        {canDelete && <button className="btn danger" disabled={busy} onClick={() => { if (confirm(`¿Borrar la venta ${sale.no}? Los equipos vuelven al inventario y la venta desaparece. No se puede deshacer.`)) start(async () => { const r = await deleteSaleAction(sale.id); if (r.ok) router.push("/ventas"); else setMsg({ ok: false, t: r.error }); }); }}>🗑️ Borrar venta</button>}
        {canRefund && refundable && <button className="btn danger" onClick={() => setMode(mode === "refund" ? "" : "refund")}>↩️ Devolución</button>}
      </div>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      {mode === "rename" && (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold">Número de comprobante</h3>
          <div><label className="lb" htmlFor="rn-no">Número (letras, números y guion)</label><input id="rn-no" value={newNo} onChange={(e) => setNewNo(e.target.value)} /></div>
          <button className="btn primary" disabled={busy || !newNo.trim() || newNo.trim() === sale.no} onClick={() => start(async () => { const r = await renameSaleAction(sale.id, newNo); if (r.ok) { setMsg({ ok: true, t: `Ahora es ${r.data}` }); setMode(""); router.refresh(); } else setMsg({ ok: false, t: r.error }); })}>Guardar número</button>
        </div>
      )}
      {mode === "refund" && (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold">Devolución · {sale.no}</h3>
          {sale.lines.map((l, i) => l.qty - l.ret > 0 && (
            <div key={i} className="grid grid-cols-[1fr_90px] items-end gap-3">
              <div><b>{l.name}</b><div className="note">Vendido ×{l.qty}</div></div>
              <div><label className="lb" htmlFor={`rf-${i}`}>Devolver</label><input id={`rf-${i}`} type="number" min={0} max={l.qty - l.ret} value={ret[i]} onChange={(e) => setRet(ret.map((x, j) => (j === i ? +e.target.value : x)))} /></div>
            </div>
          ))}
          <div><label className="lb" htmlFor="rf-r">Motivo</label><select id="rf-r" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <button className="btn danger" disabled={busy || !ret.some((x) => x > 0)} onClick={() => start(async () => { const r = await refundAction(sale.id, ret, reason); if (r.ok) { setMsg({ ok: true, t: `Devolución registrada: ${r.data.n} producto(s)` }); setMode(""); router.refresh(); } else setMsg({ ok: false, t: r.error }); })}>Confirmar devolución</button>
        </div>
      )}
      {mode === "claim" && (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold">Reclamo de garantía</h3>
          <div><label className="lb" htmlFor="cl-l">Producto</label><select id="cl-l" value={line} onChange={(e) => setLine(+e.target.value)}>{sale.lines.map((l, i) => <option key={i} value={i}>{l.name}</option>)}</select></div>
          <div><label className="lb" htmlFor="cl-n">¿Cuál es el problema?</label><input id="cl-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. La batería se descarga rápido" /></div>
          <button className="btn primary" disabled={busy || !note.trim()} onClick={() => start(async () => { const r = await openClaimAction(sale.id, line, note); if (r.ok) { setMsg({ ok: true, t: "Reclamo registrado en el historial del producto" }); setMode(""); setNote(""); } else setMsg({ ok: false, t: r.error }); })}>Abrir reclamo</button>
        </div>
      )}
    </div>
  );
}
