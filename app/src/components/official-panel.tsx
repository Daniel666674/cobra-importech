"use client";
import { useState } from "react";
import { OFFICIAL_LABEL, OFFICIAL_URL, type OfficialResult, type OfficialSource } from "@/lib/imei";

export type OfficialValue = { crc?: Exclude<OfficialResult, "locked">; apple?: Extract<OfficialResult, "clean" | "locked"> };

const OPTS: Record<OfficialSource, [string, string, string][]> = {
  crc: [["clean", "✅ Limpio", "ok"], ["reported", "⛔ Reportado", "bad"], ["blocked", "⛔ Bloqueado", "bad"]],
  apple: [["clean", "✅ Sin bloqueo", "ok"], ["locked", "⚠️ Activation Lock activo", "warn"]],
};
const TONE: Record<string, string> = { ok: "bg-green-bg text-green-t border-green-t/40", bad: "bg-red-bg text-red-t border-red-t/40", warn: "bg-amber-bg text-amber-t border-amber-t/40" };

/**
 * Verificación oficial: el botón copia el IMEI y abre las páginas de la CRC y de Apple.
 * El captcha lo escribe una persona; aquí se registra el resultado que vio.
 */
export function OfficialPanel({ imei, value, onChange }: { imei: string; value: OfficialValue; onChange: (v: OfficialValue) => void }) {
  const [msg, setMsg] = useState("");
  async function open(which: "all" | OfficialSource) {
    try {
      await navigator.clipboard.writeText(imei);
      setMsg(`IMEI ${imei} copiado: pégalo en la página oficial.`);
    } catch {
      setMsg(`Copia el IMEI a mano: ${imei}`);
    }
    for (const k of which === "all" ? (["crc", "apple"] as const) : [which]) window.open(OFFICIAL_URL[k], "_blank", "noopener");
  }
  const done = value.crc && value.apple;
  const bad = value.crc && value.crc !== "clean";
  return (
    <section className={`rounded-xl border p-4 ${done ? (bad ? "border-red-t/50" : "border-green-t/50") : "border-line"} bg-gray-bg/40`} aria-label="Verificación oficial">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <b className="block">🛡️ Verificación oficial</b>
          <span className="note">Obligatoria para guardar. El captcha lo escribe una persona en la página oficial.</span>
        </div>
        <button type="button" className="btn primary" onClick={() => open("all")}>🔎 Verificar en la fuente oficial</button>
      </div>
      <ol className="note mt-3 list-decimal pl-5 space-y-0.5">
        <li>Pulsa el botón: se copia el IMEI <span className="mono">{imei}</span> y se abren la CRC y Apple.</li>
        <li>Pega el IMEI, resuelve el captcha y lee el resultado.</li>
        <li>Elige aquí el resultado de cada consulta.</li>
      </ol>
      {msg && <p className="note mt-2" role="status">{msg}</p>}
      {(["crc", "apple"] as const).map((k) => (
        <div key={k} className="mt-3 border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <b className="text-[13px]">{OFFICIAL_LABEL[k]}</b>
            <button type="button" className="btn sm" onClick={() => open(k)}>Abrir ↗</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {OPTS[k].map(([v, label, tone]) => (
              <button
                type="button" key={v} aria-pressed={value[k] === v}
                onClick={() => onChange({ ...value, [k]: v })}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${value[k] === v ? TONE[tone] : "border-line bg-card text-t2"}`}
              >{label}</button>
            ))}
          </div>
        </div>
      ))}
      {bad && <p className="chip bad !rounded-md mt-3 !whitespace-normal">Equipo reportado o bloqueado: no se puede ingresar. Se avisó al dueño.</p>}
    </section>
  );
}
