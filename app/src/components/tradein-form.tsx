"use client";
import { useState, useTransition } from "react";
import { verifyImeiAction } from "@/app/actions/inventory";
import { OfficialPanel, type OfficialValue } from "@/components/official-panel";
import { CATALOG, COLOR_OPTIONS, SPEC_OPTIONS, type Cat } from "@/lib/catalog";
import { ComboSelect } from "@/components/combo-select";
import { fmt } from "@/lib/format";
import { officialGate, type ImeiResult } from "@/lib/imei";
import { DEDUCTIONS, TRADEIN_RATE, tradeQuote, type DeductionKey } from "@/lib/tradein";
import { MoneyInput } from "@/components/money-input";
import { InspectionForm } from "@/components/inspection-form";
import { blankInspection, DOC_TYPES, type InspectionInput } from "@/lib/inspection";

const CATS = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] as const;

/** Lo que produce el formulario: el producto para el inventario, la verificación oficial y el valor reconocido. */
export type TradePayload = {
  item: Record<string, unknown>;
  official?: OfficialValue;
  ownerApproved: boolean;
  offer: number;
  label: string;
};

/**
 * Cotiza y verifica un equipo de retoma.
 * mode «compra»: la tienda compra el equipo (pide los datos de quien lo entrega).
 * mode «venta»: el equipo es parte de pago de una venta (el que entrega es el cliente de la venta).
 */
export function TradeinForm({ warr, mode, onAccept, busy: extBusy = false, error = "" }: {
  warr: Record<string, number>;
  mode: "compra" | "venta";
  onAccept: (p: TradePayload) => void;
  busy?: boolean;
  error?: string;
}) {
  const [cat, setCat] = useState<(typeof CATS)[number]>("iPhone");
  const [imei, setImei] = useState("");
  const [res, setRes] = useState<(ImeiResult & { imei: string }) | null>(null);
  const [off, setOff] = useState<OfficialValue>({});
  const [ok, setOk] = useState(false);
  const [v, setV] = useState({ name: "", spec: "", color: "", cond: "Pre-owned", batt: "", serial: "", serial2: "", ref: "", resale: "", offer: "", vendor: "", doc: "", phone: "", warr: "" });
  const [ded, setDed] = useState<DeductionKey[]>([]);
  const [ins, setIns] = useState<InspectionInput>(blankInspection());
  const [insOpen, setInsOpen] = useState(false);
  const [sl, setSl] = useState({ docType: "CC", address: "", declared: false, idCopy: false });
  const [offerTouched, setOfferTouched] = useState(false);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  const Q = tradeQuote({ ref: +v.ref || 0, cond: v.cond, deductions: ded, batt: v.batt === "" ? null : +v.batt });
  const offer = offerTouched ? +v.offer || 0 : Q.offer;
  const resale = +v.resale || +v.ref || 0;
  const phone = cat === "iPhone";
  const gate = phone && res ? officialGate(res.verdict, off) : null;

  const verify = () => {
    const clean = imei.replace(/\D/g, "");
    if (!clean) return setErr("Escribe el IMEI del equipo");
    setErr(""); setOff({}); setOk(false);
    start(async () => {
      const r = await verifyImeiAction(clean);
      if (!r.ok) return setErr(r.error);
      setRes({ ...r.data, imei: clean });
      if (r.data.modelName) setV((x) => ({ ...x, name: r.data.modelName! }));
    });
  };

  const buying = mode === "compra";
  const missing = !v.name.trim() ? "Escribe el modelo" : !(+v.ref > 0) ? "Escribe el valor de referencia" : buying && (!v.vendor.trim() || !v.doc.trim()) ? "Registra el nombre y la cédula de quien entrega el equipo" : !sl.declared ? "Marca que quien entrega el equipo declara ser su dueño legítimo" : phone && !res ? "Verifica el IMEI" : phone && v.batt === "" ? "Escribe la salud de la batería" : phone && gate && !gate.canSave ? gate.message : phone && gate?.needsOwner && !ok ? "Falta la aprobación del propietario/a" : !(offer > 0) ? "La oferta debe ser mayor a 0" : "";

  const accept = () => {
    const defects = DEDUCTIONS.filter((d) => Q.applied.includes(d.key)).map((d) => d.label);
    const notes = [buying ? `Retoma de ${v.vendor} (C.C. ${v.doc}${v.phone ? ", cel. " + v.phone : ""})` : "", ...defects].filter(Boolean).join(" · ");
    const serial = phone ? res!.imei : v.serial;
    onAccept({
      item: { cat, name: v.name, spec: v.spec, color: v.color, cond: v.cond, serial, serial2: phone ? v.serial2 : "", qty: 1, cost: offer, price: resale, warr: +v.warr > 0 ? Math.min(60, Math.round(+v.warr)) : warr[v.cond] > 0 ? warr[v.cond] : 1, src: "Trade-in",
        seller: { name: buying ? v.vendor : "", docType: sl.docType, doc: buying ? v.doc : "", phone: buying ? v.phone : "", address: sl.address, declared: sl.declared, idCopy: sl.idCopy },
        inspection: Object.keys(ins.checks).length || ins.icloud || ins.carrier || ins.region || ins.appleWarrEnd || ins.originalParts || ins.notes ? ins : null, batt: v.batt === "" ? null : v.batt, notes },
      official: phone ? off : undefined, ownerApproved: ok, offer,
      label: [v.name, v.spec, v.cond].filter(Boolean).join(" · ") + (serial ? ` · ••${serial.slice(-6)}` : ""),
    });
  };

  const f = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="lb" htmlFor={"r-" + k}>{label}</label><input id={"r-" + k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} /></div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">{CATS.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setRes(null); setOff({}); }} className={`btn sm ${cat === c ? "primary" : ""}`}>{c}</button>)}</div>
          {phone ? (
            <div>
              <label className="lb" htmlFor="r-imei">IMEI del equipo</label>
              <div className="flex gap-2"><input id="r-imei" className="mono" inputMode="numeric" maxLength={15} value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))} onKeyDown={(e) => e.key === "Enter" && verify()} /><button type="button" className="btn primary" onClick={verify} disabled={busy}>Verificar</button></div>
              {res && <ul className="mt-3 space-y-1.5 text-[13px]">{res.steps.map((s) => <li key={s.label}><b className={s.state === "ok" ? "text-green-t" : s.state === "warn" ? "text-amber-t" : s.state === "fail" ? "text-red-t" : "text-t3"}>{{ ok: "✓", warn: "!", fail: "✕", skip: "–" }[s.state]}</b> {s.label}: <span className="text-t2">{s.detail}</span></li>)}</ul>}
              {res?.verdict === "blocked" && <p className="chip bad !rounded-md !whitespace-normal mt-3">⛔ No recibas este equipo.</p>}
            </div>
          ) : f("serial", "Número de serie")}
        </div>
        {(!phone || (res && res.verdict !== "blocked")) && (
          <>
            {phone && res && <OfficialPanel imei={res.imei} value={off} onChange={setOff} />}
            <div className="card p-4">
              <h2 className="font-semibold mb-3">Datos del equipo</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="lb" htmlFor="r-name">Modelo</label><ComboSelect id="r-name" value={v.name} options={CATALOG.filter((c) => c.cat === cat).map((c) => c.name)} onChange={(x) => setV({ ...v, name: x })} placeholder="Elige el modelo…" /></div>
                <div><label className="lb" htmlFor="r-spec">Capacidad</label><ComboSelect id="r-spec" value={v.spec} options={SPEC_OPTIONS[cat as Cat] ?? []} onChange={(x) => setV({ ...v, spec: x })} /></div>
                <div><label className="lb" htmlFor="r-color">Color</label><ComboSelect id="r-color" value={v.color} options={COLOR_OPTIONS[cat as Cat] ?? []} onChange={(x) => setV({ ...v, color: x })} /></div>
                <div><label className="lb" htmlFor="r-cond">Condición</label><select id="r-cond" value={v.cond} onChange={(e) => setV({ ...v, cond: e.target.value })}>{Object.keys(TRADEIN_RATE).map((c) => <option key={c}>{c}</option>)}</select></div>
                {f("batt", phone ? "Salud de batería (%) *" : "Batería (%)", { type: "number", min: 0, max: 100 })}
                {phone && f("serial2", "IMEI 2 (opcional)", { inputMode: "numeric", maxLength: 15 })}
              </div>
              <fieldset className="mt-3"><legend className="lb">Defectos</legend><div className="flex flex-wrap gap-x-4 gap-y-1">{DEDUCTIONS.map((d) => <label key={d.key} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="!w-auto" checked={Q.applied.includes(d.key)} disabled={d.key === "battery" && v.batt !== "" && +v.batt < 80} onChange={(e) => setDed(e.target.checked ? [...ded, d.key] : ded.filter((x) => x !== d.key))} />{d.label} (−{d.pct}%)</label>)}</div></fieldset>
            </div>
            <div className="card p-4">
              <button type="button" className="flex w-full items-center justify-between font-semibold" aria-expanded={insOpen} onClick={() => setInsOpen(!insOpen)}><span>🔍 Inspección del equipo (opcional)</span><span>{insOpen ? "−" : "+"}</span></button>
              {insOpen && <div className="mt-3"><InspectionForm cat={cat} value={ins} onChange={setIns} /></div>}
            </div>
            <div className="card p-4">
              <h2 className="font-semibold mb-3">{buying ? "Quien entrega el equipo" : "Origen del equipo"}</h2>
              {buying && <div className="grid gap-3 sm:grid-cols-3">{f("vendor", "Nombre completo")}{f("doc", "Número de documento")}{f("phone", "Celular")}</div>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {buying && <div><label className="lb" htmlFor="r-doctype">Tipo de documento</label><select id="r-doctype" value={sl.docType} onChange={(e) => setSl({ ...sl, docType: e.target.value })}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></div>}
                {buying && <div><label className="lb" htmlFor="r-address">Dirección</label><input id="r-address" value={sl.address} onChange={(e) => setSl({ ...sl, address: e.target.value })} /></div>}
              </div>
              <label className="mt-3 flex items-start gap-2 text-[13px]"><input type="checkbox" className="!w-auto mt-1" checked={sl.idCopy} onChange={(e) => setSl({ ...sl, idCopy: e.target.checked })} /><span>Se recibió copia del documento de identidad</span></label>
              <label className="mt-2 flex items-start gap-2 text-[13px]"><input type="checkbox" className="!w-auto mt-1" checked={sl.declared} onChange={(e) => setSl({ ...sl, declared: e.target.checked })} /><span><b>Quien entrega declara ser el dueño legítimo</b> del equipo, que no tiene reporte de robo ni de pérdida y que no está bloqueado por iCloud.</span></label>
              <p className="note mt-2">Se guarda en el historial del equipo y se puede imprimir como acta de compra para que el vendedor la firme.</p>
            </div>
          </>
        )}
      </div>
      <aside className="card p-4 space-y-3 self-start lg:sticky lg:top-4">
        <h2 className="font-semibold">Cotización</h2>
        <div><label className="lb" htmlFor="r-ref">Valor de referencia (COP): lo que vale hoy un equipo igual en buen estado</label><MoneyInput id="r-ref" value={v.ref} onChange={(x) => setV({ ...v, ref: x })} /></div>
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between"><span className="text-t2">Porcentaje por condición ({v.cond})</span><span>{Math.round(Q.rate * 100)}% = {fmt(Q.base)}</span></div>
          {Q.dedPct > 0 && <div className="flex justify-between"><span className="text-t2">Defectos</span><span className="text-red-t">−{Q.dedPct}%</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Oferta sugerida</span><span className="tabular-nums">{fmt(Q.offer)}</span></div>
        </div>
        <div><label className="lb" htmlFor="r-offer">Oferta final (COP)</label><MoneyInput id="r-offer" value={offerTouched ? v.offer : String(Q.offer)} onChange={(x) => { setOfferTouched(true); setV({ ...v, offer: x }); }} /></div>
        <div><label className="lb" htmlFor="r-warr">Garantía al revender (meses)</label><input id="r-warr" type="number" min={1} max={60} placeholder={String(warr[v.cond] > 0 ? warr[v.cond] : 1)} value={v.warr} onChange={(e) => setV({ ...v, warr: e.target.value })} /></div>
        <div><label className="lb" htmlFor="r-resale">Precio de reventa (COP)</label><MoneyInput id="r-resale" value={v.resale} placeholder={v.ref} onChange={(x) => setV({ ...v, resale: x })} />
          {resale > 0 && offer > 0 && <p className="note mt-1">Margen al revender: {fmt(resale - offer)} ({Math.round(((resale - offer) / resale) * 100)}%)</p>}</div>
        {phone && gate?.needsOwner && <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="!w-auto mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span><b>Aprobación del propietario/a</b> por la advertencia.</span></label>}
        <button className="btn primary w-full !py-3" disabled={!!missing || busy || extBusy} onClick={accept}>{buying ? `Aceptar retoma · pagar ${fmt(offer)}` : `Usar como parte de pago · ${fmt(offer)}`}</button>
        {missing && <p className="note" role="status">{missing}</p>}
        {(err || error) && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{err || error}</p>}
        {!buying && <p className="note">El equipo entra al inventario cuando se emita el comprobante, con el valor de la retoma como costo. El cliente de la venta queda como quien lo entregó.</p>}
        <p className="note">Los porcentajes son una guía editable en el código (`src/lib/tradein.ts`); la oferta final siempre la decide la persona.</p>
      </aside>
    </div>
  );
}
