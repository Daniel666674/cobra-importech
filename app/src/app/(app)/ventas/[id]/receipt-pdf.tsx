"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Convierte el comprobante de la pantalla en un PDF (A4) y lo descarga en este dispositivo. */
async function downloadPdf(el: HTMLElement, name: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const h = (canvas.height * w) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.92);
  for (let y = 0, first = true; y < h - 0.5; y += pageH, first = false) {
    if (!first) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, -y, w, h);
  }
  pdf.save(`${name}.pdf`);
}

export function ReceiptPdf({ no, auto, whatsapp }: { no: string; auto: boolean; whatsapp: boolean }) {
  const path = usePathname();
  const ran = useRef(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const run = async () => {
    const el = document.getElementById("receipt-print");
    if (!el) return;
    setState("busy");
    try { await downloadPdf(el, `Comprobante ${no}`); setState("done"); } catch { setState("error"); }
  };
  useEffect(() => {
    if (!auto || ran.current) return;
    ran.current = true;
    void run().then(() => window.history.replaceState(null, "", path)); // quita ?nueva=1 para no volver a descargar al recargar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="no-print mb-4 space-y-2">
      {(auto || state !== "idle") && (
        <p role="status" className={`chip ${state === "error" ? "bad" : "ok"} !rounded-md !whitespace-normal`}>
          {state === "error"
            ? "No se pudo crear el PDF. Pulsa «Descargar PDF» para intentarlo de nuevo."
            : state === "busy" || (auto && state === "idle")
              ? `Creando el comprobante ${no} en PDF…`
              : `✅ El comprobante ${no} se descargó en este dispositivo.${whatsapp ? " Ahora pulsa «WhatsApp», adjunta el PDF descargado y envíaselo al cliente." : " Adjúntalo y envíaselo al cliente."}`}
        </p>
      )}
      <button type="button" className="btn" disabled={state === "busy"} onClick={run}>📄 Descargar PDF</button>
    </div>
  );
}
