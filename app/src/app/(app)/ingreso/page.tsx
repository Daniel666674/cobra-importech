import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { allies, settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { IngresoClient } from "./ingreso-client";

export default async function IngresoPage({ searchParams }: PageProps<"/ingreso">) {
  const me = await requireMe("inv_edit");
  const db = await getDb();
  const [cfg] = await db.select().from(settings).limit(1);
  const al = (await db.select({ id: allies.id, name: allies.name }).from(allies).where(eq(allies.active, true))).sort((a, b) => a.name.localeCompare(b.name));
  const want = (await searchParams).ally;
  const initialAlly = typeof want === "string" && al.some((x) => x.id === want) ? want : "";
  return (
    <>
      <PageHeader title="Ingresar producto" subtitle="Registra equipos y accesorios. Para iPhone, el IMEI se verifica antes de guardar." />
      <IngresoClient warr={cfg.warr} canCost={hasPerm(me, "cost_view")} allies={al} initialAlly={initialAlly} />
    </>
  );
}
