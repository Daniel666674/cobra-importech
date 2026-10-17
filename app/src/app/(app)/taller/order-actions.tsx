"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { advanceOrderAction, cancelOrderAction } from "@/app/actions/ops";

export function OrderActions({ id, last }: { id: string; last: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn sm primary" disabled={busy} onClick={() => start(async () => { await advanceOrderAction(id); router.refresh(); })}>{last ? "Entregar a vitrina" : "Avanzar ›"}</button>
      <button className="btn sm" disabled={busy} onClick={() => { if (confirm("¿Cancelar la orden? El equipo vuelve a su estado anterior.")) start(async () => { await cancelOrderAction(id); router.refresh(); }); }}>Cancelar</button>
    </div>
  );
}
