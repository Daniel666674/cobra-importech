"use client";
import { useMemo } from "react";
import { CATALOG, COLOR_OPTIONS, CONDS, SPEC_OPTIONS, type Cat } from "@/lib/catalog";
import { ComboSelect } from "./combo-select";

export type ItemFormValues = {
  name: string; spec: string; color: string; cond: string; serial: string; serial2: string; qty: string; cost: string; price: string;
  warr: string; src: string; batt: string; notes: string; min: string; ally: string;
};
export const emptyItem = (cat: Cat, warr = 12): ItemFormValues => ({
  name: "", spec: "", color: "", cond: "Nuevo", serial: "", serial2: "", qty: "1", cost: "", price: "", warr: String(warr),
  src: "Propio", batt: "", notes: "", min: cat === "AirPods" || cat === "Accesorios" ? "3" : "0", ally: "",
});

type Props = {
  cat: Cat;
  values: ItemFormValues;
  onChange: (v: ItemFormValues) => void;
  warrByCond: Record<string, number>;
  serialLocked?: boolean;
  showCost?: boolean;
  hideSerial?: boolean;
  /** Tiendas aliadas activas; si hay, se puede elegir de quién es el producto. */
  allies?: { id: string; name: string }[];
  /** Costo de reparaciones ya hechas (se suma al costo en la fórmula del precio). */
  repairs?: number;
};

const Field = ({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="lb" htmlFor={id}>{label}</label>
    {children}
    {hint && <p className="note mt-1">{hint}</p>}
  </div>
);

export function ItemForm({ cat, values: v, onChange, warrByCond, serialLocked, showCost = true, hideSerial, allies = [], repairs = 0 }: Props) {
  const base = (+v.cost || 0) + repairs;
  const models = useMemo(() => CATALOG.filter((c) => c.cat === cat), [cat]);
  const qtyTrack = cat === "AirPods" || cat === "Accesorios";
  const set = (patch: Partial<ItemFormValues>) => {
    const next = { ...v, ...patch };
    if ("cond" in patch && patch.cond && warrByCond[patch.cond] != null) next.warr = String(warrByCond[patch.cond]);
    onChange(next);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="i-name" label="Producto">
        <ComboSelect id="i-name" value={v.name} options={models.map((m) => m.name)} onChange={(x) => set({ name: x })} placeholder="Elige el modelo…" />
      </Field>
      <Field id="i-spec" label={cat === "iPhone" || cat === "iPad" ? "Capacidad" : "Detalle"}>
        <ComboSelect id="i-spec" value={v.spec} options={SPEC_OPTIONS[cat]} onChange={(x) => set({ spec: x })} />
      </Field>
      <Field id="i-color" label="Color"><ComboSelect id="i-color" value={v.color} options={COLOR_OPTIONS[cat]} onChange={(x) => set({ color: x })} /></Field>
      <Field id="i-cond" label="Condición">
        <select id="i-cond" value={v.cond} onChange={(e) => set({ cond: e.target.value })}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      {!hideSerial && !qtyTrack && (
        <Field id="i-serial" label={cat === "iPhone" ? "IMEI" : "Número de serie"}>
          <input id="i-serial" className="mono" value={v.serial} readOnly={serialLocked} onChange={(e) => set({ serial: e.target.value })} />
        </Field>
      )}
      {!hideSerial && cat === "iPhone" && (
        <Field id="i-serial2" label="IMEI 2 (opcional)" hint="Equipos con doble SIM / eSIM">
          <input id="i-serial2" className="mono" inputMode="numeric" maxLength={15} value={v.serial2} onChange={(e) => set({ serial2: e.target.value.replace(/\D/g, "").slice(0, 15) })} />
        </Field>
      )}
      {qtyTrack && (
        <>
          <Field id="i-qty" label="Cantidad"><input id="i-qty" type="number" min={0} value={v.qty} onChange={(e) => set({ qty: e.target.value })} /></Field>
          <Field id="i-min" label="Stock mínimo (alerta)"><input id="i-min" type="number" min={0} value={v.min} onChange={(e) => set({ min: e.target.value })} /></Field>
        </>
      )}
      {allies.length > 0 && (
        <Field id="i-ally" label="¿De quién es el producto?" hint={v.ally ? "El costo es lo que se le paga a la tienda aliada" : undefined}>
          <select id="i-ally" value={v.ally} onChange={(e) => set({ ally: e.target.value })}><option value="">Propio de la tienda</option>{allies.map((a) => <option key={a.id} value={a.id}>Tienda aliada: {a.name}</option>)}</select>
        </Field>
      )}
      {showCost && <Field id="i-cost" label={v.ally ? "Se le paga a la aliada (COP)" : "Costo (COP)"}><input id="i-cost" type="number" min={0} step={1000} value={v.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>}
      {showCost && (
        <Field id="i-gain" label={v.ally ? "Gana la tienda (COP)" : "Ganancia sobre el costo (COP)"} hint={repairs ? `Precio = costo $${(+v.cost || 0).toLocaleString("es-CO")} + reparaciones $${repairs.toLocaleString("es-CO")} + ganancia` : "Precio de venta = costo + ganancia"}>
          <input id="i-gain" type="number" step={10000} value={+v.price && v.cost !== "" ? String(+v.price - base) : ""} onChange={(e) => set({ price: e.target.value === "" ? "" : String(base + (+e.target.value || 0)) })} />
        </Field>
      )}
      <Field id="i-price" label="Precio de venta (COP)">
        <input id="i-price" type="number" min={0} step={1000} value={v.price} onChange={(e) => { set({ price: e.target.value }); }} />
      </Field>
      <Field id="i-warr" label="Garantía (meses)"><input id="i-warr" type="number" min={0} max={60} value={v.warr} onChange={(e) => set({ warr: e.target.value })} /></Field>
      {(cat === "iPhone" || cat === "iPad" || cat === "Apple Watch" || cat === "Mac") && (
        <Field id="i-batt" label={cat === "iPhone" ? "Salud de batería (%) *" : "Batería (%)"}><input id="i-batt" type="number" required={cat === "iPhone"} placeholder="Ej. 87" min={0} max={100} value={v.batt} onChange={(e) => set({ batt: e.target.value })} /></Field>
      )}
      {!v.ally && <Field id="i-src" label="Origen"><input id="i-src" value={v.src} onChange={(e) => set({ src: e.target.value })} placeholder="Propio, compra local…" /></Field>}
      <div className="sm:col-span-2"><Field id="i-notes" label="Notas"><textarea id="i-notes" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field></div>
    </div>
  );
}

export const toPayload = (cat: Cat, v: ItemFormValues, extra: Record<string, unknown> = {}) => ({
  cat, name: v.name, spec: v.spec, color: v.color, cond: v.cond, serial: v.serial, serial2: v.serial2, qty: v.qty || 1, cost: v.cost || 0,
  price: v.price, warr: v.warr || 0, src: v.src, batt: v.batt === "" ? null : v.batt, notes: v.notes, min: v.min || 0, ally: v.ally, ...extra,
});
