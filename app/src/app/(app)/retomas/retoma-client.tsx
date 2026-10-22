"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createItemAction } from "@/app/actions/inventory";
import { TradeinForm } from "@/components/tradein-form";

/** Retoma suelta: la tienda compra el equipo y lo ingresa al inventario. */
export function RetomaClient({ warr }: { warr: Record<string, number> }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  return (
    <TradeinForm warr={warr} mode="compra" busy={busy} error={err} onAccept={(p) => start(async () => {
      setErr("");
      const r = await createItemAction(p.item, p.official, p.ownerApproved);
      if (!r.ok) return setErr(r.error);
      router.push(`/inventario/${r.data}`);
    })} />
  );
}
