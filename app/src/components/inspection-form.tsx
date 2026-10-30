"use client";
import { fromYmd, toYmd } from "@/components/date-field";
import { checksFor, type InspectionInput } from "@/lib/inspection";

/** Lista de revisión del equipo: cada punto se marca «Funciona» o «Falla»; lo que no se marca queda sin revisar. */
export function InspectionForm({ cat, value: v, onChange }: { cat: string; value: InspectionInput; onChange: (v: InspectionInput) => void }) {
  const set = (patch: Partial<InspectionInput>) => onChange({ ...v, ...patch });
  const mark = (key: string, to: "ok" | "falla") => {
    const checks = { ...v.checks };
    if (checks[key] === to) delete checks[key]; else checks[key] = to;
    set({ checks });
  };
  const phone = cat === "iPhone" || cat === "iPad";
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {checksFor(cat).map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 border-b border-line py-1 text-[13px]">
            <span>{c.label}</span>
            <span className="flex gap-1">
              <button type="button" aria-pressed={v.checks[c.key] === "ok"} onClick={() => mark(c.key, "ok")} className={`btn sm ${v.checks[c.key] === "ok" ? "primary" : ""}`}>Funciona</button>
              <button type="button" aria-pressed={v.checks[c.key] === "falla"} onClick={() => mark(c.key, "falla")} className={`btn sm ${v.checks[c.key] === "falla" ? "danger" : ""}`}>Falla</button>
            </span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {phone && <div><label className="lb" htmlFor="ins-icloud">iCloud / Buscar mi iPhone</label><select id="ins-icloud" value={v.icloud} onChange={(e) => set({ icloud: e.target.value as InspectionInput["icloud"] })}><option value="">Sin revisar</option><option value="libre">Libre (cerrado la sesión)</option><option value="bloqueado">Bloqueado</option></select></div>}
        {phone && <div><label className="lb" htmlFor="ins-carrier">Operador (liberado)</label><select id="ins-carrier" value={v.carrier} onChange={(e) => set({ carrier: e.target.value as InspectionInput["carrier"] })}><option value="">Sin revisar</option><option value="libre">Libre para todos los operadores</option><option value="bloqueado">Bloqueado a un operador</option></select></div>}
        {phone && <div><label className="lb" htmlFor="ins-region">Región del modelo (ej. LL/A, BE/A)</label><input id="ins-region" value={v.region} onChange={(e) => set({ region: e.target.value })} /></div>}
        <div><label className="lb" htmlFor="ins-aw">Garantía de Apple hasta</label><input id="ins-aw" type="date" value={toYmd(v.appleWarrEnd)} onChange={(e) => set({ appleWarrEnd: fromYmd(e.target.value) })} /></div>
        <div><label className="lb" htmlFor="ins-parts">¿Todas las piezas originales?</label><select id="ins-parts" value={v.originalParts} onChange={(e) => set({ originalParts: e.target.value as InspectionInput["originalParts"] })}><option value="">Sin revisar</option><option value="si">Sí, originales</option><option value="no">No, tiene piezas cambiadas</option></select></div>
        <div className="sm:col-span-2"><label className="lb" htmlFor="ins-notes">Observaciones</label><input id="ins-notes" value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Rayón en la esquina, batería cambiada…" /></div>
      </div>
    </div>
  );
}
