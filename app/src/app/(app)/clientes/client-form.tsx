"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveClientAction } from "@/app/actions/sales";

export function ClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", doc: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>➕ Nuevo cliente</button>;
  return (
    <div className="card w-full max-w-md space-y-2 p-3">
      {(["name", "doc", "phone", "email"] as const).map((k) => <input key={k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={{ name: "Nombre completo", doc: "Cédula / NIT", phone: "Celular", email: "Correo" }[k]} aria-label={k} />)}
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2"><button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await saveClientAction(null, v); if (r.ok) { setOpen(false); setV({ name: "", doc: "", phone: "", email: "" }); router.refresh(); } else setErr(r.error); })}>Guardar</button><button className="btn" onClick={() => setOpen(false)}>Cancelar</button></div>
    </div>
  );
}
