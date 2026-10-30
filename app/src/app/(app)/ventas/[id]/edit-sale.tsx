"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { editSaleAction } from "@/app/actions/sales";
import { DateField } from "@/components/date-field";
import { MoneyInput } from "@/components/money-input";
import { fmt } from "@/lib/format";
import { saleNet } from "@/lib/sales";

export type EditableSale = {
  id: string; no: string; t: number; disc: number; notes: string; prepaid: number;
  lines: { name: string; item: string; qty: number; ret: number; price: number; cost: number; warr: number; serial: string; serial2: string; batt: number | null }[];
  payments: { method: string; amount: number; t?: number }[];
};

/** Corrige una venta guardada: fecha, precios, costos, seriales, batería, garantía, descuento y pagos. */
export function EditSale({ sale, methods }: { sale: EditableSale; methods: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<number | null>(sale.t);
  const [disc, setDisc] = useState(String(sale.disc));
  const [notes, setNotes] = useState(sale.notes);
  const [lines, setLines] = useState(sale.lines.map((l) => ({ ...l, price: String(l.price), cost: String(l.cost), warr: String(l.warr), qty: String(l.qty), batt: l.batt == null ? "" : String(l.batt) })));
  const [pays, setPays] = useState(sale.payments.map((p) => ({ method: p.method, amount: String(p.amount), t: p.t })));
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>✏️ Editar venta</button>;

  const total = saleNet({ lines: lines.map((l) => ({ ...l, qty: +l.qty || 1, price: +l.price || 0, cost: +l.cost || 0, warr: +l.warr || 0, ret: l.ret, batt: null })) as never, disc: +disc || 0 });
  const paid = pays.reduce((a, p) => a + (+p.amount || 0), 0);
  const pending = Math.max(0, total - sale.prepaid - paid);
  const setL = (i: number, k: string, x: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: x } : l)));
  const save = () => start(async () => {
    setErr("");
    const r = await editSaleAction(sale.id, {
      date, notes, disc: +disc || 0,
      lines: lines.map((l) => ({ price: l.price, cost: l.cost, warr: l.warr, serial: l.serial, serial2: l.serial2, batt: l.batt, ...(l.item ? {} : { qty: l.qty }) })),
      payments: pays.map((p) => ({ method: p.method, amount: p.amount || "0", t: p.t })),
    });
    if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error);
  });
  return (
    <div className="card w-full space-y-4 p-4">
      <h3 className="font-semibold">Editar la venta {sale.no}</h3>
      <p className="note">Todo se puede dejar incompleto. El total y el saldo pendiente se calculan solos. Las unidades de productos del inventario no se cambian aquí (usa «Devolución»).</p>
      <DateField id="es-date" label="Fecha de la venta" value={date} maxDays={0} onChange={setDate} quick={[["Hoy", 0], ["Ayer", -1]]} />
      {lines.map((l, i) => (
        <div key={i} className="rounded-lg border border-line p-3">
          <b className="block text-[13px]">{l.name}</b>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><label className="lb" htmlFor={`es-p${i}`}>Precio unitario</label><MoneyInput id={`es-p${i}`} value={l.price} onChange={(x) => setL(i, "price", x)} /></div>
            <div><label className="lb" htmlFor={`es-c${i}`}>Costo unitario</label><MoneyInput id={`es-c${i}`} value={l.cost} onChange={(x) => setL(i, "cost", x)} /></div>
            <div><label className="lb" htmlFor={`es-q${i}`}>Cantidad</label><input id={`es-q${i}`} type="number" min={1} disabled={!!l.item} value={l.qty} onChange={(e) => setL(i, "qty", e.target.value)} /></div>
            <div><label className="lb" htmlFor={`es-w${i}`}>Garantía (meses)</label><input id={`es-w${i}`} type="number" min={0} max={60} value={l.warr} onChange={(e) => setL(i, "warr", e.target.value)} /></div>
            <div><label className="lb" htmlFor={`es-s${i}`}>IMEI / serial</label><input id={`es-s${i}`} className="mono" value={l.serial} onChange={(e) => setL(i, "serial", e.target.value)} /></div>
            <div><label className="lb" htmlFor={`es-s2${i}`}>IMEI 2</label><input id={`es-s2${i}`} className="mono" value={l.serial2} onChange={(e) => setL(i, "serial2", e.target.value)} /></div>
            <div><label className="lb" htmlFor={`es-b${i}`}>Batería %</label><input id={`es-b${i}`} type="number" min={0} max={100} value={l.batt} onChange={(e) => setL(i, "batt", e.target.value)} /></div>
          </div>
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="lb" htmlFor="es-disc">Descuento (%)</label><input id="es-disc" type="number" min={0} max={100} step="any" value={disc} onChange={(e) => setDisc(e.target.value)} /></div>
        <div><label className="lb" htmlFor="es-notes">Notas</label><input id="es-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div>
        <b className="block text-[13px] mb-1">Pagos</b>
        {pays.map((p, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <select aria-label="Forma de pago" value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>{[...new Set([...methods, p.method])].map((m) => <option key={m}>{m}</option>)}</select>
            <MoneyInput aria-label="Valor del pago" value={p.amount} onChange={(x) => setPays(pays.map((y, j) => (j === i ? { ...y, amount: x } : y)))} />
            <button type="button" className="btn sm" aria-label="Quitar pago" onClick={() => setPays(pays.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => setPays([...pays, { method: methods[0], amount: "", t: undefined }])}>+ Agregar pago</button>
      </div>
      <p className="text-[13px]">Total: <b>{fmt(total)}</b> · Pagado: <b>{fmt(paid + sale.prepaid)}</b>{pending > 0 && <> · <b className="text-red-600">Saldo pendiente: {fmt(pending)}</b></>}</p>
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2"><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar cambios"}</button><button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button></div>
    </div>
  );
}
