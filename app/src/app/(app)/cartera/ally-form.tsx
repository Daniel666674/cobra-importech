"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payAllyAction, saveAllyAction, voidAllyPayAction } from "@/app/actions/allies";
import { PAY_METHODS } from "@/lib/cartera";
import { fmt } from "@/lib/format";
import { DateField, fromYmd, toYmd } from "@/components/date-field";
import { MoneyInput } from "@/components/money-input";

type Ally = { name: string; contact: string; phone: string; doc: string; mode: string; notes: string; active: boolean; terms: string; bank: string; due: number | null };
const EMPTY: Ally = { name: "", contact: "", phone: "", doc: "", mode: "consignacion", notes: "", active: true, terms: "0", bank: "", due: null };

/** Crear o editar una tienda aliada. */
export function AllyForm({ id = null, initial = EMPTY, onSaved }: { id?: string | null; initial?: Ally; onSaved?: (id: string) => void }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const f = (k: "name" | "contact" | "phone" | "doc" | "bank", label: string) => (
    <div><label className="lb" htmlFor={`al-${k}`}>{label}</label><input id={`al-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {f("name", "Nombre de la tienda *")}{f("contact", "Persona de contacto")}{f("phone", "Celular / WhatsApp")}{f("doc", "NIT o cédula")}
        <DateField id="al-due" label="Fecha para pagarle" value={v.due} onChange={(t) => setV({ ...v, due: t })} minDays={-365} clearable
          quick={[["8 días", 8], ["15 días", 15], ["30 días", 30], ["Fin de mes", Math.max(0, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate())]]}
          hint="Pasada esta fecha, el saldo sale vencido" />
        {f("bank", "Cuenta para pagarle (banco, tipo y número)")}
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
        const r = await saveAllyAction(id, { ...v, terms: +v.terms || 0, due: v.due });
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

/** Registrar un pago: abono, pago total o anticipo (varios), con forma de pago, referencia y fecha. */
export function PayAlly({ id, balance, advance = 0 }: { id: string; balance: number; advance?: number }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState({ amount: "", method: PAY_METHODS[0] as string, ref: "", date: today, note: "" });
  const [adv, setAdv] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const amt = +v.amount || 0, over = amt - balance;
  const needsAdv = amt > 0 && over > 0;
  return (
    <div className="space-y-2">
      {balance > 0 ? <p className="text-[13px]">Saldo por pagar: <b>{fmt(balance)}</b></p> : <p className="text-[13px]">No hay saldo pendiente{advance ? <> · anticipo a favor <b className="text-green-t">{fmt(advance)}</b></> : null}. Lo que registres queda como <b>anticipo</b>.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="lb" htmlFor="pay-amount">Valor (COP)</label>
          <div className="flex gap-1"><MoneyInput id="pay-amount" value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
            {balance > 0 && <button className="btn sm" type="button" onClick={() => setV({ ...v, amount: String(balance) })}>Todo</button>}</div></div>
        <div><label className="lb" htmlFor="pay-method">Forma de pago</label>
          <select id="pay-method" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className="lb" htmlFor="pay-ref">N.º de comprobante / referencia</label><input id="pay-ref" value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} placeholder="Ej. 000123456 (de la transferencia)" /></div>
        <DateField id="pay-date" label="Fecha del pago" value={fromYmd(v.date)} maxDays={0} onChange={(t) => setV({ ...v, date: toYmd(t ?? Date.now()) })} quick={[["Hoy", 0], ["Ayer", -1]]} />
        <div className="sm:col-span-2"><label className="lb" htmlFor="pay-note">Nota</label><input id="pay-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Ej. liquidación quincena, anticipo para mercancía" /></div>
      </div>
      {needsAdv && (
        <label className="flex items-start gap-2 rounded-md bg-amber-bg/50 p-2 text-[13px]"><input type="checkbox" className="!w-auto mt-0.5" checked={adv} onChange={(e) => setAdv(e.target.checked)} />
          <span>Es un <b>anticipo</b>: {balance > 0 ? <>{fmt(balance)} pagan el saldo y </> : null}<b>{fmt(over)}</b> quedan a favor de la tienda y se descuentan solos de lo que se le deba después.</span></label>
      )}
      <button className="btn primary" disabled={busy || !(amt > 0) || (needsAdv && !adv)} onClick={() => start(async () => {
        const [y, m, d] = v.date.split("-").map(Number);
        const t = v.date === today ? undefined : new Date(y, m - 1, d, 12).getTime();
        const r = await payAllyAction(id, { amount: amt, method: v.method, ref: v.ref, note: v.note, t, advance: needsAdv && adv });
        if (!r.ok) return setMsg({ ok: false, t: r.error });
        const b = r.data.balance;
        setMsg({ ok: true, t: `${r.data.no} registrado. ${b > 0 ? `Saldo pendiente: ${fmt(b)}` : b < 0 ? `Anticipo a favor: ${fmt(-b)}` : "Cuenta al día."}` });
        setV({ ...v, amount: "", ref: "", note: "" }); setAdv(false); router.refresh();
      })}>{needsAdv ? "Registrar pago con anticipo" : balance > 0 ? "Registrar pago" : "Registrar anticipo"}</button>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
    </div>
  );
}

/** Anular un pago mal registrado (solo la propietaria). */
export function VoidPay({ id, no }: { id: number; no: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button className="btn sm mt-1 !py-0.5 !text-[11.5px]" disabled={busy} onClick={() => {
      const why = prompt(`¿Por qué se anula ${no}? (queda en la historia)`, "");
      if (!why) return;
      start(async () => { const r = await voidAllyPayAction(id, why); if (!r.ok) alert(r.error); router.refresh(); });
    }}>Anular</button>
  );
}
