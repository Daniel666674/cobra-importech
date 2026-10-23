"use client";
import type { InputHTMLAttributes } from "react";
import { fmtCopInput } from "@/lib/money";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string; onChange: (digits: string) => void; negative?: boolean;
};

/**
 * Campo de pesos (sin decimales). Se muestra con puntos de miles mientras se escribe (1.500.000) y entrega solo los
 * dígitos. Reemplaza a <input type="number">, que en Colombia lee «1.500.000» como decimal o vacío y no deja guardar.
 */
export function MoneyInput({ value, onChange, negative, placeholder = "0", ...rest }: Props) {
  const neg = negative && String(value).startsWith("-");
  return (
    <input {...rest} type="text" inputMode="numeric" autoComplete="off" placeholder={placeholder}
      value={(neg ? "-" : "") + fmtCopInput(value)}
      onChange={(e) => {
        let t = e.target.value.trim();
        // Si pegan un valor con centavos («1.500.000,50») se ignoran los centavos.
        t = t.replace(/[.,]\d{1,2}$/, "");
        onChange((negative && t.startsWith("-") ? "-" : "") + t.replace(/\D/g, ""));
      }} />
  );
}
