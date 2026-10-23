"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAbonoAction, extendHoldAction, releaseHoldAction } from "@/app/actions/sales";
import { fmt } from "@/lib/format";
import { DateField } from "@/components/date-field";
import { MoneyInput } from "@/components/money-input";

export function HoldActions({ itemId, balance, methods, expires }: { itemId: string; balance: number; methods: string[]; expires: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "abono" | "extend" | "release">("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(methods[0]);
  const [until, setUntil] = useState<number | null>(expires);
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
        <button className="btn sm" onClick={() => setMode(mode === "extend" ? "" : "extend")}>📅 Cambiar fecha</button>
        <button className="btn sm danger" onClick={() => setMode(mode === "release" ? "" : "release")}>Liberar</button>
      </div>
      {mode === "abono" && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <MoneyInput value={amount} onChange={(x) => setAmount(x)} placeholder={`Hasta ${fmt(balance)}`} aria-label="Valor del abono" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Método">{methods.map((m) => <option key={m}>{m}</option>)}</select>
          <button className="btn primary" disabled={busy || !(+amount > 0)} onClick={() => run(() => addAbonoAction(itemId, +amount, method))}>Registrar</button>
        </div>
      )}
      {mode === "extend" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <DateField id={`until-${itemId}`} label="Nueva fecha de vencimiento" value={until} onChange={setUntil} minDays={0} maxDays={180} quick={[["+3 días", 3], ["+1 semana", 7], ["+15 días", 15], ["+1 mes", 30]]} />
          <button className="btn primary" disabled={busy || !until} onClick={() => run(() => extendHoldAction(itemId, until!))}>Guardar fecha</button></div>
      )}
      {mode === "release" && (
        <div className="flex flex-wrap gap-2"><select value={refund} onChange={(e) => setRefund(e.target.value)} aria-label="Qué pasa con el abono"><option value="1">Devolver el abono al cliente</option><option value="0">Retener el abono (política de la tienda)</option></select>
          <button className="btn danger" disabled={busy} onClick={() => run(() => releaseHoldAction(itemId, refund === "1"))}>Liberar apartado</button></div>
      )}
      {msg && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{msg}</p>}
    </div>
  );
}
