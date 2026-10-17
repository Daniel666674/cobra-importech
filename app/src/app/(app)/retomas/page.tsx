import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireMe } from "@/server/session";
import { RetomaClient } from "./retoma-client";

export default async function Retomas() {
  await requireMe("tradein");
  const [cfg] = await (await getDb()).select().from(settings).limit(1);
  return (
    <>
      <PageHeader title="Retomas (trade-in)" subtitle="Cotiza el equipo del cliente, verifícalo y recíbelo al inventario" />
      <RetomaClient warr={cfg.warr} />
    </>
  );
}
