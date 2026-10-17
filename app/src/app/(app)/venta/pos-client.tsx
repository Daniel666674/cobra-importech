"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createHoldAction, createSaleAction } from "@/app/actions/sales";
import { CATS, METHODS } from "@/lib/catalog";
import { fmt } from "@/lib/format";
import { holdMin } from "@/lib/hold";
import { isQty } from "@/lib/items";
import { posTotals } from "@/lib/sales";
import type { Hold } from "@/db/schema";

export type PosItem = { id: string; cat: string; name: string; spec: string; color: string; cond: string; serial: string; qty: number; price: number; cost: number; warr: number; track: string; hold: Hold | null };
type Line = { id: string; qty: number };
type Pay = { method: string; amount: string };

type Props = {
  items: PosItem[];
  clients: { id: string; name: string; doc: string; phone: string }[];
  cfg: { maxDisc: number; apartadoMinPct: number; holdDays: number };
  can: { discount: boolean; cost: boolean; credit: boolean };
  start: { item: string; mode: "contado" | "apartado"; hold: string };
};

export function PosClient({ items, clients, cfg, can, start }: Props) {
  const router = useRouter();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const finishing = start.hold ? byId.get(start.hold) ?? null : null;
  const [lines, setLines] = useState<Line[]>(() => {
    const id = start.hold || start.item;
    return id && byId.has(id) ? [{ id, qty: 1 }] : [];
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState<"contado" | "apartado">(finishing ? "contado" : start.mode);
  const [client, setClient] = useState(finishing?.hold?.client ?? "");
  const [newC, setNewC] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", email: "", doc: "" });
  const [discType, setDiscType] = useState<"pct" | "cop">("pct");
  const [disc, setDisc] = useState("");
  const [reason, setReason] = useState("");
  const [pays, setPays] = useState<Pay[]>([{ method: "Efectivo", amount: "" }]);
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [abono, setAbono] = useState("");
  const [abonoMethod, setAbonoMethod] = useState("Efectivo");
  const [err, setErr] = useState("");
  const [busy, startT] = useTransition();

  const cart = lines.map((l) => ({ l, it: byId.get(l.id)! })).filter((x) => x.it);
  const T = posTotals(cart.map((x) => ({ price: x.it.price, cost: x.it.cost, qty: x.l.qty })), { type: discType, value: +disc || 0 }, finishing?.hold?.abono ?? 0);
  const hold = mode === "apartado";
  const cartHasQty = cart.some((x) => isQty(x.it));

  // pagos: una fila vacía (la última) se completa sola con el saldo
  const fixed = pays.reduce((a, p) => a + (p.amount === "" ? 0 : +p.amount || 0), 0);
  const autoIdx = pays.findIndex((p) => p.amount === "");
  const resolved = pays.map((p, i) => ({ method: p.method, amount: p.amount === "" ? (i === autoIdx ? Math.max(0, T.due - fixed) : 0) : +p.amount || 0 }));
  const paid = resolved.reduce((a, p) => a + p.amount, 0);
  const min = hold ? holdMin(T.total, cfg.apartadoMinPct) : 0;

  let why = "";
  if (!cart.length) why = "Agrega al menos un producto";
  else if (newC && !nc.name.trim()) why = "Escribe el nombre del cliente nuevo";
  else if (T.pct > 0 && !reason.trim()) why = "Indica el motivo del descuento";
  else if (T.pct > cfg.maxDisc && !can.discount) why = `El descuento supera el límite del ${cfg.maxDisc}%: pide autorización`;
  else if (T.total < T.cost && !can.discount) why = "El total queda por debajo del costo: pide autorización";
  else if (hold) {
    if (cart.length !== 1 || cartHasQty) why = "El apartado es para un solo equipo";
    else if (!client && !newC) why = "Elige o crea el cliente para apartar";
    else if (!(+abono > 0)) why = "Escribe el valor del abono";
    else if (+abono < min) why = `El abono mínimo es ${fmt(min)} (${cfg.apartadoMinPct}%)`;
    else if (+abono >= T.total) why = "El abono cubre el total: registra una venta normal";
  } else if (T.due > 0) {
    if (resolved.some((p) => p.amount <= 0)) why = "Cada método de pago debe tener un valor";
    else if (paid < T.due) why = `Falta asignar ${fmt(T.due - paid)} en los pagos`;
    else if (paid > T.due) why = `Los pagos superan el total por ${fmt(paid - T.due)}`;
  }

  const filtered = items.filter((i) => {
    if (finishing && i.id === finishing.id) return false;
    if (cat && i.cat !== cat) return false;
    const s = q.toLowerCase().trim();
    return !s || `${i.name} ${i.spec} ${i.color} ${i.serial}`.toLowerCase().includes(s);
  }).slice(0, 60);

  const add = (id: string) => {
    const it = byId.get(id)!;
    setLines((ls) => {
      const ex = ls.find((l) => l.id === id);
      if (ex) return isQty(it) ? ls.map((l) => (l.id === id ? { ...l, qty: Math.min(it.qty, l.qty + 1) } : l)) : ls;
      return [...ls, { id, qty: 1 }];
    });
  };
  const setQty = (id: string, n: number) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(byId.get(id)!.qty, n)) } : l)));

  function confirm() {
    setErr("");
    const client_ = client || null;
    const newClient = newC ? nc : null;
    startT(async () => {
      if (hold) {
        const r = await createHoldAction({ item: cart[0].it.id, client: client_, newClient, abono, method: abonoMethod });
        if (!r.ok) return setErr(r.error);
        router.push("/apartados");
      } else {
        const r = await createSaleAction({
          lines: cart.map((x) => ({ item: x.it.id, qty: x.l.qty })), client: client_, newClient,
          discount: { type: discType, value: +disc || 0 }, discReason: reason, payments: resolved.filter((p) => p.amount > 0), notes, cash: +cash || 0, holdItem: finishing?.id ?? null,
        });
        if (!r.ok) return setErr(r.error);
        router.push(`/ventas/${r.data}`);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="space-y-3">
        <div className="card p-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, color, IMEI o serie" aria-label="Buscar producto" autoFocus />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría"><option value="">Todas</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {filtered.map((i) => (
            <button key={i.id} type="button" onClick={() => add(i.id)} className="card p-3 text-left hover:border-accent">
              <b className="block text-[13.5px] leading-snug">{i.name}{i.spec ? ` · ${i.spec}` : ""}</b>
              <span className="note block">{i.color}{i.color ? " · " : ""}{i.cond}{isQty(i) ? ` · ${i.qty} uds.` : i.serial ? ` · ••${i.serial.slice(-6)}` : ""}</span>
              <b className="mt-1 block tabular-nums">{fmt(i.price)}</b>
            </button>
          ))}
          {!filtered.length && <p className="note p-4">No hay productos disponibles con esa búsqueda.</p>}
        </div>
      </section>

      <section className="card p-4 space-y-4 self-start lg:sticky lg:top-4">
        {finishing && <p className="chip info !rounded-md !whitespace-normal">Cerrando el apartado {finishing.hold?.no}: ya se abonaron {fmt(finishing.hold?.abono ?? 0)}.</p>}
        {!finishing && can.credit && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-bg p-1" role="tablist">
            {(["contado", "apartado"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)} className={`rounded-md py-1.5 text-[13px] font-semibold ${mode === m ? "bg-card shadow-sm" : "text-t2"}`}>{m === "contado" ? "Venta de contado" : "Apartado"}</button>
            ))}
          </div>
        )}
        <div>
          <h3 className="font-semibold mb-2">Productos</h3>
          {!cart.length ? <p className="note">Toca un producto para agregarlo.</p> : (
            <ul className="space-y-2">
              {cart.map(({ l, it }) => (
                <li key={l.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0"><b className="block truncate text-[13px]">{it.name}{it.spec ? ` · ${it.spec}` : ""}</b><span className="note">{fmt(it.price)}{it.color ? " · " + it.color : ""}</span></div>
                  {isQty(it) && <input type="number" aria-label="Cantidad" className="!w-16" min={1} max={it.qty} value={l.qty} onChange={(e) => setQty(l.id, +e.target.value)} />}
                  <b className="tabular-nums w-24 text-right">{fmt(it.price * l.qty)}</b>
                  {!(finishing && finishing.id === l.id) && <button type="button" className="btn sm" aria-label={`Quitar ${it.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Cliente</h3>
          {finishing ? <p className="text-t2">{clients.find((c) => c.id === client)?.name ?? "—"}</p> : !newC ? (
            <div className="flex gap-2">
              <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente"><option value="">{hold ? "Elige un cliente" : "Mostrador (sin cliente)"}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.doc ? " · " + c.doc : ""}</option>)}</select>
              <button type="button" className="btn" onClick={() => { setNewC(true); setClient(""); }}>+ Nuevo</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2" placeholder="Nombre completo" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} aria-label="Nombre del cliente" />
              <input placeholder="Cédula / NIT" value={nc.doc} onChange={(e) => setNc({ ...nc, doc: e.target.value })} />
              <input placeholder="Celular" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              <input className="col-span-2" placeholder="Correo" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
              <button type="button" className="btn sm col-span-2" onClick={() => setNewC(false)}>Usar un cliente existente</button>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Descuento</h3>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <select value={discType} onChange={(e) => setDiscType(e.target.value as "pct" | "cop")} aria-label="Tipo de descuento"><option value="pct">%</option><option value="cop">$</option></select>
            <input type="number" min={0} value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" aria-label="Valor del descuento" />
          </div>
          {T.pct > 0 && <input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del descuento" aria-label="Motivo del descuento" />}
        </div>

        {hold ? (
          <div>
            <h3 className="font-semibold mb-2">Abono inicial</h3>
            <div className="grid grid-cols-2 gap-2"><input type="number" min={0} step={1000} value={abono} onChange={(e) => setAbono(e.target.value)} placeholder={min ? `Mínimo ${fmt(min)}` : "Valor"} aria-label="Abono" />
              <select value={abonoMethod} onChange={(e) => setAbonoMethod(e.target.value)} aria-label="Método del abono">{METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <p className="note mt-1">Vence en {cfg.holdDays} días · mínimo {cfg.apartadoMinPct}% ({fmt(min)})</p>
          </div>
        ) : T.due > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Pago</h3>
            <div className="space-y-2">
              {pays.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} aria-label="Método de pago">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                  <input type="number" min={0} value={p.amount} placeholder={i === autoIdx ? String(resolved[i].amount) : ""} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Valor del pago" />
                  {pays.length > 1 ? <button type="button" className="btn sm" aria-label="Quitar pago" onClick={() => setPays(pays.filter((_, j) => j !== i))}>✕</button> : <span />}
                </div>
              ))}
              <button type="button" className="btn sm" onClick={() => setPays([...pays.map((p, i) => (p.amount === "" ? { ...p, amount: String(resolved[i].amount) } : p)), { method: "Transferencia", amount: "" }])}>+ Dividir pago</button>
            </div>
            {pays.length === 1 && pays[0].method === "Efectivo" && (
              <div className="mt-2"><input type="number" min={0} value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Efectivo recibido (opcional)" aria-label="Efectivo recibido" />
                {+cash >= T.due && T.due > 0 && <p className="note mt-1">Devuelta: <b>{fmt(+cash - T.due)}</b></p>}</div>
            )}
          </div>
        )}
        <div><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" aria-label="Notas" /></div>

        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><span className="text-t2">Subtotal</span><span>{fmt(T.sub)}</span></div>
          {T.discAmt > 0 && <div className="flex justify-between"><span className="text-t2">Descuento ({+T.pct.toFixed(1)}%)</span><span className="text-red-t">−{fmt(T.discAmt)}</span></div>}
          {T.prepaid > 0 && <div className="flex justify-between"><span className="text-t2">Abonos del apartado</span><span className="text-green-t">−{fmt(T.prepaid)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>{hold ? "Total del equipo" : "Total a pagar"}</span><span className="tabular-nums">{fmt(hold ? T.total : T.due)}</span></div>
          {can.cost && cart.length > 0 && <div className="flex justify-between note"><span>Margen de la venta</span><span>{fmt(T.total - T.cost)} · {T.total ? Math.round(((T.total - T.cost) / T.total) * 100) : 0}%</span></div>}
        </div>
        <button type="button" className="btn primary w-full !py-3" disabled={!!why || busy} onClick={confirm}>
          {hold ? `🔒 Crear apartado · abono ${fmt(+abono || 0)}` : T.due > 0 ? `Cobrar ${fmt(T.due)}` : "Emitir comprobante"}
        </button>
        {why && cart.length > 0 && <p className="note" role="status">{why}</p>}
        {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      </section>
    </div>
  );
}
