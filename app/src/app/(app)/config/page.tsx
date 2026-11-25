import { mailConfigured } from "@/server/mail";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { counters, sales, settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { CONDS, METHODS, enabledMethods } from "@/lib/catalog";
import { WARR_TERMS } from "@/components/receipt";
import { importSources } from "@/server/import";
import { requireMe } from "@/server/session";
import { items, roles, users } from "@/db/schema";
import { catDefs } from "@/lib/catalog";
import { ConfigClient } from "./config-client";

export default async function Config({ searchParams }: PageProps<"/config">) {
  await requireMe("settings");
  const db = await getDb();
  const [[cfg], [inv], sources, [{ n: salesCount }], us, rs, its] = await Promise.all([
    db.select().from(settings).limit(1),
    db.select().from(counters).where(eq(counters.key, "invoice")),
    importSources(db),
    db.select({ n: count() }).from(sales).where(eq(sales.source, "")),
    db.select({ active: users.active }).from(users),
    db.select({ key: roles.key }).from(roles),
    db.select({ cat: items.cat, branch: items.branch }).from(items),
  ]);
  const tab = (await searchParams).tab;
  const checklist = [
    { key: "name", label: "Nombre, razón social y NIT", hint: "Salen en cada comprobante.", tab: "negocio", done: !!(cfg.name && cfg.legal && cfg.nit) },
    { key: "contact", label: "Dirección, ciudad y teléfono", hint: "Datos de contacto del negocio.", tab: "negocio", done: !!(cfg.address && cfg.city && cfg.phone) },
    { key: "logo", label: "Logo del negocio", hint: "Aparece en el menú, el inicio de sesión y los comprobantes.", tab: "negocio", done: !!cfg.logo },
    { key: "methods", label: "Formas de pago y recargos", hint: "Activa las que usas y fija los recargos (Addi, datáfono…).", tab: "caja", done: (cfg.methods?.length ?? 0) > 0 || Object.keys(cfg.surcharges ?? {}).length > 0 },
    { key: "banks", label: "Bancos para transferencias", hint: "Para saber a qué cuenta entra cada pago.", tab: "caja", done: cfg.banks.length > 0 },
    { key: "warr", label: "Garantías por condición", hint: "Meses de garantía para nuevo, usado, reacondicionado…", tab: "garantias", done: Object.values(cfg.warr ?? {}).some((x) => x > 0) },
    { key: "trade", label: "Cotizador de retomas", hint: "Porcentajes por condición y defectos.", tab: "retomas", done: Object.keys(cfg.tradeRates ?? {}).length > 0 || (cfg.tradeDeds?.length ?? 0) > 0 },
    { key: "mail", label: "Correo automático conectado", hint: "Para enviar el comprobante en PDF al cliente.", tab: "mensajes", done: mailConfigured() },
    { key: "wa", label: "WhatsApp de la tienda", hint: "Número con indicativo para mensajes y alertas.", tab: "negocio", done: !!cfg.whatsapp },
    { key: "team", label: "Equipo con sus propios usuarios", hint: "Cada persona con su acceso y permisos.", tab: "equipo", done: us.filter((u) => u.active).length > 1 },
  ];
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos del negocio, comprobante, garantías, caja e importación de datos" />
      <ConfigClient
        initialTab={typeof tab === "string" ? tab : "inicio"}
        cfg={{ ...cfg, logo: undefined }}
        logo={cfg.logo}
        numbering={{ prefix: cfg.invPrefix, last: inv?.value ?? 0 }}
        warranty={{ warr: Object.fromEntries(CONDS.map((c) => [c, cfg.warr[c] ?? 0])), terms: cfg.warrTerms.length ? cfg.warrTerms : WARR_TERMS, custom: cfg.warrTerms.length > 0 }}
        methods={{ all: [...METHODS], on: enabledMethods(cfg), surcharges: cfg.surcharges ?? {} }}
        banks={cfg.banks}
        mailReady={mailConfigured()}
        checklist={checklist}
        catalog={{ defs: catDefs(cfg.categories), used: its.reduce<Record<string, number>>((m, i) => ((m[i.cat] = (m[i.cat] ?? 0) + 1), m), {}), main: cfg.branch, branches: [...new Set([cfg.branch, ...cfg.branches])], branchUsed: its.reduce<Record<string, number>>((m, i) => ((m[i.branch] = (m[i.branch] ?? 0) + 1), m), {}) }}
        team={{ users: us.length, active: us.filter((u) => u.active).length, roles: rs.length }}
        salesCount={salesCount}
        sources={sources.map((s) => ({ ...s, total: Number(s.total), from: Number(s.from), to: Number(s.to) }))}
      />
    </>
  );
}
