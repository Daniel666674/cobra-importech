"use client";
import { useState } from "react";
import { PW_MAX, PW_MIN, PW_PASSPHRASE, passwordProblem, passwordScore } from "@/lib/password";

const LEVEL = ["", "Débil", "Regular", "Buena", "Fuerte"];
const COLOR = ["", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-green-600"];

/** Campo de contraseña con botón para ver/ocultar y, si es nueva, medidor y reglas. */
export function PasswordInput({ id, name, label, autoComplete, value, onChange, strength, ctx, autoFocus }: {
  id: string; name: string; label: string; autoComplete: "current-password" | "new-password";
  value?: string; onChange?: (v: string) => void; strength?: boolean; ctx?: { name?: string; username?: string; business?: string }; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [own, setOwn] = useState("");
  const v = value ?? own;
  const score = passwordScore(v);
  const problem = strength && v ? passwordProblem(v, ctx) : null;
  return (
    <div>
      <label className="lb" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} maxLength={PW_MAX} required autoFocus={autoFocus}
          value={v} onChange={(e) => (onChange ? onChange(e.target.value) : setOwn(e.target.value))} aria-describedby={strength ? `${id}-help` : undefined} />
        <button type="button" className="btn sm whitespace-nowrap" onClick={() => setShow(!show)} aria-pressed={show} aria-controls={id}>{show ? "Ocultar" : "Ver"}</button>
      </div>
      {strength && (
        <div id={`${id}-help`} className="mt-1.5 space-y-1">
          <div className="flex gap-1" aria-hidden>{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded ${v && i <= score ? COLOR[score] : "bg-gray-200"}`} />)}</div>
          <p className={`note ${problem ? "!text-red-t" : ""}`} aria-live="polite">
            {!v ? `Mínimo ${PW_MIN} caracteres combinando mayúsculas, minúsculas, números y símbolos, o una frase de ${PW_PASSPHRASE}+ caracteres.` : problem ?? `${LEVEL[score]} ✓`}
          </p>
        </div>
      )}
    </div>
  );
}
