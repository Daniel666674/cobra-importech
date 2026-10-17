"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveClaimAction } from "@/app/actions/sales";

const OPTS = ["Reparado en garantía", "Cambio del producto", "Reembolso", "No aplica garantía"];
export function ClaimActions({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(OPTS[0]);
  const [busy, start] = useTransition();
  return open ? (
    <div className="flex gap-2"><select value={res} onChange={(e) => setRes(e.target.value)} aria-label="Resolución">{OPTS.map((o) => <option key={o}>{o}</option>)}</select>
      <button className="btn primary sm" disabled={busy} onClick={() => start(async () => { const r = await resolveClaimAction(id, res); if (r.ok) router.refresh(); })}>Cerrar</button></div>
  ) : <button className="btn sm" onClick={() => setOpen(true)}>Resolver</button>;
}
