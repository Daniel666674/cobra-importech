"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payPendingAction } from "@/app/actions/sales";
import { MoneyInput } from "@/components/money-input";

export function PayPending({ id, pending, methods }: { id: string; pending: number; methods: string[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(pending));
  const [method, setMethod] = useState(methods[0]);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MoneyInput className="!w-32" aria-label="Valor que paga" value={amount} onChange={setAmount} />
      <select className="!w-40" aria-label="Forma de pago" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
      <button className="btn sm primary" disabled={busy || !(+amount > 0)} onClick={() => start(async () => { const r = await payPendingAction(id, amount, method); if (r.ok) router.refresh(); else setErr(r.error); })}>Registrar pago</button>
      {err && <span role="alert" className="chip bad !whitespace-normal">{err}</span>}
    </div>
  );
}
