"use client";
import { useMemo, useState } from "react";
import { CATALOG, CONDS, listPrice, type Cat } from "@/lib/catalog";

export type ItemFormValues = {
  name: string; spec: string; color: string; cond: string; serial: string; qty: string; cost: string; price: string;
  warr: string; src: string; batt: string; notes: string; min: string;
};
export const emptyItem = (cat: Cat, warr = 12): ItemFormValues => ({
  name: "", spec: "", color: "", cond: "Nuevo", serial: "", qty: "1", cost: "", price: "", warr: String(warr),
  src: "Importación", batt: cat === "iPhone" ? "100" : "", notes: "", min: cat === "AirPods" || cat === "Accesorios" ? "3" : "0",
});

type Props = {
  cat: Cat;
  values: ItemFormValues;
  onChange: (v: ItemFormValues) => void;
  warrByCond: Record<string, number>;
  serialLocked?: boolean;
  showCost?: boolean;
  hideSerial?: boolean;
};

const Field = ({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="lb" htmlFor={id}>{label}</label>
    {children}
    {hint && <p className="note mt-1">{hint}</p>}
  </div>
);

export function ItemForm({ cat, values: v, onChange, warrByCond, serialLocked, showCost = true, hideSerial }: Props) {
  const [touchedPrice, setTouchedPrice] = useState(false);
  const models = useMemo(() => CATALOG.filter((c) => c.cat === cat), [cat]);
  const qtyTrack = cat === "AirPods" || cat === "Accesorios";
  const set = (patch: Partial<ItemFormValues>) => {
    const next = { ...v, ...patch };
    if (("name" in patch || "spec" in patch || "cond" in patch) && !touchedPrice) {
      const p = listPrice(next.name, next.spec, next.cond);
      if (p) next.price = String(p);
    }
    if ("cond" in patch && patch.cond && warrByCond[patch.cond] != null) next.warr = String(warrByCond[patch.cond]);
    onChange(next);
  };
  const margin = +v.price && +v.cost ? Math.round(((+v.price - +v.cost) / +v.price) * 100) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="i-name" label="Producto">
        <input id="i-name" list="models" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. iPhone 16 Pro" />
        <datalist id="models">{models.map((m) => <option key={m.name} value={m.name} />)}</datalist>
      </Field>
      <Field id="i-spec" label={cat === "iPhone" || cat === "iPad" ? "Capacidad" : "Detalle"}>
        <input id="i-spec" value={v.spec} onChange={(e) => set({ spec: e.target.value })} placeholder={cat === "iPhone" ? "256 GB" : ""} />
      </Field>
      <Field id="i-color" label="Color"><input id="i-color" value={v.color} onChange={(e) => set({ color: e.target.value })} /></Field>
      <Field id="i-cond" label="Condición">
        <select id="i-cond" value={v.cond} onChange={(e) => set({ cond: e.target.value })}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      {!hideSerial && !qtyTrack && (
        <Field id="i-serial" label={cat === "iPhone" ? "IMEI" : "Número de serie"}>
          <input id="i-serial" className="mono" value={v.serial} readOnly={serialLocked} onChange={(e) => set({ serial: e.target.value })} />
        </Field>
      )}
      {qtyTrack && (
        <>
          <Field id="i-qty" label="Cantidad"><input id="i-qty" type="number" min={0} value={v.qty} onChange={(e) => set({ qty: e.target.value })} /></Field>
          <Field id="i-min" label="Stock mínimo (alerta)"><input id="i-min" type="number" min={0} value={v.min} onChange={(e) => set({ min: e.target.value })} /></Field>
        </>
      )}
      {showCost && <Field id="i-cost" label="Costo (COP)"><input id="i-cost" type="number" min={0} step={1000} value={v.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>}
      <Field id="i-price" label="Precio de venta (COP)" hint={margin != null ? `Margen ${margin}%` : "Se sugiere según el modelo y la condición"}>
        <input id="i-price" type="number" min={0} step={1000} value={v.price} onChange={(e) => { setTouchedPrice(true); set({ price: e.target.value }); }} />
      </Field>
      <Field id="i-warr" label="Garantía (meses)"><input id="i-warr" type="number" min={0} max={60} value={v.warr} onChange={(e) => set({ warr: e.target.value })} /></Field>
      {(cat === "iPhone" || cat === "iPad" || cat === "Apple Watch" || cat === "Mac") && (
        <Field id="i-batt" label="Batería (%)"><input id="i-batt" type="number" min={0} max={100} value={v.batt} onChange={(e) => set({ batt: e.target.value })} /></Field>
      )}
      <Field id="i-src" label="Origen"><input id="i-src" value={v.src} onChange={(e) => set({ src: e.target.value })} placeholder="Importación, Trade-in…" /></Field>
      <div className="sm:col-span-2"><Field id="i-notes" label="Notas"><textarea id="i-notes" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field></div>
    </div>
  );
}

export const toPayload = (cat: Cat, v: ItemFormValues, extra: Record<string, unknown> = {}) => ({
  cat, name: v.name, spec: v.spec, color: v.color, cond: v.cond, serial: v.serial, qty: v.qty || 1, cost: v.cost || 0,
  price: v.price, warr: v.warr || 0, src: v.src, batt: v.batt === "" ? null : v.batt, notes: v.notes, min: v.min || 0, ...extra,
});
