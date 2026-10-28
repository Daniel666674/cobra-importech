"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAllSalesAction } from "@/app/actions/sales";

const PHRASE = "BORRAR VENTAS";

/** Borra las ventas hechas en el sistema, por tandas, para volver a registrarlas. Pide copia de seguridad y confirmación escrita. */
export function DeleteSales({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [backup, setBackup] = useState(false);
  const [text, setText] = useState("");
  const [restart, setRestart] = useState("");
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const run = () => start(async () => {
    let deleted = 0, skip = 0, restarted = false;
    const blocked: string[] = [];
    for (;;) {
      const r = await deleteAllSalesAction(text, skip, restart);
      if (!r.ok) { setMsg({ ok: false, t: r.error }); break; }
      deleted += r.data.deleted; skip = r.data.skip; blocked.push(...r.data.blocked); restarted ||= r.data.restarted;
      setMsg({ ok: true, t: `Borrando… ${deleted} ventas borradas` });
      if (r.data.done) {
        setMsg({ ok: !blocked.length, t: `Listo: ${deleted} ventas borradas, los equipos volvieron al inventario.${restarted ? ` La numeración empieza en ${restart}.` : ""}${blocked.length ? ` No se pudieron borrar ${blocked.length}: ${blocked.slice(0, 5).join(" · ")}` : ""}` });
        setOpen(false); setText(""); setBackup(false); setRestart("");
        break;
      }
    }
    router.refresh();
  });
  return (
    <div className="card border-red-300 p-4">
      <h2 className="font-semibold mb-1">🗑️ Borrar las ventas hechas en el sistema</h2>
      <p className="note mb-3">Para empezar de cero y volver a registrarlas. Cada venta borrada devuelve sus equipos al inventario y quita las retomas y deudas a tiendas aliadas que generó. Los clientes se conservan. No se borran las ventas con apartado o con reclamo de garantía (te avisa cuáles). La numeración de comprobantes sigue donde iba, salvo que indiques abajo desde qué número empezar. Hay {count} ventas.</p>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal mb-3`}>{msg.t}</p>}
      {!open ? <button className="btn danger" disabled={busy || count === 0} onClick={() => { setOpen(true); setMsg(null); }}>Borrar todas las ventas…</button> : (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1 !w-auto" checked={backup} onChange={(e) => setBackup(e.target.checked)} /><span>Ya descargué la copia de las ventas (<a className="underline" href="/api/export/ventas" download>descargar ahora</a>)</span></label>
          <div><label className="lb" htmlFor="del-restart">Empezar la numeración desde (opcional, solo si se borran todas)</label><input id="del-restart" inputMode="numeric" placeholder="Ej. 1001" value={restart} onChange={(e) => setRestart(e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="lb" htmlFor="del-sales">Escribe {PHRASE} para confirmar</label><input id="del-sales" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="flex gap-2">
            <button className="btn danger" disabled={busy || !backup || text !== PHRASE} onClick={run}>{busy ? "Borrando…" : "Borrar definitivamente"}</button>
            <button className="btn" disabled={busy} onClick={() => { setOpen(false); setText(""); setBackup(false); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
