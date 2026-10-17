"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAbonoAction, extendHoldAction, releaseHoldAction } from "@/app/actions/sales";
import { METHODS } from "@/lib/catalog";
import { fmt } from "@/lib/format";

export function HoldActions({ itemId, balance }: { itemId: string; balance: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "abono" | "extend" | "release">("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(METHODS[0]);
  const [days, setDays] = useState("5");
  const [refund, setRefund] = useState("1");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { setMsg(""); setMode(""); setAmount(""); after?.(); router.refresh(); } else setMsg((r as { error: string }).error);
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn sm" onClick={() => setMode(mode === "abono" ? "" : "abono")}>💰 Abono</button>
        <Link className="btn sm primary" href={`/apartados/${itemId}`}>🧾 Recibo</Link>
        <Link className="btn sm primary" href={`/venta?hold=${itemId}`}>Cerrar como venta</Link>
        <button className="btn sm" onClick={() => setMode(mode === "extend" ? "" : "extend")}>Extender</button>
        <button className="btn sm danger" onClick={() => setMode(mode === "release" ? "" : "release")}>Liberar</button>
      </div>
      {mode === "abono" && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input type="number" min={1} max={balance} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Hasta ${fmt(balance)}`} aria-label="Valor del abono" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Método">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          <button className="btn primary" disabled={busy || !(+amount > 0)} onClick={() => run(() => addAbonoAction(itemId, +amount, method))}>Registrar</button>
        </div>
      )}
      {mode === "extend" && (
        <div className="flex gap-2"><select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Días">{[3, 5, 7, 15].map((d) => <option key={d} value={d}>{d} días</option>)}</select>
          <button className="btn primary" disabled={busy} onClick={() => run(() => extendHoldAction(itemId, +days))}>Extender</button></div>
      )}
      {mode === "release" && (
        <div className="flex flex-wrap gap-2"><select value={refund} onChange={(e) => setRefund(e.target.value)} aria-label="Qué pasa con el abono"><option value="1">Devolver el abono al cliente</option><option value="0">Retener el abono (política de la tienda)</option></select>
          <button className="btn danger" disabled={busy} onClick={() => run(() => releaseHoldAction(itemId, refund === "1"))}>Liberar apartado</button></div>
      )}
      {msg && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{msg}</p>}
    </div>
  );
}
