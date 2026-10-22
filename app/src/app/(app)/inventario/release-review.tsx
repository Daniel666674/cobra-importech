"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { releaseAllReviewAction } from "@/app/actions/inventory";

/** Botón para pasar a vitrina todos los equipos «En revisión» (solo administradores). */
export function ReleaseReview({ count }: { count: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button className="btn" disabled={busy} onClick={() => {
      if (!confirm(`¿Pasar los ${count} equipos «En revisión» a vitrina? Confirma que ya verificaste su IMEI (CRC y Apple). Quedará anotado que lo aprobaste tú.`)) return;
      start(async () => { const r = await releaseAllReviewAction(); if (!r.ok) alert(r.error); router.refresh(); });
    }}>{busy ? "Pasando…" : `✅ Pasar ${count} a vitrina`}</button>
  );
}
