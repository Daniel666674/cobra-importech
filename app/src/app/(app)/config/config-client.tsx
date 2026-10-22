"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { settings } from "@/db/schema";
import { importTacAction, saveLogoAction, saveMethodsAction, saveNumberingAction, saveSettingsAction, saveWarrantyAction, undoImportAction } from "@/app/actions/admin";
import { SaleReceipt } from "@/components/receipt";
import { fdatey, fmt } from "@/lib/format";
import { ImportSales } from "./import-sales";

type Full = typeof settings.$inferSelect;
type Cfg = Omit<Full, "logo"> & { logo?: undefined };
type Source = { source: string; n: number; total: number; from: number; to: number };
type Msg = { ok: boolean; t: string } | null;

const TABS = [
  ["negocio", "🏪 Negocio"],
  ["comprobante", "🧾 Comprobante"],
  ["garantias", "🛡️ Garantías"],
  ["caja", "💳 Ventas y caja"],
  ["importar", "📥 Importar ventas"],
  ["respaldo", "💾 Respaldo y datos"],
] as const;

/** Reduce la imagen a un máximo de 256 px y la guarda como PNG (cabe en la base de datos y se imprime bien). */
async function processLogo(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

const now = Date.now();
const SAMPLE_SALE = {
  id: "S-0000", no: "", t: now, client: "x", by: "x", method: "Mixto", mode: "contado", prepaid: 0, notes: "", discReason: "Cliente frecuente", source: "", extKey: "",
  payments: [{ method: "Transferencia", amount: 4_000_000 }, { method: "Efectivo", amount: 655_000 }], cash: null, holdPays: null, disc: 2, total: 4_655_000, tradeins: [],
  lines: [
    { item: "", name: "iPhone 15 Pro 256 GB", color: "Titanio natural", cond: "Nuevo", serial: "356789123456789", qty: 1, price: 4_550_000, cost: 0, warr: 12, ret: 0 },
    { item: "", name: "Cargador USB-C 20 W", color: "", cond: "Nuevo", serial: "", qty: 1, price: 200_000, cost: 0, warr: 3, ret: 0 },
  ],
};
const SAMPLE_CLIENT = { id: "x", name: "María Fernanda Gómez", doc: "1.020.345.678", phone: "3001234567", email: "maria@correo.com", notes: "" };

export function ConfigClient({ initialTab, cfg, logo, numbering, warranty, methods, sources }: {
  initialTab: string; cfg: Cfg; logo: string;
  numbering: { prefix: string; last: number };
  warranty: { warr: Record<string, number>; terms: string[]; custom: boolean };
  methods: { all: string[]; on: string[] };
  sources: Source[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>(TABS.some(([k]) => k === initialTab) ? initialTab : "negocio");
  const [v, setV] = useState(cfg);
  const [num, setNum] = useState({ prefix: numbering.prefix, next: String(numbering.last + 1) });
  const [warr, setWarr] = useState(warranty.warr);
  const [terms, setTerms] = useState(warranty.terms);
  const [on, setOn] = useState(methods.on);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, t: okText } : { ok: false, t: r.error });
    if (r.ok) router.refresh();
  });
  const go = (k: string) => { setTab(k); setMsg(null); history.replaceState(null, "", `?tab=${k}`); };

  type TextKey = "name" | "legal" | "nit" | "taxNote" | "address" | "city" | "phone" | "whatsapp" | "email" | "web" | "instagram" | "invTitle" | "maxDisc" | "minMargin" | "trm" | "holdDays" | "apartadoMinPct" | "agedDays" | "ownerPhone";
  const field = (k: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { help?: string } = {}) => {
    const { help, ...rest } = props;
    return (
      <div><label className="lb" htmlFor={"c-" + k}>{label}</label>
        <input id={"c-" + k} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value } as Cfg)} {...rest} />
        {help && <p className="note mt-1">{help}</p>}
      </div>
    );
  };
  const saveAll = () => run(() => saveSettingsAction(v), "Configuración guardada");
  const saveBtn = <button className="btn primary" disabled={busy} onClick={saveAll}>{busy ? "Guardando…" : "Guardar cambios"}</button>;
  const preview: Full = { ...v, logo, warrTerms: terms, invPrefix: num.prefix } as Full;

  return (
    <div className="space-y-5">
      <nav className="no-print flex flex-wrap gap-1.5 border-b border-line pb-2" aria-label="Secciones de configuración">
        {TABS.map(([k, l]) => <button key={k} className={`btn sm ${tab === k ? "primary" : ""}`} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>{l}</button>)}
      </nav>
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}

      {tab === "negocio" && <>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Logo</h2>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo || "/logo.png"} alt="Logo actual" className="h-20 w-20 rounded-lg border border-line bg-white object-contain" />
            <div className="space-y-2">
              <label className="btn cursor-pointer">Subir logo desde un archivo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { try { const r = await saveLogoAction(await processLogo(f)); setMsg(r.ok ? { ok: true, t: "Logo actualizado" } : { ok: false, t: r.error }); router.refresh(); } catch { setMsg({ ok: false, t: "No se pudo leer la imagen" }); } }); }} /></label>
              {logo && <button className="btn sm ml-2" onClick={() => start(async () => { await saveLogoAction(""); router.refresh(); })}>Quitar</button>}
              <p className="note">PNG, JPG o WebP. Se ajusta automáticamente y sale en los comprobantes y en el inicio de sesión.</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Identificación</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", "Nombre comercial *", { required: true })}{field("legal", "Razón social", { help: "Como aparece en el RUT" })}
            {field("nit", "NIT", { placeholder: "901.234.567-8", help: "Con el dígito de verificación" })}
            {field("taxNote", "Responsabilidad tributaria", { placeholder: "No responsable de IVA", list: "tax-notes", help: "Se imprime bajo el NIT" })}
            <datalist id="tax-notes"><option value="No responsable de IVA" /><option value="Responsable de IVA" /><option value="Régimen Simple de Tributación (RST)" /><option value="Gran contribuyente" /></datalist>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Contacto y ubicación</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("address", "Dirección")}{field("city", "Ciudad", { placeholder: "Medellín, Antioquia" })}
            {field("phone", "Teléfono")}{field("whatsapp", "WhatsApp de la tienda", { inputMode: "numeric", placeholder: "573001234567", help: "Solo números, con indicativo" })}
            {field("email", "Correo", { type: "email" })}{field("web", "Sitio web", { placeholder: "www.tutienda.co" })}
            {field("instagram", "Instagram", { placeholder: "@tutienda" })}
            <div><label className="lb" htmlFor="c-brand">Color de marca</label><input id="c-brand" type="color" value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} className="!h-10 !p-1" /><p className="note mt-1">Franja superior del comprobante</p></div>
          </div>
        </div>
        {saveBtn}
      </>}

      {tab === "comprobante" && <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="font-semibold mb-1">Numeración</h2>
            <p className="note mb-3">Último número usado: <b>{numbering.prefix}{numbering.last || "—"}</b>. El siguiente no puede ser menor (evita números repetidos).</p>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <div><label className="lb" htmlFor="n-prefix">Prefijo</label><input id="n-prefix" value={num.prefix} maxLength={10} onChange={(e) => setNum({ ...num, prefix: e.target.value.toUpperCase() })} /></div>
              <div><label className="lb" htmlFor="n-next">Siguiente número</label><input id="n-next" type="number" min={numbering.last + 1} value={num.next} onChange={(e) => setNum({ ...num, next: e.target.value })} /></div>
            </div>
            <p className="note mt-2">La próxima venta saldrá como <b>{num.prefix}{num.next || "?"}</b>. Si venías de otro sistema, continúa su numeración.</p>
            <button className="btn mt-3" disabled={busy} onClick={() => run(() => saveNumberingAction(num), `Listo: la próxima venta será ${num.prefix}${num.next}`)}>Guardar numeración</button>
          </div>
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold">Contenido</h2>
            {field("invTitle", "Título del documento", { list: "inv-titles" })}
            <datalist id="inv-titles"><option value="Comprobante de venta" /><option value="Remisión" /><option value="Cuenta de cobro" /><option value="Recibo de venta" /></datalist>
            <div><label className="lb" htmlFor="c-footer">Mensaje al pie</label><textarea id="c-footer" rows={2} value={v.footer} onChange={(e) => setV({ ...v, footer: e.target.value })} /></div>
            <div><label className="lb" htmlFor="c-legal">Texto legal (opcional)</label><textarea id="c-legal" rows={3} maxLength={600} placeholder="Ej.: Resolución de facturación DIAN No. … del … · Rango … al …" value={v.legalNote} onChange={(e) => setV({ ...v, legalNote: e.target.value })} /><p className="note mt-1">Para resoluciones, políticas de cambio, datos bancarios, etc.</p></div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="!w-auto" checked={v.showSignatures} onChange={(e) => setV({ ...v, showSignatures: e.target.checked })} /> Mostrar líneas de firma</label>
            <p className="note">Logo, color, NIT y contacto se editan en «Negocio». Las condiciones de garantía, en «Garantías».</p>
            {saveBtn}
          </div>
        </div>
        <div className="min-w-0">
          <p className="note mb-2">Vista previa con una venta de ejemplo (se actualiza mientras escribes):</p>
          <div className="origin-top-left">
            <SaleReceipt s={{ ...SAMPLE_SALE, no: `${num.prefix}${num.next || numbering.last + 1}` }} cfg={preview} client={SAMPLE_CLIENT} seller="Vendedor de ejemplo" />
          </div>
        </div>
      </div>}

      {tab === "garantias" && <>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Meses de garantía por condición</h2>
          <p className="note mb-3">Es el valor sugerido al ingresar un producto; en cada uno se puede cambiar.</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            {Object.keys(warr).map((c) => <div key={c}><label className="lb" htmlFor={"w-" + c}>{c}</label><input id={"w-" + c} type="number" min={0} max={60} value={warr[c]} onChange={(e) => setWarr({ ...warr, [c]: Number(e.target.value) })} /></div>)}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Condiciones impresas en el comprobante</h2>
          <p className="note mb-3">{warranty.custom ? "Personalizadas." : "Texto por defecto."} Una condición por renglón, máximo 12.</p>
          <div className="space-y-2">
            {terms.map((t, i) => (
              <div key={i} className="flex gap-2">
                <textarea rows={2} aria-label={`Condición ${i + 1}`} value={t} maxLength={300} onChange={(e) => setTerms(terms.map((x, j) => (j === i ? e.target.value : x)))} />
                <button className="btn sm self-start" aria-label={`Quitar condición ${i + 1}`} onClick={() => setTerms(terms.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          {terms.length < 12 && <button className="btn sm mt-2" onClick={() => setTerms([...terms, ""])}>+ Agregar condición</button>}
        </div>
        <button className="btn primary" disabled={busy} onClick={() => run(() => saveWarrantyAction({ warr, terms }), "Garantías guardadas")}>Guardar garantías</button>
      </>}

      {tab === "caja" && <>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Formas de pago</h2>
          <p className="note mb-3">Las que no marques no aparecen en caja ni en apartados.</p>
          <div className="flex flex-wrap gap-3">
            {methods.all.map((m) => <label key={m} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]"><input type="checkbox" className="!w-auto" checked={on.includes(m)} onChange={(e) => setOn(e.target.checked ? methods.all.filter((x) => x === m || on.includes(x)) : on.filter((x) => x !== m))} />{m}</label>)}
          </div>
          <button className="btn mt-3" disabled={busy} onClick={() => run(() => saveMethodsAction(on), "Formas de pago guardadas")}>Guardar formas de pago</button>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Descuentos y márgenes</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("maxDisc", "Descuento máximo sin autorización (%)", { type: "number", min: 0, max: 100, help: "Por encima, se necesita el permiso «Dar descuentos sobre el límite»" })}
            {field("minMargin", "Margen mínimo esperado (%)", { type: "number", min: 0, max: 100 })}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Apartados e inventario</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("holdDays", "Días de un apartado", { type: "number", min: 1, max: 60 })}
            {field("apartadoMinPct", "Abono mínimo del apartado (%)", { type: "number", min: 1, max: 100 })}
            {field("agedDays", "Días para alertar inventario viejo", { type: "number", min: 1 })}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Alertas</h2>
          <div className="grid gap-3 sm:grid-cols-2">{field("ownerPhone", "Celular del dueño para alertas por WhatsApp", { inputMode: "numeric", help: "Solo números, con indicativo (573001234567)" })}</div>
        </div>
        {saveBtn}
      </>}

      {tab === "importar" && <>
        <ImportSales warr={warr} onDone={() => router.refresh()} />
        {sources.length > 0 && (
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Importaciones hechas</h2>
            <table className="w-full text-[13px]"><thead><tr className="text-left note"><th className="py-1">Archivo</th><th>Ventas</th><th>Total</th><th>Periodo</th><th /></tr></thead>
              <tbody>{sources.map((s) => (
                <tr key={s.source} className="border-t border-line">
                  <td className="py-2">{s.source}</td><td>{s.n}</td><td className="tabular-nums">{fmt(s.total)}</td><td>{fdatey(s.from)} – {fdatey(s.to)}</td>
                  <td className="text-right"><button className="btn sm" disabled={busy} onClick={() => { if (confirm(`¿Borrar las ${s.n} ventas importadas de «${s.source}»? Los clientes se conservan. Las ventas con reclamos de garantía no se borran.`)) run(async () => { const r = await undoImportAction(s.source); return r.ok ? { ok: true } : r; }, `Importación de «${s.source}» deshecha`); }}>Deshacer</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>}

      {tab === "respaldo" && <>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Copias de seguridad</h2>
          <p className="note mb-3">Descárgalas una vez por semana y guárdalas fuera del computador de la tienda (Drive, correo).</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn" href="/api/export/inventario" download>📦 Inventario (CSV)</a>
            <a className="btn" href="/api/export/ventas" download>🧾 Ventas (CSV)</a>
            <a className="btn" href="/api/export/clientes" download>👥 Clientes (CSV)</a>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Modelos por TAC</h2>
          <p className="note mb-3">El sistema aprende el modelo de cada TAC al ingresar equipos. Si tienes un CSV con «tac,marca,modelo» (por ejemplo de tacdb.osmocom.org, licencia CC-BY-SA), impórtalo aquí: solo se guardan los de Apple.</p>
          <label className="btn cursor-pointer">Importar CSV de TAC<input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { const r = await importTacAction(await f.text()); setMsg(r.ok ? { ok: true, t: `${r.data} modelos importados` } : { ok: false, t: r.error }); }); }} /></label>
        </div>
      </>}
    </div>
  );
}
