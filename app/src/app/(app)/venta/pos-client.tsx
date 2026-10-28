"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createHoldAction, createSaleAction } from "@/app/actions/sales";
import { CATALOG, CATS, COLOR_OPTIONS, SPEC_OPTIONS, feeFor, type Cat } from "@/lib/catalog";
import { ComboSelect } from "@/components/combo-select";
import { DateField } from "@/components/date-field";
import { fmt } from "@/lib/format";
import { holdMin } from "@/lib/hold";
import { isQty } from "@/lib/items";
import { posTotals } from "@/lib/sales";
import type { Hold } from "@/db/schema";
import { TradeinForm, type TradePayload } from "@/components/tradein-form";
import { ScanDialog } from "@/components/scan-dialog";
import { fdatey, initials } from "@/lib/format";
import { MoneyInput } from "@/components/money-input";

const CAT_ICON: Record<string, string> = { iPhone: "📱", iPad: "📲", Mac: "💻", "Apple Watch": "⌚", AirPods: "🎧", Accesorios: "🔌" };

export type PosItem = { id: string; cat: string; name: string; spec: string; color: string; cond: string; serial: string; serial2: string; qty: number; price: number; cost: number; warr: number; track: string; hold: Hold | null };
type Line = { id: string; qty: number };
type Pay = { method: string; amount: string };

type Props = {
  items: PosItem[];
  clients: { id: string; name: string; doc: string; phone: string }[];
  cfg: { maxDisc: number; apartadoMinPct: number; holdDays: number; methods: string[]; surcharges: Record<string, number> };
  can: { discount: boolean; cost: boolean; credit: boolean; tradein: boolean };
  warr: Record<string, number>;
  /** Tiendas aliadas activas: proveedor de un producto fuera de inventario. */
  allies: { id: string; name: string }[];
  start: { item: string; mode: "contado" | "apartado"; hold: string };
};

export function PosClient({ items, clients, cfg, can, start, warr, allies }: Props) {
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
  const [nc, setNc] = useState({ name: "", phone: "", email: "", doc: "", address: "" });
  const [discType, setDiscType] = useState<"pct" | "cop">("pct");
  const [disc, setDisc] = useState("");
  const [reason, setReason] = useState("");
  const [pays, setPays] = useState<Pay[]>([{ method: cfg.methods[0], amount: "" }]);
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [abono, setAbono] = useState("");
  const [abonoMethod, setAbonoMethod] = useState(cfg.methods[0]);
  const [err, setErr] = useState("");
  const [busy, startT] = useTransition();
  const [trades, setTrades] = useState<TradePayload[]>([]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [cq, setCq] = useState("");
  const [today] = useState(() => Date.now());
  type Custom = { cat: Cat; name: string; spec: string; color: string; cond: string; serial: string; serial2: string; batt: string; qty: number; price: string; cost: string; warr: string; supplier: string };
  const blankCustom: Custom = { cat: "iPhone", name: "", spec: "", color: "", cond: "Usado", serial: "", serial2: "", batt: "", qty: 1, price: "", cost: "", warr: String(warr.Usado ?? 1), supplier: "" };
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [cf, setCf] = useState<Custom | null>(null);
  const [saleDate, setSaleDate] = useState<number | null>(null);
  const [holdUntil, setHoldUntil] = useState<number | null>(() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + cfg.holdDays); return d.getTime(); });

  // Precio escrito en caja para productos sin precio de venta (queda guardado en el producto al cobrar).
  const [typed, setTyped] = useState<Record<string, string>>({});
  const cart = lines.map((l) => ({ l, it: byId.get(l.id)! })).filter((x) => x.it).map((x) => ({ ...x, it: x.it.price > 0 ? x.it : { ...x.it, price: +(typed[x.it.id] ?? "") || 0 }, noPrice: !(x.it.price > 0) }));
  const T = posTotals([...cart.map((x) => ({ price: x.it.price, cost: x.it.cost, qty: x.l.qty })), ...customs.map((c) => ({ price: +c.price || 0, cost: +c.cost || 0, qty: c.qty }))], { type: discType, value: +disc || 0 }, finishing?.hold?.abono ?? 0);
  const anyItem = cart.length + customs.length > 0;
  const hold = mode === "apartado";
  const tradeTotal = hold ? 0 : trades.reduce((a, t) => a + t.offer, 0);
  const due = T.due - tradeTotal;
  const clientDoc = newC ? nc.doc.trim() : clients.find((c) => c.id === client)?.doc ?? "";
  const cartHasQty = cart.some((x) => isQty(x.it));

  // pagos: una fila vacía (la última) se completa sola con el saldo
  const fixed = pays.reduce((a, p) => a + (p.amount === "" ? 0 : +p.amount || 0), 0);
  const autoIdx = pays.findIndex((p) => p.amount === "");
  const resolved = pays.map((p, i) => ({ method: p.method, amount: p.amount === "" ? (i === autoIdx ? Math.max(0, due - fixed) : 0) : +p.amount || 0 }));
  const paid = resolved.reduce((a, p) => a + p.amount, 0);
  const pct = (m: string) => cfg.surcharges[m] ?? 0;
  const fees = resolved.map((p) => feeFor(pct(p.method), p.amount));
  const feeTotal = hold ? 0 : fees.reduce((a, x) => a + x, 0);
  const min = hold ? holdMin(T.total, cfg.apartadoMinPct) : 0;

  let why = "";
  if (!anyItem) why = "Agrega al menos un producto";
  else if (cart.some((x) => x.noPrice && !(x.it.price > 0))) why = `Escribe el precio de venta de «${cart.find((x) => x.noPrice && !(x.it.price > 0))!.it.name}»`;
  else if (newC && !nc.name.trim()) why = "Escribe el nombre del cliente nuevo";
  else if (T.pct > 0 && !reason.trim()) why = "Indica el motivo del descuento";
  else if (T.pct > cfg.maxDisc && !can.discount) why = `El descuento supera el límite del ${cfg.maxDisc}%: pide autorización`;
  else if (T.total < T.cost && !can.discount) why = "El total queda por debajo del costo: pide autorización";
  else if (hold) {
    if (cart.length !== 1 || cartHasQty || customs.length) why = "El apartado es para un solo equipo del inventario";
    else if (cart[0].noPrice) why = "Para apartar, primero ponle precio al equipo en su ficha";
    else if (!client && !newC) why = "Elige o crea el cliente para apartar";
    else if (!(+abono > 0)) why = "Escribe el valor del abono";
    else if (+abono < min) why = `El abono mínimo es ${fmt(min)} (${cfg.apartadoMinPct}%)`;
    else if (+abono >= T.total) why = "El abono cubre el total: registra una venta normal";
    else if (!holdUntil) why = "Escoge la fecha de vencimiento del apartado";
  } else if (due < 0) why = `La retoma supera el total por ${fmt(-due)}: regístrala sola en «Retomas»`;
  else if (trades.length && (!(client || newC) || !clientDoc)) why = "Para recibir un equipo en parte de pago, elige o crea el cliente con su cédula";
  else if (due > 0) {
    if (resolved.some((p) => p.amount <= 0)) why = "Cada método de pago debe tener un valor";
    else if (paid < due) why = `Falta asignar ${fmt(due - paid)} en los pagos`;
    else if (paid > due) why = `Los pagos superan el total por ${fmt(paid - due)}`;
  }

  const filtered = items.filter((i) => {
    if (finishing && i.id === finishing.id) return false;
    if (cat && i.cat !== cat) return false;
    const s = q.toLowerCase().trim();
    return !s || `${i.name} ${i.spec} ${i.color} ${i.serial} ${i.serial2}`.toLowerCase().includes(s);
  }).slice(0, 120);

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
        const r = await createHoldAction({ item: cart[0].it.id, client: client_, newClient, abono, method: abonoMethod, ...(holdUntil ? { until: holdUntil } : {}) });
        if (!r.ok) return setErr(r.error);
        router.push("/apartados");
      } else {
        const r = await createSaleAction({
          ...(saleDate ? { date: saleDate } : {}),
          lines: cart.map((x) => ({ item: x.it.id, qty: x.l.qty, ...(x.noPrice ? { price: x.it.price } : {}) })), client: client_, newClient,
          custom: customs.map((c) => ({ ...c, price: +c.price || 0, cost: +c.cost || 0, warr: +c.warr || 0, batt: c.batt === "" ? null : +c.batt })),
          discount: { type: discType, value: +disc || 0 }, discReason: reason, payments: due > 0 ? resolved.filter((p) => p.amount > 0) : [], notes, cash: +cash || 0, holdItem: finishing?.id ?? null,
          tradeins: trades.map((t) => ({ item: t.item, official: t.official, ownerApproved: t.ownerApproved })),
        });
        if (!r.ok) return setErr(r.error);
        router.push(`/ventas/${r.data}?nueva=1`);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
      <section className="card self-start overflow-hidden !p-0">
        <div className="flex gap-2 border-b border-line p-4">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3">🔍</span>
            <input className="!pl-9 !py-2.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, IMEI / serial o SKU…" aria-label="Buscar producto" autoFocus />
          </div>
          <button type="button" className="btn whitespace-nowrap" onClick={() => { setScanMsg(""); setScanOpen(true); }}>📷 Escanear</button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          {["", ...CATS].map((c) => (
            <button key={c || "todo"} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold ${cat === c ? "border-transparent bg-brand text-white" : "border-line bg-card hover:border-accent"}`}>
              {c ? `${CAT_ICON[c] ?? ""} ${c}` : "Todo"}
            </button>
          ))}
        </div>
        {scanMsg && <p role="status" className="chip warn !rounded-md !whitespace-normal mx-4 mt-3 block">{scanMsg}</p>}
        <div className="grid max-h-[72vh] gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((i) => (
            <button key={i.id} type="button" onClick={() => add(i.id)} className="flex flex-col rounded-xl border border-line bg-card p-4 text-left transition hover:border-accent hover:shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gray-bg text-[18px]">{CAT_ICON[i.cat] ?? "📦"}</span>
                <span className={`chip ${i.cond === "Nuevo" ? "ok" : "gray"}`}>{i.cond}</span>
              </div>
              <b className="block text-[15px] leading-snug">{i.name}</b>
              <span className="note block">{[i.spec, i.color].filter(Boolean).join(" · ") || "\u00a0"}</span>
              <div className="mt-3 flex items-end justify-between gap-2">
                <b className="text-[19px] tabular-nums">{i.price ? fmt(i.price) : <span className="chip warn">Sin precio</span>}</b>
                <span className="note mono">{isQty(i) ? `${i.qty} uds.` : i.serial ? `•••${i.serial.slice(-5)}` : ""}</span>
              </div>
              <span className="mt-2 text-[13px] font-semibold">+ Agregar</span>
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
        <div className="flex items-start justify-between border-b border-line pb-3">
          <div><h2 className="text-lg font-bold">Venta</h2><p className="note"><span className="chip gray">Borrador</span> {fdatey(today)}</p></div>
          {anyItem && !finishing && <button type="button" className="btn sm" onClick={() => { setLines([]); setTrades([]); setCustoms([]); }}>Vaciar</button>}
        </div>
        <div>
          {!anyItem ? (
            <div className="py-8 text-center">
              <div className="text-4xl">🛒</div>
              <b className="mt-2 block text-[15px]">Tu venta está vacía</b>
              <p className="note mt-1">Toca un producto de la izquierda, busca por IMEI o usa <b>📷 Escanear</b>.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map(({ l, it, noPrice }) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-0"><b className="block truncate text-[13px]">{it.name}{it.spec ? ` · ${it.spec}` : ""}</b><span className="note">{noPrice ? "Sin precio: escríbelo aquí" : fmt(it.price)}{it.color ? " · " + it.color : ""}</span></div>
                  {noPrice && <MoneyInput className={`!w-32 ${it.price > 0 ? "" : "!border-amber-t"}`} placeholder="Precio venta" aria-label={`Precio de ${it.name}`} value={typed[it.id] ?? ""} onChange={(x) => setTyped({ ...typed, [it.id]: x })} autoFocus />}
                  {isQty(it) && <input type="number" aria-label="Cantidad" className="!w-16" min={1} max={it.qty} value={l.qty} onChange={(e) => setQty(l.id, +e.target.value)} />}
                  <b className="tabular-nums w-24 text-right">{fmt(it.price * l.qty)}</b>
                  {!(finishing && finishing.id === l.id) && <button type="button" className="btn sm" aria-label={`Quitar ${it.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>}
                </li>
              ))}
            </ul>
          )}
          {customs.length > 0 && (
            <ul className="mt-2 space-y-2">{customs.map((c, k) => (
              <li key={k} className="flex items-center gap-2">
                <div className="flex-1 min-w-0"><b className="block truncate text-[13px]">{c.name}{c.spec ? ` · ${c.spec}` : ""}</b><span className="note">Fuera de inventario · {c.cat}{c.qty > 1 ? ` ×${c.qty}` : ""} · {c.cond}{c.supplier ? ` · de ${c.supplier}` : ""}{c.serial ? ` · ••${c.serial.slice(-6)}` : ""}</span></div>
                <b className="tabular-nums w-24 text-right">{fmt((+c.price || 0) * c.qty)}</b>
                <button type="button" className="btn sm" aria-label={`Quitar ${c.name}`} onClick={() => setCustoms(customs.filter((_, x) => x !== k))}>✕</button>
              </li>))}</ul>
          )}
          {!finishing && !hold && (cf ? (
            <div className="mt-3 space-y-2 rounded-lg border border-dashed border-line p-3">
              <b className="block text-[13px]">Producto fuera de inventario</b>
              <select aria-label="Categoría" value={cf.cat} onChange={(e) => setCf({ ...cf, cat: e.target.value as Cat, name: "", spec: "", color: "", serial: "", serial2: "", batt: "", qty: 1 })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              <ComboSelect ariaLabel="Modelo fuera de inventario" value={cf.name} options={CATALOG.filter((c) => c.cat === cf.cat).map((c) => c.name)} onChange={(x) => setCf({ ...cf, name: x })} placeholder={cf.cat === "Accesorios" ? "Producto…" : "Modelo…"} />
              <div className="grid grid-cols-2 gap-2">
                <ComboSelect ariaLabel="Capacidad" value={cf.spec} options={SPEC_OPTIONS[cf.cat]} onChange={(x) => setCf({ ...cf, spec: x })} placeholder={cf.cat === "iPhone" || cf.cat === "iPad" ? "Capacidad…" : "Detalle…"} />
                <ComboSelect ariaLabel="Color" value={cf.color} options={COLOR_OPTIONS[cf.cat]} onChange={(x) => setCf({ ...cf, color: x })} placeholder="Color…" />
                {cf.cat !== "Accesorios" && <input className="mono" placeholder={cf.cat === "iPhone" ? "IMEI 1 / serial" : "Serial (opcional)"} aria-label="IMEI fuera de inventario" value={cf.serial} onChange={(e) => setCf({ ...cf, serial: e.target.value })} />}
                {cf.cat === "iPhone" && <input className="mono" placeholder="IMEI 2 (opcional)" aria-label="IMEI 2 fuera de inventario" inputMode="numeric" value={cf.serial2} onChange={(e) => setCf({ ...cf, serial2: e.target.value.replace(/\D/g, "").slice(0, 15) })} />}
                {(cf.cat === "iPhone" || cf.cat === "iPad" || cf.cat === "Mac" || cf.cat === "Apple Watch") && <input type="number" min={0} max={100} placeholder={cf.cat === "iPhone" ? "Salud batería % *" : "Batería % (opcional)"} aria-label="Batería fuera de inventario" value={cf.batt} onChange={(e) => setCf({ ...cf, batt: e.target.value })} />}
                {(cf.cat === "AirPods" || cf.cat === "Accesorios") && <input type="number" min={1} max={1000} placeholder="Cantidad" aria-label="Cantidad fuera de inventario" value={cf.qty} onChange={(e) => setCf({ ...cf, qty: Math.max(1, Math.min(1000, +e.target.value || 1)) })} />}
                <select aria-label="Condición" value={cf.cond} onChange={(e) => setCf({ ...cf, cond: e.target.value, warr: String(warr[e.target.value] ?? cf.warr) })}>{["Nuevo", "Exhibición", "Reacondicionado", "Pre-owned", "Usado"].map((x) => <option key={x}>{x}</option>)}</select>
                <input type="number" min={0} max={60} placeholder="Garantía (meses)" aria-label="Garantía meses" value={cf.warr} onChange={(e) => setCf({ ...cf, warr: e.target.value })} />
                <MoneyInput placeholder="Precio de venta" aria-label="Precio fuera de inventario" value={cf.price} onChange={(x) => setCf({ ...cf, price: x })} />
                <input className="col-span-2" list="tiendas-aliadas" placeholder="Tienda proveedora (de dónde se consiguió)" aria-label="Tienda proveedora" maxLength={80} value={cf.supplier} onChange={(e) => setCf({ ...cf, supplier: e.target.value })} />
                <datalist id="tiendas-aliadas">{allies.map((a) => <option key={a.id} value={a.name} />)}</datalist>
                {cf.supplier.trim() && <p className="note col-span-2">{allies.some((a) => a.name.trim().toLowerCase() === cf.supplier.trim().toLowerCase()) ? "Tienda aliada existente: se suma a lo que se le debe." : "Tienda nueva: se crea sola en Cartera → Tiendas aliadas."}</p>}
                {(can.cost || cf.supplier.trim()) && <MoneyInput placeholder={cf.supplier.trim() ? "Lo que se le paga a la tienda *" : "Costo (opcional)"} aria-label="Costo fuera de inventario" value={cf.cost} onChange={(x) => setCf({ ...cf, cost: x })} />}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn primary sm" disabled={cf.name.trim().length < 2 || !(+cf.price > 0) || (!!cf.supplier.trim() && !(+cf.cost > 0)) || (cf.cat === "iPhone" && cf.batt === "")} onClick={() => { setCustoms([...customs, cf]); setCf(null); }}>Agregar a la venta</button>
                <button type="button" className="btn sm" onClick={() => setCf(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn sm mt-3" onClick={() => setCf(blankCustom)}>+ Producto fuera de inventario</button>
          ))}
        </div>

        {!finishing && !hold && (
          <div>
            <DateField id="sale-date" label="Fecha de la venta" value={saleDate} maxDays={0} onChange={setSaleDate} quick={[["Hoy", 0], ["Ayer", -1]]} clearable hint="Vacío = hoy, ahora" />
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[12px] font-bold uppercase tracking-widest text-t2">Cliente</h3><span className="note">{hold || trades.length ? "obligatorio" : "opcional"}</span></div>
          {finishing ? <p className="text-t2">{clients.find((c) => c.id === client)?.name ?? "—"}</p> : !newC ? (client ? (
            <div className="flex items-center gap-3 rounded-lg border border-accent p-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[12px] font-bold text-white">{initials(clients.find((c) => c.id === client)?.name ?? "")}</span>
              <div className="flex-1 min-w-0"><b className="block truncate">{clients.find((c) => c.id === client)?.name}</b><span className="note">{[clients.find((c) => c.id === client)?.phone, clients.find((c) => c.id === client)?.doc].filter(Boolean).join(" · ")}</span></div>
              <button type="button" className="btn sm" onClick={() => setClient("")}>Cambiar</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3">🔍</span>
                <input className="!pl-9" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Buscar por nombre, teléfono o documento" aria-label="Buscar cliente" /></div>
              {clients.filter((c) => { const t = cq.toLowerCase().trim(); return !t || `${c.name} ${c.phone} ${c.doc}`.toLowerCase().includes(t); }).slice(0, 5).map((c) => (
                <button key={c.id} type="button" onClick={() => { setClient(c.id); setCq(""); }} className="flex w-full items-center gap-3 rounded-lg border border-line p-3 text-left hover:border-accent">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-[12px] font-bold text-white">{initials(c.name)}</span>
                  <span className="min-w-0"><b className="block truncate">{c.name}</b><span className="note">{[c.phone, c.doc].filter(Boolean).join(" · ")}</span></span>
                </button>
              ))}
              <button type="button" onClick={() => { setNewC(true); setClient(""); setNc({ ...nc, name: cq }); }} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line p-3 text-left hover:border-accent">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gray-bg text-lg">+</span>
                <span><b className="block">Crear cliente nuevo</b><span className="note">Nombre y teléfono</span></span>
              </button>
              {!hold && <p className="note">Sin cliente se registra como venta de mostrador.</p>}
            </div>
          )) : (
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2" placeholder="Nombre completo" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} aria-label="Nombre del cliente" />
              <input placeholder="Cédula / NIT" value={nc.doc} onChange={(e) => setNc({ ...nc, doc: e.target.value })} />
              <input placeholder="Celular" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
              <input className="col-span-2" placeholder="Dirección" aria-label="Dirección del cliente" value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} />
              <input className="col-span-2" placeholder="Correo" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
              <button type="button" className="btn sm col-span-2" onClick={() => setNewC(false)}>Usar un cliente existente</button>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Descuento</h3>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <select value={discType} onChange={(e) => setDiscType(e.target.value as "pct" | "cop")} aria-label="Tipo de descuento"><option value="pct">%</option><option value="cop">$</option></select>
            {discType === "cop" ? <MoneyInput value={disc} onChange={setDisc} aria-label="Valor del descuento" /> : <input type="number" min={0} max={100} step="0.5" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" aria-label="Valor del descuento" />}
          </div>
          {T.pct > 0 && <input className="mt-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del descuento" aria-label="Motivo del descuento" />}
        </div>

        {hold ? (
          <div>
            <h3 className="font-semibold mb-2">Abono inicial</h3>
            <div className="grid grid-cols-2 gap-2"><MoneyInput value={abono} onChange={(x) => setAbono(x)} placeholder={min ? `Mínimo ${fmt(min)}` : "Valor"} aria-label="Abono" />
              <select value={abonoMethod} onChange={(e) => setAbonoMethod(e.target.value)} aria-label="Método del abono">{cfg.methods.map((m) => <option key={m}>{m}</option>)}</select></div>
            <p className="note mt-1">Mínimo {cfg.apartadoMinPct}% ({fmt(min)})</p>
            <div className="mt-2"><DateField id="hold-until" label="Vence el" value={holdUntil} onChange={setHoldUntil} minDays={0} maxDays={180} quick={[["1 semana", 7], ["15 días", 15], ["1 mes", 30]]} /></div>
          </div>
        ) : <>
          {can.tradein && (
            <div>
              <h3 className="font-semibold mb-2">Retoma (equipo como parte de pago)</h3>
              {trades.map((t, i) => (
                <div key={i} className="mb-2 flex items-center gap-2 rounded-lg border border-line p-2 text-[13px]">
                  <span className="flex-1 min-w-0 truncate">🔄 {t.label}</span><b className="tabular-nums">−{fmt(t.offer)}</b>
                  <button type="button" className="btn sm" aria-label="Quitar retoma" onClick={() => setTrades(trades.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {trades.length < 3 && <button type="button" className="btn sm" onClick={() => setTradeOpen(true)}>+ Recibir un equipo</button>}
            </div>
          )}
          {due > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Pago</h3>
            <div className="space-y-2">
              {pays.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} aria-label="Método de pago">{cfg.methods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  <MoneyInput value={p.amount} placeholder={i === autoIdx ? String(resolved[i].amount) : ""} onChange={(val) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: val } : x)))} aria-label="Valor del pago" />
                  {fees[i] > 0 && <span className="col-span-3 -mt-1 text-[12px] text-amber-t">+ recargo {p.method} (÷ {((100 - pct(p.method)) / 100).toLocaleString("es-CO")}): {fmt(fees[i])} · el cliente paga {fmt(resolved[i].amount + fees[i])}</span>}
                  {pays.length > 1 ? <button type="button" className="btn sm" aria-label="Quitar pago" onClick={() => setPays(pays.filter((_, j) => j !== i))}>✕</button> : <span />}
                </div>
              ))}
              <button type="button" className="btn sm" onClick={() => setPays([...pays.map((p, i) => (p.amount === "" ? { ...p, amount: String(resolved[i].amount) } : p)), { method: cfg.methods.find((m) => m !== pays[pays.length - 1]?.method) ?? cfg.methods[0], amount: "" }])}>+ Dividir pago</button>
            </div>
            {pays.length === 1 && pays[0].method === "Efectivo" && (
              <div className="mt-2"><MoneyInput value={cash} onChange={(x) => setCash(x)} placeholder="Efectivo recibido (opcional)" aria-label="Efectivo recibido" />
                {+cash >= due && due > 0 && <p className="note mt-1">Devuelta: <b>{fmt(+cash - due)}</b></p>}</div>
            )}
          </div>
          )}
        </>}
        <div><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" aria-label="Notas" /></div>

        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><span className="text-t2">Subtotal</span><span>{fmt(T.sub)}</span></div>
          {T.discAmt > 0 && <div className="flex justify-between"><span className="text-t2">Descuento ({+T.pct.toFixed(1)}%)</span><span className="text-red-t">−{fmt(T.discAmt)}</span></div>}
          {T.prepaid > 0 && <div className="flex justify-between"><span className="text-t2">Abonos del apartado</span><span className="text-green-t">−{fmt(T.prepaid)}</span></div>}
          {tradeTotal > 0 && <div className="flex justify-between"><span className="text-t2">Retoma ({trades.length})</span><span className="text-green-t">−{fmt(tradeTotal)}</span></div>}
          {feeTotal > 0 && <div className="flex justify-between"><span className="text-t2">Recargo por forma de pago</span><span className="text-amber-t">+{fmt(feeTotal)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>{hold ? "Total del equipo" : "Total a pagar"}</span><span className="tabular-nums">{fmt(hold ? T.total : Math.max(0, due) + feeTotal)}</span></div>
        </div>
        <button type="button" className="btn primary w-full !py-3" disabled={!!why || busy} onClick={confirm}>
          {hold ? `🔒 Crear apartado · abono ${fmt(+abono || 0)}` : due > 0 ? `Cobrar ${fmt(due + feeTotal)}` : "Emitir comprobante"}
        </button>
        {why && cart.length > 0 && <p className="note" role="status">{why}</p>}
        {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      </section>
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onUse={(r) => {
        const codes = [r.imei, r.imei2, r.serial].filter(Boolean).map((x) => x!.toUpperCase());
        const hit = items.find((i) => codes.some((c) => (i.serial && i.serial.toUpperCase() === c) || (i.serial2 && i.serial2 === c)));
        if (hit) { add(hit.id); setScanMsg(""); setQ(""); }
        else { setQ(codes[0] ?? ""); setScanMsg(codes.length ? `No hay un equipo disponible con ${codes[0]}: puede estar vendido, apartado o en revisión.` : "No se leyó un IMEI ni un serial. Intenta de nuevo con más luz."); }
      }} />}
      {tradeOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Recibir equipo como parte de pago">
          <div className="mx-auto max-w-[1100px] rounded-xl bg-bg p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Recibir equipo como parte de pago</h2><button type="button" className="btn sm" onClick={() => setTradeOpen(false)}>Cerrar</button></div>
            <TradeinForm warr={warr} mode="venta" onAccept={(p) => {
              if (trades.some((t) => t.item.serial && t.item.serial === p.item.serial)) return;
              setTrades([...trades, p]); setTradeOpen(false); setPays(pays.map((x) => ({ ...x, amount: "" })));
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
