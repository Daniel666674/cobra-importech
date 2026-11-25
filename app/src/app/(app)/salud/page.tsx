import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fdt } from "@/lib/format";
import { getDb } from "@/db";
import { systemHealth } from "@/server/health";
import { requireMe } from "@/server/session";

const ICON = { ok: "✅", warn: "⚠️", bad: "⛔" } as const;

export default async function Salud() {
  await requireMe("settings");
  const h = await systemHealth(await getDb());
  const sorted = [...h.checks].sort((a, b) => ({ bad: 0, warn: 1, ok: 2 })[a.level] - ({ bad: 0, warn: 1, ok: 2 })[b.level]);
  return (
    <>
      <PageHeader title="Salud del sistema" subtitle={`Revisión automática de que todo cuadre entre inventario, ventas, caja, cartera, apartados y taller · ${fdt(h.at)}`} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="note">Graves</div><b className={`text-2xl ${h.bad ? "text-red-t" : ""}`}>{h.bad}</b></div>
        <div className="card p-4"><div className="note">Para revisar</div><b className={`text-2xl ${h.warn ? "text-amber-t" : ""}`}>{h.warn}</b></div>
        <div className="card p-4"><div className="note">Revisiones sin problema</div><b className="text-2xl">{h.checks.length - h.bad - h.warn}</b></div>
      </div>
      <div className="space-y-3">
        {sorted.map((c) => (
          <details key={c.key} open={c.level !== "ok"} className="card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold"><span>{ICON[c.level]}</span><span>{c.title}</span>{c.level !== "ok" && <span className={`chip ${c.level === "bad" ? "bad" : "warn"}`}>{c.items.length >= 25 ? "25+" : c.items.length}</span>}</summary>
            <p className="note mt-1">{c.detail}</p>
            {c.items.length > 0 && <ul className="mt-2 space-y-1">{c.items.map((i, k) => <li key={k}><Link href={i.href} className="text-[13.5px] underline decoration-dotted">{i.label}</Link></li>)}</ul>}
          </details>))}
      </div>
    </>
  );
}
