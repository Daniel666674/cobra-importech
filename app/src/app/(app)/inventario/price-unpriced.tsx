"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { priceUnpricedAction } from "@/app/actions/inventory";
import { MoneyInput } from "@/components/money-input";

/** Pone precio de una vez a los productos sin precio: costo + ganancia en pesos. */
export function PriceUnpriced({ count }: { count: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [gain, setGain] = useState("");
  return (
    <div className="flex items-center gap-2">
      <MoneyInput className="!w-36 !py-1.5" placeholder="Ganancia COP" aria-label="Ganancia en pesos para los sin precio" value={gain} onChange={(x) => setGain(x)} />
      <button className="btn" disabled={busy || !(+gain > 0)} onClick={() => {
        if (!confirm(`¿Poner precio a ${count} producto(s) sin precio: costo + $${(+gain).toLocaleString("es-CO")}?`)) return;
        start(async () => { const r = await priceUnpricedAction(+gain); if (!r.ok) alert(r.error); setGain(""); router.refresh(); });
      }}>{busy ? "Guardando…" : `🏷️ Precio a ${count} sin precio`}</button>
    </div>
  );
}
