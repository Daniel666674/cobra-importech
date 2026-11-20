"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendReceiptEmailAction } from "@/app/actions/sales";

/** El PDF lo crea el servidor (liviano): aquí solo se descarga y se guarda en este dispositivo. */
async function downloadPdf(id: string, name: string) {
  const r = await fetch(`/api/comprobante/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url; a.download = `${name}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ReceiptPdf({ id, no, auto, whatsapp, email, mailReady, autoMail }: { id: string; no: string; auto: boolean; whatsapp: boolean; email: string; mailReady: boolean; autoMail: boolean }) {
  const path = usePathname();
  const ran = useRef(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [to, setTo] = useState(email);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [sending, start] = useTransition();
  const run = async () => {
    setState("busy");
    try { await downloadPdf(id, `Comprobante ${no}`); setState("done"); } catch { setState("error"); }
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
            ? "No se pudo descargar el PDF. Pulsa «Descargar PDF» para intentarlo de nuevo."
            : state === "busy" || (auto && state === "idle")
              ? `Creando el comprobante ${no} en PDF…`
              : `✅ El comprobante ${no} se descargó en este dispositivo.${auto && autoMail && email ? ` Además se está enviando por correo a ${email}.` : ""}${whatsapp ? " Para WhatsApp pulsa «WhatsApp», adjunta el PDF descargado y envíaselo al cliente." : ""}`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={state === "busy"} onClick={run}>📄 Descargar PDF</button>
        {mailReady && (
          <>
            <input type="email" className="!w-64" placeholder="correo del cliente" aria-label="Correo del cliente" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn" disabled={sending || !to.trim()} onClick={() => start(async () => { const r = await sendReceiptEmailAction(id, to); setMsg(r.ok ? { ok: true, t: `✅ Enviado a ${r.data}` } : { ok: false, t: r.error }); })}>📧 Enviar por correo</button>
          </>
        )}
      </div>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
    </div>
  );
}
