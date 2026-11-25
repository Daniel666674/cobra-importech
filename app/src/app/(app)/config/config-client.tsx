"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { settings } from "@/db/schema";
import { importTacAction, saveBanksAction, saveLogoAction, saveMethodsAction, saveNumberingAction, saveSettingsAction, saveWarrantyAction, undoImportAction } from "@/app/actions/admin";
import { SaleReceipt } from "@/components/receipt";
import { fdatey, fmt } from "@/lib/format";
import { dedTable, rateTable } from "@/lib/tradein";
import type { CatDef } from "@/lib/catalog";
import { saveBranchesAction, saveCategoriesAction } from "@/app/actions/admin";
import { saveTradeinConfigAction } from "@/app/actions/admin";
import { DeleteSales } from "./delete-sales";
import { ImportSales } from "./import-sales";

type Full = typeof settings.$inferSelect;
type Cfg = Omit<Full, "logo"> & { logo?: undefined };
type Source = { source: string; n: number; total: number; from: number; to: number };
type Msg = { ok: boolean; t: string } | null;

const GROUPS: { name: string; tabs: readonly (readonly [string, string, string])[] }[] = [
  { name: "General", tabs: [["inicio", "🚀 Puesta en marcha", "checklist inicio progreso"], ["negocio", "🏪 Negocio", "logo nit razón social dirección contacto color marca"]] },
  { name: "Ventas", tabs: [["comprobante", "🧾 Comprobante", "numeración factura título firmas plantilla correo"], ["caja", "💳 Ventas y caja", "formas de pago bancos recargos descuentos margen trm apartado"], ["garantias", "🛡️ Garantías", "garantía meses condiciones términos"], ["retomas", "🔄 Retomas", "trade-in porcentaje condición defectos cotizador"]] },
  { name: "Catálogo", tabs: [["catalogo", "📦 Categorías y sedes", "categorías sedes sucursales tiendas productos tipos sku traslado"]] },
  { name: "Comunicación", tabs: [["mensajes", "💬 Mensajes y correo", "whatsapp correo gmail mensaje plantilla notificaciones"]] },
  { name: "Equipo y control", tabs: [["equipo", "🔐 Equipo y seguridad", "usuarios roles permisos actividad salud registro"]] },
  { name: "Datos", tabs: [["importar", "📥 Importar ventas", "importar excel historial"], ["respaldo", "💾 Respaldo y datos", "respaldo exportar borrar imei tac"]] },
];
const TABS = GROUPS.flatMap((g) => g.tabs) as readonly (readonly [string, string, string])[];

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
  id: "S-0000", branch: "", no: "", t: now, client: "x", by: "x", method: "Mixto", mode: "contado", prepaid: 0, pending: 0, notes: "", discReason: "Cliente frecuente", source: "", extKey: "",
  payments: [{ method: "Transferencia", amount: 4_000_000 }, { method: "Efectivo", amount: 655_000 }], cash: null, holdPays: null, disc: 2, total: 4_655_000, tradeins: [], surcharge: 0,
  lines: [
    { item: "", name: "iPhone 15 Pro 256 GB", color: "Titanio natural", cond: "Nuevo", serial: "356789123456789", qty: 1, price: 4_550_000, cost: 0, warr: 12, ret: 0 },
    { item: "", name: "Cargador USB-C 20 W", color: "", cond: "Nuevo", serial: "", qty: 1, price: 200_000, cost: 0, warr: 3, ret: 0 },
  ],
};
const SAMPLE_CLIENT = { id: "x", name: "María Fernanda Gómez", doc: "1.020.345.678", phone: "3001234567", address: "Calle 10 # 5-20, Medellín", email: "maria@correo.com", notes: "" };

export function ConfigClient({ initialTab, cfg, logo, numbering, warranty, methods, banks, sources, salesCount, mailReady, checklist, team, catalog }: {
  catalog: { defs: CatDef[]; used: Record<string, number>; main: string; branches: string[]; branchUsed: Record<string, number> };
  checklist: { key: string; label: string; hint: string; tab: string; done: boolean }[];
  team: { users: number; active: number; roles: number };
  mailReady: boolean; initialTab: string; cfg: Cfg; logo: string;
  numbering: { prefix: string; last: number };
  warranty: { warr: Record<string, number>; terms: string[]; custom: boolean };
  methods: { all: string[]; on: string[]; surcharges: Record<string, number> };
  banks: string[];
  sources: Source[];
  salesCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>(TABS.some(([k]) => k === initialTab) ? initialTab : "inicio");
  const [v, setV] = useState(cfg);
  const [num, setNum] = useState({ prefix: numbering.prefix, next: String(numbering.last + 1) });
  const [warr, setWarr] = useState(warranty.warr);
  const [terms, setTerms] = useState(warranty.terms);
  const [bankList, setBankList] = useState(banks);
  const [newBank, setNewBank] = useState("");
  const [on, setOn] = useState(methods.on);
  const [fees, setFees] = useState<Record<string, string>>(Object.fromEntries(methods.all.map((m) => [m, String(methods.surcharges[m] ?? "")])));
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState(() => catalog.defs.map((d) => ({ ...d })));
  const [newCat, setNewCat] = useState({ name: "", kind: "unit" as "unit" | "qty", sku: "" });
  const [sedes, setSedes] = useState(() => catalog.branches.map((b) => ({ name: b, from: b })));
  const [mainSede, setMainSede] = useState(catalog.main);
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rateTable({ rates: cfg.tradeRates })).map(([k, x]) => [k, String(Math.round(x * 100))])));
  const [deds, setDeds] = useState(() => dedTable({ deds: cfg.tradeDeds }).map((d) => ({ ...d, pct: String(d.pct) })));
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
    <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
      <aside className="no-print lg:sticky lg:top-4 lg:self-start" aria-label="Secciones de configuración">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ajuste…" aria-label="Buscar ajuste" className="mb-3" />
        <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-3 lg:overflow-visible">
          {GROUPS.map((g) => {
            const list = g.tabs.filter(([, l, kw]) => !search.trim() || `${l} ${kw}`.toLowerCase().includes(search.toLowerCase().trim()));
            if (!list.length) return null;
            return (
              <div key={g.name} className="flex gap-1.5 lg:block">
                <div className="note mb-1 hidden px-2 text-[11px] font-semibold uppercase tracking-wider lg:block">{g.name}</div>
                {list.map(([k, l]) => <button key={k} className={`btn sm shrink-0 whitespace-nowrap lg:mb-1 lg:flex lg:w-full lg:justify-start ${tab === k ? "primary" : ""}`} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>{l}</button>)}
              </div>);
          })}
        </nav>
      </aside>
      <div className="min-w-0 space-y-5">
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
            <p className="note mb-3">Último número usado: <b>{numbering.prefix}{numbering.last || "—"}</b>. Puedes poner el siguiente que quieras: el sistema salta los números que ya existen para no repetirlos.</p>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <div><label className="lb" htmlFor="n-prefix">Prefijo</label><input id="n-prefix" value={num.prefix} maxLength={10} onChange={(e) => setNum({ ...num, prefix: e.target.value.toUpperCase() })} /></div>
              <div><label className="lb" htmlFor="n-next">Siguiente número</label><input id="n-next" type="number" min={1} value={num.next} onChange={(e) => setNum({ ...num, next: e.target.value })} /></div>
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
            <label className="mt-2 flex items-start gap-2 text-[13px]"><input type="checkbox" className="!w-auto mt-1" checked={v.autoSend} onChange={(e) => setV({ ...v, autoSend: e.target.checked })} /><span><b>Enviar el comprobante en PDF al correo del cliente</b> apenas se registre la venta.<span className="note block">{mailReady ? "✅ El servicio de correo está configurado." : "⚠️ Falta conectar el correo (Gmail) en Vercel: mientras tanto no se envía nada."}</span></span></label>
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
            {Object.keys(warr).map((c) => <div key={c}><label className="lb" htmlFor={"w-" + c}>{c}</label><input id={"w-" + c} type="number" min={1} max={60} value={warr[c]} onChange={(e) => setWarr({ ...warr, [c]: Number(e.target.value) })} /></div>)}
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
          <p className="note mb-3">Las que no marques no aparecen en caja ni en apartados. El <b>recargo</b> se aplica dividiendo: lo que paga con ese medio ÷ (1 − %). Ej.: Addi 12 % → precio ÷ 0,88; Vanti 6 % → ÷ 0,94; crédito 7 % → ÷ 0,93. Solo aparece en caja después de elegir la forma de pago.</p>
          <div className="flex flex-wrap gap-3">
            {methods.all.map((m) => <div key={m} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" className="!w-auto" checked={on.includes(m)} onChange={(e) => setOn(e.target.checked ? methods.all.filter((x) => x === m || on.includes(x)) : on.filter((x) => x !== m))} />{m}</label>
              <span className="note">recargo</span><input className="!w-16 !py-1" type="number" min={0} max={50} step="0.5" aria-label={`Recargo ${m} (%)`} value={fees[m]} placeholder="0" onChange={(e) => setFees({ ...fees, [m]: e.target.value })} /><span className="note">%</span>
            </div>)}
          </div>
          <button className="btn mt-3" disabled={busy} onClick={() => run(() => saveMethodsAction({ on, surcharges: Object.fromEntries(Object.entries(fees).map(([k, x]) => [k, +x || 0])) }), "Formas de pago y recargos guardados")}>Guardar formas de pago</button>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Bancos para transferencias</h2>
          <p className="note mb-3">Al cobrar con «Transferencia» se elige a cuál de estos bancos o cuentas entró el dinero; queda en el comprobante y en la caja.</p>
          <div className="flex flex-wrap gap-2">
            {bankList.map((b) => <span key={b} className="chip gray">{b} <button type="button" className="ml-1" aria-label={`Quitar ${b}`} onClick={() => setBankList(bankList.filter((x) => x !== b))}>✕</button></span>)}
            {bankList.length === 0 && <span className="note">Sin bancos: la transferencia se cobra sin elegir banco.</span>}
          </div>
          <div className="mt-3 flex gap-2"><input className="!w-64" aria-label="Nuevo banco" placeholder="Ej. Bancolombia, Banco Andrés…" value={newBank} onChange={(e) => setNewBank(e.target.value)} />
            <button type="button" className="btn" onClick={() => { const n = newBank.trim(); if (n && !bankList.includes(n)) setBankList([...bankList, n]); setNewBank(""); }}>Agregar</button></div>
          <button className="btn primary mt-3" disabled={busy} onClick={() => run(async () => { const r = await saveBanksAction(bankList); return r.ok ? { ok: true } : r; }, "Bancos guardados")}>Guardar bancos</button>
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

      {tab === "inicio" && (() => {
        const done = checklist.filter((c) => c.done).length;
        const pct = Math.round((done / Math.max(1, checklist.length)) * 100);
        return <div className="space-y-4">
          <div className="card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Puesta en marcha</h2><p className="note">{done} de {checklist.length} pasos listos. Completa lo que falte para dejar el negocio configurado.</p></div><b className="text-2xl tabular-nums">{pct}%</b></div>
            <div className="mt-3 h-2 rounded-full bg-gray-bg"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div></div>
          <ul className="grid gap-2 sm:grid-cols-2">{checklist.map((c) => <li key={c.key}><button onClick={() => go(c.tab)} className={`card flex w-full items-start gap-3 p-3 text-left hover:border-accent ${c.done ? "" : "border-amber-t/50"}`}><span className="text-lg">{c.done ? "✅" : "⬜"}</span><span><b className="block text-[13.5px]">{c.label}</b><span className="note">{c.hint}</span></span></button></li>)}</ul>
        </div>;
      })()}

      {tab === "catalogo" && <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">Categorías de producto</h2>
          <p className="note mb-3">Las categorías de fábrica se pueden ocultar y reordenar; las propias se agregan aquí. «Por unidad» lleva IMEI/serie (cada equipo es único); «Por cantidad» maneja stock (accesorios).</p>
          <div className="space-y-1.5">{cats.map((c, i) => (
            <div key={c.name} className={`flex flex-wrap items-center gap-2 rounded-md border border-line p-2 ${c.active ? "" : "opacity-60"}`}>
              <div className="flex flex-col"><button className="btn sm !px-1.5 !py-0" disabled={i === 0} onClick={() => setCats(cats.map((x, j) => (j === i - 1 ? cats[i] : j === i ? cats[i - 1] : x)))} aria-label="Subir">▲</button><button className="btn sm !px-1.5 !py-0" disabled={i === cats.length - 1} onClick={() => setCats(cats.map((x, j) => (j === i + 1 ? cats[i] : j === i ? cats[i + 1] : x)))} aria-label="Bajar">▼</button></div>
              <b className="min-w-[110px] flex-1 text-[13.5px]">{c.name}</b>
              <span className="note">{c.sku} · {c.kind === "qty" ? "por cantidad" : "por unidad"} · {catalog.used[c.name] ?? 0} productos</span>
              <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="!w-auto" checked={c.active} onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> Activa</label>
              {!c.builtin && !(catalog.used[c.name] > 0) && <button className="btn sm" onClick={() => setCats(cats.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>}
            </div>))}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr_auto]">
            <input placeholder="Nueva categoría (ej. Cámaras)" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} aria-label="Nombre de la categoría" />
            <select value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as "unit" | "qty" })} aria-label="Tipo"><option value="unit">Por unidad (IMEI/serie)</option><option value="qty">Por cantidad (stock)</option></select>
            <input placeholder="SKU (CAM)" maxLength={4} value={newCat.sku} onChange={(e) => setNewCat({ ...newCat, sku: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} aria-label="Código SKU" />
            <button className="btn" onClick={() => { if (newCat.name.trim().length < 2) return setMsg({ ok: false, t: "Escribe el nombre de la categoría" }); setCats([...cats, { name: newCat.name.trim(), kind: newCat.kind, sku: newCat.sku || newCat.name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X"), active: true, builtin: false, mobile: false }]); setNewCat({ name: "", kind: "unit", sku: "" }); }}>+ Agregar</button>
          </div>
          <button className="btn primary mt-3" disabled={busy} onClick={() => run(() => saveCategoriesAction({ cats: cats.map(({ name, kind, sku, active }) => ({ name, kind, sku, active })) }), "Categorías guardadas")}>Guardar categorías</button>
        </div>
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">Sedes</h2>
          <p className="note mb-3">Cada producto vive en una sede y cada venta queda en la sede del equipo vendido. Puedes trasladar productos entre sedes desde su ficha. Al renombrar una sede se actualizan sus productos y ventas.</p>
          <div className="space-y-1.5">{sedes.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="main-sede" className="!w-auto" checked={mainSede === x.name} onChange={() => setMainSede(x.name)} aria-label="Sede principal" title="Sede principal (la de los productos nuevos)" />
              <input value={x.name} onChange={(e) => { const old = x.name; setSedes(sedes.map((y, j) => (j === i ? { ...y, name: e.target.value } : y))); if (mainSede === old) setMainSede(e.target.value); }} aria-label="Nombre de la sede" />
              <span className="note shrink-0">{x.from ? catalog.branchUsed[x.from] ?? 0 : 0} prod.</span>
              {sedes.length > 1 && <button className="btn sm" onClick={() => { const rest = sedes.filter((_, j) => j !== i); setSedes(rest); if (mainSede === x.name) setMainSede(rest[0].name); }} aria-label="Quitar sede">✕</button>}
            </div>))}</div>
          <p className="note mt-1">● = sede principal (donde entran los productos nuevos por defecto).</p>
          <div className="mt-3 flex flex-wrap gap-2"><button className="btn" onClick={() => setSedes([...sedes, { name: "", from: "" }])}>+ Agregar sede</button><button className="btn primary" disabled={busy} onClick={() => run(() => saveBranchesAction({ main: mainSede, list: sedes.map((x) => ({ name: x.name, from: x.from || undefined })) }), "Sedes guardadas")}>Guardar sedes</button></div>
        </div>
      </div>}

      {tab === "retomas" && <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="card p-4"><h2 className="mb-1 font-semibold">Porcentaje de la oferta por condición</h2><p className="note mb-3">Oferta sugerida = valor de referencia × porcentaje − descuentos por defectos. La persona siempre puede cambiar la oferta final.</p>
          <div className="space-y-2">{Object.keys(rates).map((c) => <div key={c} className="flex items-center gap-3"><label className="w-40 text-[13px]" htmlFor={"rt-" + c}>{c}</label><input id={"rt-" + c} type="number" min={1} max={100} className="!w-24" value={rates[c]} onChange={(e) => setRates({ ...rates, [c]: e.target.value })} /><span className="note">% del valor de referencia</span></div>)}</div></div>
        <div className="card p-4"><h2 className="mb-1 font-semibold">Defectos y su descuento</h2><p className="note mb-3">Aparecen como casillas al cotizar. La batería por debajo del 80 % se aplica sola.</p>
          <div className="space-y-2">{deds.map((d, i) => <div key={d.key} className="flex items-center gap-2"><input value={d.label} onChange={(e) => setDeds(deds.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Defecto" /><input type="number" min={0} max={60} className="!w-20" value={d.pct} onChange={(e) => setDeds(deds.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} aria-label="Descuento %" /><span className="note">%</span>{d.key !== "battery" && <button className="btn sm" onClick={() => setDeds(deds.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>}</div>)}</div>
          <button className="btn sm mt-3" onClick={() => setDeds([...deds, { key: "d" + Date.now().toString(36), label: "", pct: "5" }])}>+ Agregar defecto</button></div>
        <div className="flex flex-wrap items-center gap-2 xl:col-span-2"><button className="btn primary" disabled={busy} onClick={() => run(() => saveTradeinConfigAction({ rates: Object.fromEntries(Object.entries(rates).map(([k, x]) => [k, +x])), deds: deds.map((d) => ({ ...d, pct: +d.pct })) }), "Cotizador de retomas guardado")}>Guardar cotizador</button>
          <button className="btn" disabled={busy} onClick={() => { if (confirm("¿Volver a los porcentajes y defectos de fábrica?")) run(async () => { const r = await saveTradeinConfigAction({ rates: {}, deds: [], reset: true }); if (r.ok) { setRates(Object.fromEntries(Object.entries(rateTable()).map(([k, x]) => [k, String(Math.round(x * 100))]))); setDeds(dedTable().map((d) => ({ ...d, pct: String(d.pct) }))); } return r; }, "Cotizador restablecido"); }}>Restablecer valores de fábrica</button></div>
      </div>}

      {tab === "mensajes" && <div className="space-y-4">
        <div className="card p-4"><h2 className="mb-1 font-semibold">Correo automático del comprobante</h2>
          <p className="note mb-3">{mailReady ? "✅ El servicio de correo está conectado." : "⚠️ Falta conectar el correo: agrega GMAIL_USER y GMAIL_APP_PASSWORD (o RESEND_API_KEY y MAIL_FROM) en las variables de entorno de Vercel y vuelve a desplegar."}</p>
          <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="!w-auto mt-1" checked={v.autoSend} onChange={(e) => setV({ ...v, autoSend: e.target.checked })} /><span><b>Enviar el comprobante en PDF al correo del cliente</b> apenas se registre la venta (si el cliente tiene correo).</span></label></div>
        <div className="card p-4"><h2 className="mb-1 font-semibold">Mensaje de WhatsApp del comprobante</h2>
          <p className="note mb-2">Se escribe solo al pulsar «WhatsApp» en una venta. Variables: <code>{"{nombre}"}</code> <code>{"{negocio}"}</code> <code>{"{comprobante}"}</code> <code>{"{total}"}</code>.</p>
          <textarea rows={4} value={v.waReceipt} placeholder="Hola {nombre}, gracias por tu compra en {negocio}. Te envío tu comprobante {comprobante} en PDF." onChange={(e) => setV({ ...v, waReceipt: e.target.value })} />
          <p className="note mt-2"><b>Vista previa:</b> {(v.waReceipt || "Hola {nombre}, gracias por tu compra en {negocio}. Te envío tu comprobante {comprobante} en PDF.").replace(/\{nombre\}/g, "María").replace(/\{negocio\}/g, v.name || "Tu tienda").replace(/\{comprobante\}/g, "FV-1001").replace(/\{total\}/g, "$4.655.000")}</p></div>
        {saveBtn}
      </div>}

      {tab === "equipo" && <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <a href="/usuarios" className="card block p-4 hover:border-accent"><div className="note">Usuarios</div><b className="text-2xl">{team.active}</b><div className="note">activos de {team.users} · roles: {team.roles}</div><div className="mt-1 text-[13px] font-semibold">Usuarios y permisos →</div></a>
          <a href="/actividad" className="card block p-4 hover:border-accent"><div className="note">Registro de actividad</div><b className="text-lg">Quién hizo qué y cuándo</b><div className="mt-1 text-[13px] font-semibold">Abrir registro →</div></a>
          <a href="/salud" className="card block p-4 hover:border-accent"><div className="note">Salud del sistema</div><b className="text-lg">Revisión de consistencia</b><div className="mt-1 text-[13px] font-semibold">Revisar ahora →</div></a>
        </div>
        <div className="card p-4"><h2 className="mb-2 font-semibold">Seguridad</h2><ul className="space-y-1.5 text-[13.5px]"><li>🔑 Cada persona entra con su usuario y contraseña; tras varios intentos fallidos la cuenta se bloquea un tiempo.</li><li>🔐 Los permisos se asignan por rol (ver costos, dar descuentos, eliminar, aprobar…).</li><li>📜 Cada venta, retoma, pago, edición y acceso queda anotado con nombre y hora.</li><li>🩺 La revisión de consistencia avisa en Inicio si algo no cuadra entre módulos.</li></ul></div>
      </div>}

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
        <DeleteSales count={salesCount} />
        <div className="card p-4">
          <h2 className="font-semibold mb-1">Modelos por TAC</h2>
          <p className="note mb-3">El sistema aprende el modelo de cada TAC al ingresar equipos. Si tienes un CSV con «tac,marca,modelo» (por ejemplo de tacdb.osmocom.org, licencia CC-BY-SA), impórtalo aquí: solo se guardan los de Apple.</p>
          <label className="btn cursor-pointer">Importar CSV de TAC<input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { const r = await importTacAction(await f.text()); setMsg(r.ok ? { ok: true, t: `${r.data} modelos importados` } : { ok: false, t: r.error }); }); }} /></label>
        </div>
      </>}
      </div>
    </div>
  );
}
