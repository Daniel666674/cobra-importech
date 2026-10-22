import Link from "next/link";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { hasPerm } from "@/server/auth";
import { inventorySources } from "@/server/import-inventory";
import { requireMe } from "@/server/session";
import { ImportInventory } from "./import-inventory";

export default async function ImportarInventario() {
  const me = await requireMe("inv_edit");
  const db = await getDb();
  const [[cfg], sources] = await Promise.all([db.select().from(settings).limit(1), inventorySources(db)]);
  return (
    <>
      <Link href="/inventario" className="note hover:underline">← Inventario</Link>
      <PageHeader title="Importar inventario" subtitle="Carga los productos que hay hoy en la tienda desde Excel o CSV" />
      <ImportInventory warr={cfg.warr} sources={sources} canUndo={hasPerm(me, "inv_delete")} />
    </>
  );
}
