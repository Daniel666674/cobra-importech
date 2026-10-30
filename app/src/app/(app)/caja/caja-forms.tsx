"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCashMoveAction, closeDayAction, voidCashMoveAction } from "@/app/actions/caja";
import { MoneyInput } from "@/components/money-input";
import { fmt } from "@/lib/format";

const KINDS = [["gasto", "Gasto (almuerzo, domicilio, papelería…)"], ["retiro", "Retiro (se lleva dinero)"], ["ingreso", "Ingreso (no es una venta)"]] as const;

export function MoveForm({ day, methods }: { day: string; methods: string[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("gasto");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Efectivo");
  const [concept, setConcept] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">Gastos, retiros e ingresos</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Forma" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
        <MoneyInput aria-label="Valor" placeholder="Valor" value={amount} onChange={setAmount} />
        <input aria-label="Concepto" placeholder="¿De qué es?" value={concept} onChange={(e) => setConcept(e.target.value)} />
      </div>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <button className="btn" disabled={busy} onClick={() => start(async () => { const r = await addCashMoveAction({ kind, amount, method, concept, day }); if (r.ok) { setAmount(""); setConcept(""); setErr(""); router.refresh(); } else setErr(r.error); })}>Registrar</button>
    </div>
  );
}

export function VoidMove({ id }: { id: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return <button className="btn sm" disabled={busy} onClick={() => { if (confirm("¿Anular este movimiento?")) start(async () => { await voidCashMoveAction(id); router.refresh(); }); }}>Anular</button>;
}

export function CloseForm({ day, expected }: { day: string; expected: number }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const diff = counted === "" ? null : +counted - expected;
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">Cerrar la caja del día</h2>
      <p className="note">Cuenta el efectivo que hay en la caja y escríbelo. El sistema espera <b>{fmt(expected)}</b>.</p>
      <MoneyInput aria-label="Efectivo contado" placeholder="Efectivo contado" value={counted} onChange={setCounted} />
      {diff !== null && <p className={`chip ${diff === 0 ? "ok" : "warn"} !rounded-md !whitespace-normal`}>{diff === 0 ? "✓ Cuadra" : diff > 0 ? `Sobran ${fmt(diff)}` : `Faltan ${fmt(-diff)}`}</p>}
      <input aria-label="Notas del cierre" placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      <button className="btn primary" disabled={busy || counted === ""} onClick={() => start(async () => { const r = await closeDayAction({ day, counted, notes }); if (r.ok) { setMsg({ ok: true, t: "Cierre guardado" }); setCounted(""); setNotes(""); router.refresh(); } else setMsg({ ok: false, t: r.error }); })}>Guardar cierre</button>
    </div>
  );
}
