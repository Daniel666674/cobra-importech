import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { IngresoClient } from "./ingreso-client";

export default async function IngresoPage() {
  const me = await requireMe("inv_edit");
  const [cfg] = await (await getDb()).select().from(settings).limit(1);
  return (
    <>
      <PageHeader title="Ingresar producto" subtitle="Registra equipos y accesorios. Para iPhone, el IMEI se verifica antes de guardar." />
      <IngresoClient warr={cfg.warr} canCost={hasPerm(me, "cost_view")} />
    </>
  );
}
