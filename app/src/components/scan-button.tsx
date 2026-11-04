"use client";
import { useState } from "react";
import { ScanDialog } from "@/components/scan-dialog";
import type { ScanRead } from "@/lib/scan-parse";

/** Código que le sirve a cada tipo de campo: el IMEI, el segundo IMEI o el serial. */
export function codeFor(r: ScanRead, kind: "imei" | "imei2" | "serial"): string {
  if (kind === "imei") return r.imei ?? r.serial ?? "";
  if (kind === "imei2") return r.imei2 ?? r.imei ?? "";
  return r.serial ?? r.imei ?? "";
}

/** Botón 📷 que abre el escáner de la cámara y entrega lo leído (IMEI, serial, modelo…). */
export function ScanButton({ onRead, className = "btn sm", label = "📷" }: { onRead: (r: ScanRead) => void; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} title="Escanear con la cámara" aria-label="Escanear con la cámara" onClick={() => setOpen(true)}>{label}</button>
      {open && <ScanDialog onClose={() => setOpen(false)} onUse={(r) => { onRead(r); setOpen(false); }} />}
    </>
  );
}
