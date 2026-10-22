import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { counters, settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { CONDS, METHODS, enabledMethods } from "@/lib/catalog";
import { WARR_TERMS } from "@/components/receipt";
import { importSources } from "@/server/import";
import { requireMe } from "@/server/session";
import { ConfigClient } from "./config-client";

export default async function Config({ searchParams }: PageProps<"/config">) {
  await requireMe("settings");
  const db = await getDb();
  const [[cfg], [inv], sources] = await Promise.all([
    db.select().from(settings).limit(1),
    db.select().from(counters).where(eq(counters.key, "invoice")),
    importSources(db),
  ]);
  const tab = (await searchParams).tab;
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del negocio, comprobante, garantías, caja e importación de datos" />
      <ConfigClient
        initialTab={typeof tab === "string" ? tab : "negocio"}
        cfg={{ ...cfg, logo: undefined }}
        logo={cfg.logo}
        numbering={{ prefix: cfg.invPrefix, last: inv?.value ?? 0 }}
        warranty={{ warr: Object.fromEntries(CONDS.map((c) => [c, cfg.warr[c] ?? 0])), terms: cfg.warrTerms.length ? cfg.warrTerms : WARR_TERMS, custom: cfg.warrTerms.length > 0 }}
        methods={{ all: [...METHODS], on: enabledMethods(cfg), surcharges: cfg.surcharges ?? {} }}
        sources={sources.map((s) => ({ ...s, total: Number(s.total), from: Number(s.from), to: Number(s.to) }))}
      />
    </>
  );
}
