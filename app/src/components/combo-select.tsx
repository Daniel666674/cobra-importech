"use client";
import { useState } from "react";

const OTHER = "__otro__";

/** Menú desplegable con «Otro…»: elige de la lista o escribe un valor que no esté. */
export function ComboSelect({ id, value, options, onChange, placeholder = "Elige…", ariaLabel, className }: {
  id?: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; className?: string;
}) {
  const inList = !value || options.includes(value);
  const [typing, setTyping] = useState(!inList);
  if (typing || !inList)
    return (
      <div className={`flex gap-1 ${className ?? ""}`}>
        <input id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Escribe…" autoFocus={typing && inList} />
        {options.length > 0 && <button type="button" className="btn sm" title="Volver a la lista" aria-label="Volver a la lista" onClick={() => { setTyping(false); onChange(""); }}>☰</button>}
      </div>
    );
  return (
    <select id={id} aria-label={ariaLabel} className={className} value={value} onChange={(e) => (e.target.value === OTHER ? (setTyping(true), onChange("")) : onChange(e.target.value))}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value={OTHER}>Otro… (escribir)</option>
    </select>
  );
}
