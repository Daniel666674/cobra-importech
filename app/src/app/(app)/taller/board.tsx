"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { advanceOrderAction, cancelOrderAction, moveOrderAction, updateOrderAction } from "@/app/actions/ops";
import { fdate, fmt } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";

export type Card = {
  id: string; st: string; job: string; tech: string; notes: string; cost: number; t: number; stT: number;
  item: { id: string; name: string; serial: string; price: number; base: number | null } | null;
};

const TONE: Record<string, string> = { Diagnóstico: "border-t-blue-400", "Esperando repuesto": "border-t-amber-400", "En reparación": "border-t-purple-400", Listo: "border-t-green-500" };
const days = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 864e5));

/** Tablero Kanban del taller: una columna por etapa, se arrastran las órdenes o se mueven con ‹ ›. */
export function Board({ stages, cards, canCost }: { stages: string[]; cards: Card[]; canCost: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [over, setOver] = useState("");
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? "" : r.error ?? "Error"); router.refresh(); });
  const move = (id: string, st: string) => run(() => moveOrderAction(id, st));
  return (
    <>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal mb-3">{err}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy={busy}>
        {stages.map((st, si) => {
          const list = cards.filter((c) => c.st === st);
          return (
            <section key={st} aria-label={`Etapa ${st}`}
              onDragOver={(e) => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver("")}
              onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, st); }}
              className={`rounded-xl border-t-4 ${TONE[st] ?? ""} bg-gray-bg/60 p-2 min-h-[220px] space-y-2 ${over === st ? "ring-2 ring-accent" : ""}`}>
              <h2 className="flex items-center justify-between px-1 text-[12px] font-bold uppercase tracking-wider text-t2">
                <span>{st}</span><span className="chip gray">{list.length}</span>
              </h2>
              {canCost && list.length > 0 && <p className="px-1 note">Costo en esta etapa: {fmt(list.reduce((a, c) => a + c.cost, 0))}</p>}
              {list.length === 0 && <p className="note px-1 py-6 text-center">Arrastra aquí</p>}
              {list.map((c) => (
                <article key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} className="card p-3 space-y-1.5 cursor-grab active:cursor-grabbing">
                  <div className="flex items-center justify-between gap-2"><b>{c.id}</b><span className="chip gray">{c.tech}</span></div>
                  {c.item ? <Link href={`/inventario/${c.item.id}`} className="block font-semibold hover:underline">{c.item.name}</Link> : <span className="note">Equipo eliminado</span>}
                  {c.item?.serial && <div className="note mono">••{c.item.serial.slice(-6)}</div>}
                  <div className="text-t2 text-[13px]">{c.job}</div>
                  <div className="note">Entró {fdate(c.t)} · {days(c.stT)} día(s) en esta etapa</div>
                  <CostEditor card={c} canCost={canCost} onSave={(data) => run(() => updateOrderAction(c.id, data))} busy={busy} />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {si > 0 && <button className="btn sm" disabled={busy} aria-label={`Mover ${c.id} a ${stages[si - 1]}`} onClick={() => move(c.id, stages[si - 1])}>‹</button>}
                    {si < stages.length - 1 && <button className="btn sm primary" disabled={busy} aria-label={`Mover ${c.id} a ${stages[si + 1]}`} onClick={() => move(c.id, stages[si + 1])}>{stages[si + 1]} ›</button>}
                    {si === stages.length - 1 && <button className="btn sm primary" disabled={busy} onClick={() => { if (confirm(`¿Entregar a vitrina? El costo de la reparación (${fmt(c.cost)}) se suma al costo real y al precio del equipo.`)) run(() => advanceOrderAction(c.id)); }}>✅ Entregar a vitrina</button>}
                    <button className="btn sm" disabled={busy} onClick={() => { if (confirm("¿Cancelar la orden? El equipo vuelve a su estado anterior y no se suma ningún costo.")) run(() => cancelOrderAction(c.id)); }}>Cancelar</button>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function CostEditor({ card: c, canCost, onSave, busy }: { card: Card; canCost: boolean; onSave: (d: { cost?: number; notes?: string }) => void; busy: boolean }) {
  const [cost, setCost] = useState(String(c.cost));
  const [notes, setNotes] = useState(c.notes);
  const [open, setOpen] = useState(false);
  const base = c.item?.base;
  return (
    <div className="rounded-md bg-gray-bg/70 p-2 text-[12.5px] space-y-1">
      <div className="flex justify-between"><span>Costo reparación</span><b className="tabular-nums">{fmt(c.cost)}</b></div>
      {canCost && base != null && (
        <>
          <div className="flex justify-between note"><span>Costo real al terminar</span><span className="tabular-nums">{fmt(base)} + {fmt(c.cost)} = {fmt(base + c.cost)}</span></div>
          {c.item!.price > 0 && <div className="flex justify-between note"><span>Precio al terminar</span><span className="tabular-nums">{fmt(c.item!.price)} → {fmt(c.item!.price + c.cost)}</span></div>}
        </>
      )}
      {c.notes && !open && <p className="note">📝 {c.notes}</p>}
      {open ? (
        <div className="grid gap-1.5 pt-1">
          <label className="note" htmlFor={`cost-${c.id}`}>Costo de la reparación (COP)</label>
          <MoneyInput id={`cost-${c.id}`} value={cost} onChange={(x) => setCost(x)} />
          <label className="note" htmlFor={`notes-${c.id}`}>Notas del técnico</label>
          <textarea id={`notes-${c.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diagnóstico, repuesto pedido…" />
          <div className="flex gap-1.5"><button className="btn sm primary" disabled={busy} onClick={() => { onSave({ cost: +cost || 0, notes }); setOpen(false); }}>Guardar</button><button className="btn sm" onClick={() => setOpen(false)}>Cerrar</button></div>
        </div>
      ) : <button className="btn sm w-full" onClick={() => setOpen(true)}>✏️ Costo y notas</button>}
    </div>
  );
}
