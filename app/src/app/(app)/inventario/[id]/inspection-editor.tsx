"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveInspectionAction } from "@/app/actions/inventory";
import { InspectionForm } from "@/components/inspection-form";
import { blankInspection, type InspectionInput } from "@/lib/inspection";

export function InspectionEditor({ id, cat, initial }: { id: string; cat: string; initial: InspectionInput | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<InspectionInput>(initial ?? blankInspection());
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button className="btn sm mt-3" onClick={() => setOpen(true)}>{initial ? "✏️ Corregir inspección" : "➕ Registrar inspección"}</button>;
  return (
    <div className="mt-3 space-y-3">
      <InspectionForm cat={cat} value={v} onChange={setV} />
      {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err}</p>}
      <div className="flex gap-2">
        <button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await saveInspectionAction(id, v); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error); })}>Guardar inspección</button>
        <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}
