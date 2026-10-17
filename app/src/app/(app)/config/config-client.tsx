"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveLogoAction, saveSettingsAction } from "@/app/actions/admin";

type Cfg = { name: string; legal: string; nit: string; address: string; phone: string; email: string; footer: string; brand: string; maxDisc: number; minMargin: number; trm: number; agedDays: number; holdDays: number; apartadoMinPct: number };

/** Reduce la imagen a un máximo de 256 px y la guarda como PNG (cabe en la base de datos y se imprime bien). */
async function processLogo(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function ConfigClient({ cfg, logo }: { cfg: Cfg; logo: string }) {
  const router = useRouter();
  const [v, setV] = useState(cfg);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const txt = (k: keyof Cfg, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="lb" htmlFor={"c-" + k}>{label}</label><input id={"c-" + k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value } as Cfg)} {...props} /></div>
  );
  return (
    <div className="space-y-5">
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo || "/logo.png"} alt="Logo actual" className="h-20 w-20 rounded-lg border border-line bg-white object-contain" />
          <div className="space-y-2">
            <label className="btn cursor-pointer">Subir logo desde un archivo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { try { const r = await saveLogoAction(await processLogo(f)); setMsg(r.ok ? { ok: true, t: "Logo actualizado" } : { ok: false, t: r.error }); router.refresh(); } catch { setMsg({ ok: false, t: "No se pudo leer la imagen" }); } }); }} /></label>
            {logo && <button className="btn sm ml-2" onClick={() => start(async () => { await saveLogoAction(""); router.refresh(); })}>Quitar</button>}
            <p className="note">PNG, JPG o WebP. Se ajusta automáticamente y sale en los comprobantes.</p>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Datos del negocio</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {txt("name", "Nombre comercial")}{txt("legal", "Razón social")}{txt("nit", "NIT")}{txt("phone", "Teléfono")}{txt("address", "Dirección")}{txt("email", "Correo")}
          <div className="sm:col-span-2">{txt("footer", "Mensaje al pie del comprobante")}</div>
          <div><label className="lb" htmlFor="c-brand">Color de marca</label><input id="c-brand" type="color" value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} className="!h-10 !p-1" /></div>
        </div>
      </div>
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Reglas</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {txt("maxDisc", "Descuento máximo sin autorización (%)", { type: "number" })}{txt("minMargin", "Margen mínimo esperado (%)", { type: "number" })}{txt("trm", "TRM de referencia (COP/USD)", { type: "number" })}
          {txt("agedDays", "Días para alertar inventario viejo", { type: "number" })}{txt("holdDays", "Días de un apartado", { type: "number" })}{txt("apartadoMinPct", "Abono mínimo del apartado (%)", { type: "number" })}
        </div>
      </div>
      <button className="btn primary" disabled={busy} onClick={() => start(async () => { const r = await saveSettingsAction(v); setMsg(r.ok ? { ok: true, t: "Configuración guardada" } : { ok: false, t: r.error }); router.refresh(); })}>Guardar configuración</button>
    </div>
  );
}
