"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExtraAction, advanceOrderAction, cancelOrderAction, createTicketAction, moveOrderAction, removeExtraAction, updateOrderAction } from "@/app/actions/ops";
import { fdate, fmt } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";

type Extra = { job: string; cost: number; price: number };
export type Card = {
  id: string; st: string; job: string; tech: string; notes: string; cost: number; t: number; stT: number;
  price: number; techFee: number; extras: Extra[]; device: string; serial: string;
  client: { id: string; name: string; phone: string } | null;
  item: { id: string; name: string; serial: string; price: number; base: number | null } | null;
};

const TONE: Record<string, string> = { Diagnóstico: "border-t-blue-400", "Esperando repuesto": "border-t-amber-400", "En reparación": "border-t-purple-400", Listo: "border-t-green-500" };
const days = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 864e5));
const totalCost = (c: Card) => c.cost + c.extras.reduce((a, x) => a + x.cost, 0);
const totalPrice = (c: Card) => c.price + c.extras.reduce((a, x) => a + x.price, 0);

/** Tablero Kanban del taller: una columna por etapa, se arrastran las órdenes o se mueven con ‹ ›. */
export function Board({ stages, cards, canCost, techs, clients, methods }: {
  stages: string[]; cards: Card[]; canCost: boolean; techs: string[]; clients: { id: string; name: string; phone: string }[]; methods: string[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [over, setOver] = useState("");
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? "" : r.error ?? "Error"); router.refresh(); });
  const move = (id: string, st: string) => run(() => moveOrderAction(id, st));
  return (
    <>
      <datalist id="tecnicos-lista">{techs.map((t) => <option key={t} value={t} />)}</datalist>
      <NewTicket techs={techs} clients={clients} canCost={canCost} onDone={() => router.refresh()} />
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
              {canCost && list.length > 0 && <p className="px-1 note">Costo en esta etapa: {fmt(list.reduce((a, c) => a + totalCost(c), 0))}</p>}
              {list.length === 0 && <p className="note px-1 py-6 text-center">Arrastra aquí</p>}
              {list.map((c) => (
                <article key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} className="card p-3 space-y-1.5 cursor-grab active:cursor-grabbing">
                  <div className="flex items-center justify-between gap-2"><b>{c.id}</b>{c.tech && <span className="chip gray">🧑‍🔧 {c.tech}</span>}</div>
                  {c.item ? <Link href={`/inventario/${c.item.id}`} className="block font-semibold hover:underline">{c.item.name}</Link>
                    : c.device ? <><b className="block">{c.device}</b><span className="chip info">Cliente: {c.client?.name ?? "sin nombre"}</span></> : <span className="note">Equipo eliminado</span>}
                  {(c.item?.serial || c.serial) && <div className="note mono">••{(c.item?.serial || c.serial).slice(-6)}</div>}
                  <div className="text-t2 text-[13px]">{c.job}</div>
                  {c.extras.map((x, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12.5px]"><span>➕ {x.job}</span>
                      <span className="flex items-center gap-1">{canCost && <span className="note">{fmt(x.cost)}</span>}<button className="btn sm !px-1.5 !py-0" aria-label={`Quitar ${x.job}`} disabled={busy} onClick={() => run(() => removeExtraAction(c.id, i))}>✕</button></span></div>
                  ))}
                  <div className="note">Entró {fdate(c.t)} · {days(c.stT)} día(s) en esta etapa{c.client?.phone ? ` · ${c.client.phone}` : ""}</div>
                  <CostEditor card={c} canCost={canCost} onSave={(data) => run(() => updateOrderAction(c.id, data))} onExtra={(data) => run(() => addExtraAction(c.id, data))} busy={busy} />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {si > 0 && <button className="btn sm" disabled={busy} aria-label={`Mover ${c.id} a ${stages[si - 1]}`} onClick={() => move(c.id, stages[si - 1])}>‹</button>}
                    {si < stages.length - 1 && <button className="btn sm primary" disabled={busy} aria-label={`Mover ${c.id} a ${stages[si + 1]}`} onClick={() => move(c.id, stages[si + 1])}>{stages[si + 1]} ›</button>}
                    {si === stages.length - 1 && c.item && <button className="btn sm primary" disabled={busy} onClick={() => { if (confirm(`¿Entregar a vitrina? El costo de la reparación (${fmt(totalCost(c))}) se suma al costo real y al precio del equipo.`)) run(() => advanceOrderAction(c.id)); }}>✅ Entregar a vitrina</button>}
                    <button className="btn sm" disabled={busy} onClick={() => { if (confirm(c.item ? "¿Cancelar la orden? El equipo vuelve a su estado anterior y no se suma ningún costo." : "¿Cancelar el ticket? Queda en el historial como cancelado.")) run(() => cancelOrderAction(c.id)); }}>Cancelar</button>
                  </div>
                  {si === stages.length - 1 && !c.item && <Deliver card={c} methods={methods} busy={busy} onDeliver={(pay) => run(() => advanceOrderAction(c.id, pay))} />}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Entrega de un equipo de cliente: cuánto pagó y con qué forma de pago (entra a la caja del día). */
function Deliver({ card: c, methods, busy, onDeliver }: { card: Card; methods: string[]; busy: boolean; onDeliver: (p: { amount: string; method: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(totalPrice(c)));
  const [method, setMethod] = useState(methods[0]);
  if (!open) return <button className="btn sm primary w-full" onClick={() => setOpen(true)}>✅ Entregar al cliente</button>;
  return (
    <div className="rounded-md border border-line p-2 space-y-1.5 text-[12.5px]">
      <b>Entrega · cobro {fmt(totalPrice(c))}</b>
      <label className="note" htmlFor={`pay-${c.id}`}>¿Cuánto pagó el cliente?</label>
      <MoneyInput id={`pay-${c.id}`} value={amount} onChange={setAmount} />
      <select aria-label="Forma de pago" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
      <div className="flex gap-1.5"><button className="btn sm primary" disabled={busy} onClick={() => onDeliver({ amount: amount || "0", method })}>Entregar</button><button className="btn sm" onClick={() => setOpen(false)}>Cerrar</button></div>
    </div>
  );
}

function CostEditor({ card: c, canCost, onSave, onExtra, busy }: {
  card: Card; canCost: boolean; onSave: (d: { cost?: number; price?: number; techFee?: number; tech?: string; notes?: string }) => void; onExtra: (d: { job: string; cost: string; price: string }) => void; busy: boolean;
}) {
  const [cost, setCost] = useState(String(c.cost));
  const [price, setPrice] = useState(String(c.price));
  const [fee, setFee] = useState(String(c.techFee));
  const [tech, setTech] = useState(c.tech);
  const [notes, setNotes] = useState(c.notes);
  const [open, setOpen] = useState(false);
  const [ex, setEx] = useState<{ job: string; cost: string; price: string } | null>(null);
  const base = c.item?.base;
  const external = !c.item;
  return (
    <div className="rounded-md bg-gray-bg/70 p-2 text-[12.5px] space-y-1">
      <div className="flex justify-between"><span>Costo reparación</span><b className="tabular-nums">{fmt(totalCost(c))}</b></div>
      {external && canCost && <div className="flex justify-between"><span>Cobro al cliente</span><b className="tabular-nums">{fmt(totalPrice(c))}</b></div>}
      {canCost && c.techFee > 0 && <div className="flex justify-between note"><span>Se le paga al técnico</span><span className="tabular-nums">{fmt(c.techFee)}</span></div>}
      {canCost && base != null && (
        <>
          <div className="flex justify-between note"><span>Costo real al terminar</span><span className="tabular-nums">{fmt(base)} + {fmt(totalCost(c))} = {fmt(base + totalCost(c))}</span></div>
          {c.item!.price > 0 && <div className="flex justify-between note"><span>Precio al terminar</span><span className="tabular-nums">{fmt(c.item!.price)} → {fmt(c.item!.price + totalCost(c))}</span></div>}
        </>
      )}
      {c.notes && !open && <p className="note">📝 {c.notes}</p>}
      {open ? (
        <div className="grid gap-1.5 pt-1">
          <label className="note" htmlFor={`tech-${c.id}`}>Técnico</label>
          <input id={`tech-${c.id}`} list="tecnicos-lista" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Nombre del técnico" />
          <label className="note" htmlFor={`cost-${c.id}`}>Costo de la reparación (repuestos, COP)</label>
          <MoneyInput id={`cost-${c.id}`} value={cost} onChange={(x) => setCost(x)} />
          {external && <><label className="note" htmlFor={`price-${c.id}`}>Cobro al cliente (COP)</label><MoneyInput id={`price-${c.id}`} value={price} onChange={(x) => setPrice(x)} /></>}
          <label className="note" htmlFor={`fee-${c.id}`}>Se le paga al técnico por este ticket (COP)</label>
          <MoneyInput id={`fee-${c.id}`} value={fee} onChange={(x) => setFee(x)} />
          <label className="note" htmlFor={`notes-${c.id}`}>Notas del técnico</label>
          <textarea id={`notes-${c.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diagnóstico, repuesto pedido…" />
          <div className="flex gap-1.5"><button className="btn sm primary" disabled={busy} onClick={() => { onSave({ cost: +cost || 0, ...(external ? { price: +price || 0 } : {}), techFee: +fee || 0, tech, notes }); setOpen(false); }}>Guardar</button><button className="btn sm" onClick={() => setOpen(false)}>Cerrar</button></div>
        </div>
      ) : <button className="btn sm w-full" onClick={() => setOpen(true)}>✏️ Técnico, costos y notas</button>}
      {ex ? (
        <div className="grid gap-1.5 pt-1">
          <label className="note" htmlFor={`xj-${c.id}`}>Reparación adicional</label>
          <input id={`xj-${c.id}`} value={ex.job} onChange={(e) => setEx({ ...ex, job: e.target.value })} placeholder="Ej. Cambio de batería" />
          <MoneyInput aria-label="Costo de la reparación adicional" placeholder="Costo (repuestos)" value={ex.cost} onChange={(x) => setEx({ ...ex, cost: x })} />
          {external && <MoneyInput aria-label="Cobro adicional al cliente" placeholder="Cobro al cliente" value={ex.price} onChange={(x) => setEx({ ...ex, price: x })} />}
          <div className="flex gap-1.5"><button className="btn sm primary" disabled={busy || !ex.job.trim()} onClick={() => { onExtra({ job: ex.job, cost: ex.cost || "0", price: ex.price || "0" }); setEx(null); }}>Agregar</button><button className="btn sm" onClick={() => setEx(null)}>Cerrar</button></div>
        </div>
      ) : <button className="btn sm w-full" onClick={() => setEx({ job: "", cost: "", price: "" })}>➕ Reparación adicional</button>}
    </div>
  );
}

/** Ticket de un cliente: un equipo que no es del inventario (cliente, equipo, trabajo, cobro y técnico). */
function NewTicket({ techs, clients, canCost, onDone }: { techs: string[]; clients: { id: string; name: string; phone: string }[]; canCost: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const blank = { client: "", name: "", phone: "", device: "", serial: "", job: "", cost: "", price: "", tech: "", techFee: "" };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <div className="mb-3"><button className="btn primary" onClick={() => setOpen(true)}>➕ Ticket de cliente</button></div>;
  const set = (k: keyof typeof blank, x: string) => setV({ ...v, [k]: x });
  return (
    <div className="card mb-4 max-w-2xl space-y-2 p-4">
      <h2 className="font-semibold">Nuevo ticket de un cliente</h2>
      <p className="note">Para un equipo que el cliente trae a reparar (no es del inventario).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Cliente" value={v.client} onChange={(e) => set("client", e.target.value)}><option value="">Cliente nuevo…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}</select>
        {!v.client && <input aria-label="Nombre del cliente" placeholder="Nombre del cliente" value={v.name} onChange={(e) => set("name", e.target.value)} />}
        {!v.client && <input aria-label="Celular del cliente" placeholder="Celular" value={v.phone} onChange={(e) => set("phone", e.target.value)} />}
        <input aria-label="Equipo" placeholder="Equipo (ej. iPhone 13 azul)" value={v.device} onChange={(e) => set("device", e.target.value)} />
        <input aria-label="IMEI o serial" className="mono" placeholder="IMEI / serial (opcional)" value={v.serial} onChange={(e) => set("serial", e.target.value)} />
        <input aria-label="Trabajo" className="sm:col-span-2" placeholder="Trabajo a hacer (ej. cambio de pantalla)" value={v.job} onChange={(e) => set("job", e.target.value)} />
        {canCost && <MoneyInput aria-label="Costo de la reparación" placeholder="Costo (repuestos)" value={v.cost} onChange={(x) => set("cost", x)} />}
        <MoneyInput aria-label="Cobro al cliente" placeholder="Cobro al cliente" value={v.price} onChange={(x) => set("price", x)} />
        <input aria-label="Técnico" list="tecnicos-lista" placeholder="Técnico" value={v.tech} onChange={(e) => set("tech", e.target.value)} />
        {canCost && <MoneyInput aria-label="Pago al técnico" placeholder="Se le paga al técnico" value={v.techFee} onChange={(x) => set("techFee", x)} />}
      </div>
      {v.tech.trim() && !techs.some((t) => t.toLowerCase() === v.tech.trim().toLowerCase()) && <p className="note">Técnico nuevo: se crea solo y queda su cartera en Técnicos.</p>}
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2">
        <button className="btn primary" disabled={busy || !v.job.trim() || !v.device.trim() || (!v.client && !v.name.trim())} onClick={() => start(async () => {
          const r = await createTicketAction({ job: v.job, device: v.device, serial: v.serial, cost: v.cost || "0", price: v.price || "0", tech: v.tech, techFee: v.techFee || "0", ...(v.client ? { client: v.client } : { newClient: { name: v.name, phone: v.phone } }) });
          if (r.ok) { setV(blank); setOpen(false); setErr(""); onDone(); } else setErr(r.error);
        })}>Crear ticket</button>
        <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}
