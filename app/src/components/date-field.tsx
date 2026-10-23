"use client";
import { useState } from "react";

/** yyyy-mm-dd (fecha local) ↔ milisegundos al mediodía local (evita saltos de día por zona horaria). */
export const toYmd = (t: number | null | undefined) => {
  if (t == null) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromYmd = (s: string) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
const addDays = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); };

/**
 * Campo de fecha con calendario (el selector del navegador o del celular) y atajos rápidos.
 * `value`/`onChange` en milisegundos; null = sin fecha.
 */
export function DateField({ id, label, value, onChange, minDays, maxDays, quick = [], clearable, hint }: {
  id: string; label: string; value: number | null; onChange: (t: number | null) => void;
  /** Límites relativos a hoy, en días (p. ej. minDays 0 = desde hoy; maxDays 0 = hasta hoy). */
  minDays?: number; maxDays?: number; quick?: [string, number][]; clearable?: boolean; hint?: string;
}) {
  const [now] = useState(() => Date.now());
  const min = minDays != null ? now + minDays * 864e5 : undefined, max = maxDays != null ? now + maxDays * 864e5 : undefined;
  const left = value != null ? Math.round((fromYmd(toYmd(value))! - fromYmd(toYmd(now))!) / 864e5) : null;
  return (
    <div>
      <label className="lb" htmlFor={id}>📅 {label}</label>
      <input id={id} type="date" value={toYmd(value)} min={min != null ? toYmd(min) : undefined} max={max != null ? toYmd(max) : undefined}
        onChange={(e) => onChange(fromYmd(e.target.value))} onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()} />
      {(quick.length > 0 || clearable) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {quick.map(([l, n]) => <button key={l} type="button" className="btn sm !py-0.5 !text-[11.5px]" onClick={() => onChange(addDays(n))}>{l}</button>)}
          {clearable && value != null && <button type="button" className="btn sm !py-0.5 !text-[11.5px]" onClick={() => onChange(null)}>Sin fecha</button>}
        </div>
      )}
      {left != null && <p className="note mt-1">{left === 0 ? "Hoy" : left > 0 ? `En ${left} día(s)` : `Hace ${-left} día(s)`}{hint ? ` · ${hint}` : ""}</p>}
      {left == null && hint && <p className="note mt-1">{hint}</p>}
    </div>
  );
}
