"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createItemAction, verifyImeiAction } from "@/app/actions/inventory";
import { ItemForm, emptyItem, toPayload, type ItemFormValues } from "@/components/item-form";
import { OfficialPanel, type OfficialValue } from "@/components/official-panel";
import { ScanDialog } from "@/components/scan-dialog";
import { CATS, type Cat } from "@/lib/catalog";
import type { ScanRead } from "@/lib/scan-parse";
import { modelByTac, officialGate, type ImeiResult } from "@/lib/imei";

const ICON: Record<Cat, string> = { iPhone: "📱", iPad: "📲", Mac: "💻", "Apple Watch": "⌚", AirPods: "🎧", Accesorios: "🔌" };
const STEP: Record<string, string> = { ok: "✓", warn: "!", fail: "✕", skip: "–" };
const STEP_TONE: Record<string, string> = { ok: "text-green-t", warn: "text-amber-t", fail: "text-red-t", skip: "text-t3" };

export function IngresoClient({ warr, canCost }: { warr: Record<string, number>; canCost: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState<Cat>("iPhone");
  const [imei, setImei] = useState("");
  const [res, setRes] = useState<(ImeiResult & { imei: string }) | null>(null);
  const [off, setOff] = useState<OfficialValue>({});
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState<ItemFormValues>(emptyItem("iPhone", warr.Nuevo));
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const [scanOpen, setScanOpen] = useState(false);
  const [pending, setPending] = useState<ScanRead | null>(null);

  const pickCat = (c: Cat) => { setCat(c); setRes(null); setOff({}); setErr(""); setForm(emptyItem(c, warr.Nuevo)); };

  function verify() {
    const clean = imei.replace(/\D/g, "");
    if (!clean) { setErr("Escribe o escanea un IMEI primero"); return; }
    setErr(""); setOff({}); setOk(false);
    start(async () => {
      const r = await verifyImeiAction(clean);
      if (!r.ok) { setErr(r.error); return; }
      setRes({ ...r.data, imei: clean });
      const model = modelByTac(clean);
      const sc = pending;
      setPending(null);
      void model;
      setForm({ ...emptyItem("iPhone", warr.Nuevo), name: sc?.name ?? r.data.modelName ?? "", serial: clean, spec: sc?.spec ?? "256 GB", color: sc?.color ?? "", batt: sc?.batt != null ? String(sc.batt) : "100", notes: [sc?.serial ? "Serie " + sc.serial : "", ...(sc?.info ?? [])].filter(Boolean).join(" · ") });
    });
  }

  const gate = res ? officialGate(res.verdict, off) : null;
  const needOwner = gate?.needsOwner ?? false;
  const canSave = cat === "iPhone" ? !!gate?.canSave && (!needOwner || ok) : true;

  function applyScan(r: ScanRead) {
    if (cat === "iPhone") {
      if (r.imei) { setPending(r); setImei(r.imei); setTimeout(() => document.getElementById("verify-btn")?.click(), 50); }
      else setErr("No se leyó el IMEI: escríbelo o escanea su código de barras para verificarlo.");
    } else {
      setForm((f) => ({ ...f, name: r.name ?? f.name, spec: r.spec ?? f.spec, color: r.color ?? f.color, serial: r.serial ?? f.serial, batt: r.batt != null ? String(r.batt) : f.batt, notes: r.info?.length ? [f.notes, r.info.join(" · ")].filter(Boolean).join(" · ") : f.notes }));
    }
  }

  function save() {
    setErr("");
    start(async () => {
      const payload = toPayload(cat, form, cat === "iPhone" ? { serial: res?.imei ?? form.serial } : {});
      const r = await createItemAction(payload, cat === "iPhone" ? off : undefined, ok);
      if (!r.ok) { setErr(r.error); return; }
      router.push(`/inventario/${r.data}`);
    });
  }

  return (
    <div className="card">
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        {CATS.map((c) => (
          <button key={c} type="button" onClick={() => pickCat(c)} aria-pressed={cat === c}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${cat === c ? "bg-accent text-white" : "bg-gray-bg text-t2"}`}>{ICON[c]} {c}</button>
        ))}
      </div>
      <div className="p-4">
        {cat === "iPhone" ? (
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <label className="lb" htmlFor="imei">IMEI del equipo (15 dígitos)</label>
              <div className="flex gap-2">
                <input id="imei" className="mono !text-lg !tracking-widest" inputMode="numeric" maxLength={15} placeholder="000000000000000" autoComplete="off"
                  value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))} onKeyDown={(e) => e.key === "Enter" && verify()} />
                <button id="verify-btn" type="button" className="btn primary" onClick={verify} disabled={busy}>Verificar</button>
                <button type="button" className="btn" onClick={() => setScanOpen(true)}>📷 Escanear</button>
              </div>
              {res && (
                <div className="mt-5 space-y-4">
                  <h3 className="font-semibold text-[14px]">Verificación automática <span className="mono text-t3">{res.imei}</span></h3>
                  <ul className="space-y-2">
                    {res.steps.map((s) => (
                      <li key={s.label} className="flex gap-2.5">
                        <span className={`font-bold w-4 ${STEP_TONE[s.state]}`}>{STEP[s.state]}</span>
                        <span><b className="block text-[13px]">{s.label}</b><span className="note">{s.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                  {res.verdict === "blocked" ? (
                    <p className="chip bad !rounded-lg !whitespace-normal p-3">⛔ {res.reason === "invalid" ? "IMEI inválido: revisa el número." : res.reason === "dup" ? "Este IMEI ya está en tu inventario." : "Este IMEI está bloqueado. No lo ingreses."}</p>
                  ) : (
                    <>
                      <OfficialPanel imei={res.imei} value={off} onChange={(v) => { setOff(v); setErr(""); }} />
                      <div className="border-t border-line pt-4">
                        <h3 className="font-semibold text-[14px] mb-3">Datos del equipo</h3>
                        <ItemForm cat="iPhone" values={form} onChange={setForm} warrByCond={warr} serialLocked showCost={canCost} />
                      </div>
                      {needOwner && (
                        <label className="flex items-start gap-2 text-[13px]">
                          <input type="checkbox" className="!w-auto mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                          <span><b>Aprobación del propietario/a:</b> autorizo ingresar este equipo pese a la advertencia.</span>
                        </label>
                      )}
                      <div>
                        <button type="button" className="btn primary" disabled={!canSave || busy} onClick={save}>Guardar en inventario</button>
                        {!canSave && <p className="note mt-2">{gate && !gate.canSave ? gate.message : "Falta la aprobación del propietario/a."}</p>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <aside className="rounded-xl bg-gray-bg/60 p-4 text-[13px] self-start">
              <h3 className="font-semibold mb-2">Qué se verifica</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-t2">
                <li>Validación matemática del IMEI.</li>
                <li>Modelo según el TAC.</li>
                <li>Que no esté ya en el inventario.</li>
                <li>Lista interna de IMEI bloqueados.</li>
                <li><b>Verificación oficial:</b> CRC y Apple, con captcha escrito por el empleado. Sin este resultado no se guarda.</li>
                <li><b>Si está reportado no se puede guardar</b> y el dueño recibe una alerta.</li>
              </ol>
            </aside>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-bg/60 p-3"><span className="text-[13px]">📷 <b>Llena el formulario con la cámara</b> · caja nueva o pantalla de un equipo usado</span><button type="button" className="btn primary" onClick={() => setScanOpen(true)}>Escanear</button></div>
            <ItemForm cat={cat} values={form} onChange={setForm} warrByCond={warr} showCost={canCost} />
            <button type="button" className="btn primary" onClick={save} disabled={busy}>Guardar en inventario</button>
          </div>
        )}
        {err && <p role="alert" className="chip bad !rounded-md !whitespace-normal mt-4">{err}</p>}
      </div>
      {scanOpen && <ScanDialog onClose={() => setScanOpen(false)} onUse={applyScan} />}
    </div>
  );
}
