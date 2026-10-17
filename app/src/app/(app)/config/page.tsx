import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireMe } from "@/server/session";
import { ConfigClient } from "./config-client";

export default async function Config() {
  await requireMe("settings");
  const [cfg] = await (await getDb()).select().from(settings).limit(1);
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del negocio, logo y reglas de venta" />
      <ConfigClient cfg={{ name: cfg.name, legal: cfg.legal, nit: cfg.nit, address: cfg.address, phone: cfg.phone, email: cfg.email, footer: cfg.footer, brand: cfg.brand, maxDisc: cfg.maxDisc, minMargin: cfg.minMargin, trm: cfg.trm, agedDays: cfg.agedDays, holdDays: cfg.holdDays, apartadoMinPct: cfg.apartadoMinPct, ownerPhone: cfg.ownerPhone }} logo={cfg.logo} />
      <div className="note mt-6">Copia de seguridad: { }
        <a className="underline" href="/api/export/inventario" download>descargar inventario (CSV)</a> · { }
        <a className="underline" href="/api/export/ventas" download>descargar ventas (CSV)</a></div>
    </>
  );
}
