"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payTechAction, saveTechAction, voidTechMoveAction } from "@/app/actions/tecnicos";
import { MoneyInput } from "@/components/money-input";

export function NewTech() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>➕ Nuevo técnico</button>;
  return (
    <div className="card w-full max-w-md space-y-2 p-3">
      <input aria-label="Nombre del técnico" placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Celular" placeholder="Celular (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2"><button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await saveTechAction(null, { name, phone }); if (r.ok) { setOpen(false); setName(""); setPhone(""); router.refresh(); } else setErr(r.error); })}>Guardar</button><button className="btn" onClick={() => setOpen(false)}>Cancelar</button></div>
    </div>
  );
}

export function PayTech({ id, balance }: { id: string; balance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [method, setMethod] = useState("Efectivo");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">Registrar un pago al técnico</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <MoneyInput aria-label="Valor" placeholder="Valor" value={amount} onChange={setAmount} />
        <select aria-label="Forma de pago" value={method} onChange={(e) => setMethod(e.target.value)}>{["Efectivo", "Transferencia", "Nequi", "Daviplata"].map((m) => <option key={m}>{m}</option>)}</select>
        <input className="sm:col-span-2" aria-label="Nota" placeholder="Nota (opcional, ej. adelanto)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <button className="btn primary" disabled={busy || !(+amount > 0)} onClick={() => start(async () => { const r = await payTechAction(id, { amount, method, note }); if (r.ok) { setAmount(""); setNote(""); setErr(""); router.refresh(); } else setErr(r.error); })}>Registrar pago</button>
    </div>
  );
}

export function VoidPay({ id }: { id: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return <button className="btn sm" disabled={busy} onClick={() => { if (confirm("¿Anular este pago? El saldo del técnico vuelve a subir.")) start(async () => { await voidTechMoveAction(id); router.refresh(); }); }}>Anular</button>;
}
