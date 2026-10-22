"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveAction, approveAllAction, rejectAction } from "@/app/actions/inventory";

/** Aprobar / rechazar una solicitud (producto nuevo o eliminación). Solo lo ve la propietaria. */
export function ApprovalButtons({ id, kind, compact }: { id: string; kind: "alta" | "baja"; compact?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error ?? "Error"); else router.refresh(); });
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2"}>
      <button className="btn primary sm" disabled={busy} onClick={() => run(() => approveAction(id))}>{kind === "alta" ? "✅ Aprobar ingreso" : "✅ Aprobar eliminación"}</button>
      <button className="btn sm" disabled={busy} onClick={() => {
        const note = prompt(kind === "alta" ? "¿Por qué no se aprueba? (el producto no entrará al inventario)" : "¿Por qué no se elimina? (opcional)", "");
        if (note === null) return;
        run(() => rejectAction(id, note));
      }}>{kind === "alta" ? "⛔ Rechazar (no entra)" : "↩️ No eliminar"}</button>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
    </div>
  );
}

export function ApproveAll({ count }: { count: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button className="btn primary" disabled={busy} onClick={() => {
      if (!confirm(`¿Aprobar las ${count} solicitudes? Los productos nuevos quedan a la venta y los que pidieron eliminar se eliminan.`)) return;
      start(async () => { const r = await approveAllAction(); if (!r.ok) alert(r.error); router.refresh(); });
    }}>{busy ? "Aprobando…" : `✅ Aprobar todo (${count})`}</button>
  );
}
