"use client";
import { useRef } from "react";
import { codeFor, ScanButton } from "@/components/scan-button";

/** Caja de búsqueda con botón de cámara: al escanear un IMEI o serial se escribe en la caja y se busca solo. */
export function ScanSearch({ name = "q", defaultValue = "", placeholder, ariaLabel }: { name?: string; defaultValue?: string; placeholder: string; ariaLabel: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-1.5">
      <input ref={ref} name={name} defaultValue={defaultValue} placeholder={placeholder} aria-label={ariaLabel} />
      <ScanButton onRead={(r) => {
        const code = codeFor(r, "serial");
        if (!code || !ref.current) return;
        ref.current.value = code;
        ref.current.form?.requestSubmit();
      }} />
    </div>
  );
}
