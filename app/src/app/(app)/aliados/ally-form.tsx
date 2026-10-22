"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payAllyAction, saveAllyAction } from "@/app/actions/allies";
import { fmt } from "@/lib/format";

type Ally = { name: string; contact: string; phone: string; doc: string; mode: string; notes: string; active: boolean };
const EMPTY: Ally = { name: "", contact: "", phone: "", doc: "", mode: "consignacion", notes: "", active: true };

/** Crear o editar una tienda aliada. */
export function AllyForm({ id = null, initial = EMPTY, onSaved }: { id?: string | null; initial?: Ally; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const f = (k: "name" | "contact" | "phone" | "doc", label: string) => (
    <div><label className="lb" htmlFor={`al-${k}`}>{label}</label><input id={`al-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {f("name", "Nombre de la tienda *")}{f("contact", "Persona de contacto")}{f("phone", "Celular / WhatsApp")}{f("doc", "NIT o cédula")}
        <div className="sm:col-span-2"><label className="lb" htmlFor="al-mode">¿Cuándo se le paga?</label>
          <select id="al-mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
            <option value="consignacion">Cuando se vende el producto (consignación)</option>
            <option value="compra">Desde que se recibe el producto (compra)</option>
          </select>
          <p className="note mt-1">Define cuándo nace la deuda con la aliada en su cuenta.</p></div>
        <div className="sm:col-span-2"><label className="lb" htmlFor="al-notes">Notas / acuerdo</label><textarea id="al-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Ej.: se liquida cada viernes por transferencia" /></div>
        {id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="!w-auto" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Activa (aparece al ingresar productos)</label>}
      </div>
      <button className="btn primary" disabled={busy} onClick={() => start(async () => {
        const r = await saveAllyAction(id, v);
        if (!r.ok) return setMsg({ ok: false, t: r.error });
        setMsg({ ok: true, t: id ? "Cambios guardados" : "Tienda aliada creada" });
        if (!id) setV(EMPTY);
        onSaved?.(r.data);
        router.refresh();
      })}>{id ? "Guardar cambios" : "Crear tienda aliada"}</button>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
    </div>
  );
}

/** Registrar un pago a la aliada (abono o liquidación total). */
export function PayAlly({ id, balance }: { id: string; balance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  if (balance <= 0) return <div className="space-y-2"><p className="note">No hay saldo pendiente con esta tienda.</p>{msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}</div>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <input type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Hasta ${fmt(balance)}`} aria-label="Valor del pago" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej. transferencia Bancolombia)" aria-label="Nota del pago" />
        <button className="btn sm" type="button" onClick={() => setAmount(String(balance))}>Todo</button>
      </div>
      <button className="btn primary" disabled={busy || !(+amount > 0)} onClick={() => start(async () => {
        const r = await payAllyAction(id, { amount, note });
        if (!r.ok) return setMsg({ ok: false, t: r.error });
        setMsg({ ok: true, t: `Pago registrado. Saldo pendiente: ${fmt(r.data)}` }); setAmount(""); setNote(""); router.refresh();
      })}>Registrar pago</button>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
    </div>
  );
}
