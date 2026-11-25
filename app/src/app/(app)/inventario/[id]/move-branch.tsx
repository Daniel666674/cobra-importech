"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveItemBranchAction } from "@/app/actions/inventory";

/** Traslada el producto a otra sede; queda en su historial. */
export function MoveBranch({ id, current, branches }: { id: string; current: string; branches: string[] }) {
  const router = useRouter();
  const others = branches.filter((b) => b !== current);
  const [to, setTo] = useState(others[0] ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  if (others.length === 0) return null;
  return (
    <div className="card p-4">
      <h2 className="mb-2 font-semibold">📍 Trasladar de sede</h2>
      <p className="note mb-2">Hoy está en <b>{current || "—"}</b>.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sede de destino" className="!w-auto">{others.map((b) => <option key={b}>{b}</option>)}</select>
        <button className="btn" disabled={busy || !to} onClick={() => start(async () => { const r = await moveItemBranchAction(id, to); setMsg(r.ok ? { ok: true, t: `Trasladado a ${to}` } : { ok: false, t: r.error }); if (r.ok) router.refresh(); })}>Trasladar</button>
      </div>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal mt-2`}>{msg.t}</p>}
    </div>
  );
}
