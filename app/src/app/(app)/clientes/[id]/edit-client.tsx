"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveClientAction } from "@/app/actions/sales";

type V = { name: string; doc: string; phone: string; email: string; notes: string };

export function EditClient({ id, init }: { id: string; init: V }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>✏️ Editar</button>;
  const ph = { name: "Nombre completo", doc: "Cédula / NIT", phone: "Celular", email: "Correo", notes: "Notas" };
  return (
    <div className="card w-full max-w-md space-y-2 p-3">
      {(["name", "doc", "phone", "email", "notes"] as const).map((k) => <input key={k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={ph[k]} aria-label={ph[k]} />)}
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2">
        <button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await saveClientAction(id, v); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error); })}>Guardar</button>
        <button className="btn" onClick={() => { setV(init); setOpen(false); }}>Cancelar</button>
      </div>
    </div>
  );
}
