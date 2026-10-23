import { count, eq } from "drizzle-orm";
import { items } from "@/db/schema";
import { ReleaseReview } from "./release-review";
import { PriceUnpriced } from "./price-unpriced";
import Link from "next/link";
import { getDb } from "@/db";
import { CondChip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { CATALOG, CATS, CONDS, STATUSES } from "@/lib/catalog";
import { daysIn, itemState, isQty, stockQty } from "@/lib/items";
import { fdatey, fmt } from "@/lib/format";
import { hasPerm } from "@/server/auth";
import { listItems } from "@/server/inventory";
import { requireMe } from "@/server/session";

export default async function Inventario({ searchParams }: PageProps<"/inventario">) {
  const me = await requireMe("inv_view");
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const f = { q: one("q"), cat: one("cat"), cond: one("cond"), status: one("status") || "stock" };
  const model = one("model");
  const sort = one("sort");
  const db = await getDb();
  const [base, [{ n: review }]] = await Promise.all([listItems(db, f), db.select({ n: count() }).from(items).where(eq(items.status, "En revisión"))]);
  // Orden de modelos = orden del catálogo (los que no estén en él van al final, por nombre).
  const rank = new Map(CATALOG.map((c, i) => [c.name, i]));
  const byModel = (a: { name: string }, b: { name: string }) => (rank.get(a.name) ?? 1e6) - (rank.get(b.name) ?? 1e6) || a.name.localeCompare(b.name);
  const models = [...new Set(base.map((it) => it.name))].sort((a, b) => byModel({ name: a }, { name: b }));
  const rows = model ? base.filter((it) => it.name === model) : [...base];
  if (sort === "modelo") rows.sort(byModel);
  else if (sort === "categoria") rows.sort((a, b) => CATS.indexOf(a.cat as (typeof CATS)[number]) - CATS.indexOf(b.cat as (typeof CATS)[number]) || byModel(a, b));
  const canCost = hasPerm(me, "cost_view");
  const unpriced = rows.filter((it) => it.price === 0 && it.cost > 0 && it.status !== "Vendido").length;
  const units = rows.reduce((a, it) => a + stockQty(it), 0);
  return (
    <>
      <PageHeader title="Inventario" subtitle={`${rows.length} referencias · ${units} unidades`}
        actions={hasPerm(me, "inv_edit") ? <div className="flex flex-wrap gap-2">{unpriced > 0 && canCost && <PriceUnpriced count={unpriced} />}{review > 0 && hasPerm(me, "users") && <ReleaseReview count={review} />}<Link href="/inventario/importar" className="btn">📥 Importar desde Excel</Link><Link href="/ingreso" className="btn primary">➕ Ingresar producto</Link></div> : undefined} />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]" action="/inventario">
        <input name="q" defaultValue={f.q} placeholder="Buscar por nombre, IMEI, serial o SKU" aria-label="Buscar" />
        <select name="cat" defaultValue={f.cat} aria-label="Categoría"><option value="">Todas las categorías</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="model" defaultValue={model} aria-label="Modelo"><option value="">Todos los modelos</option>{models.map((m) => <option key={m}>{m}</option>)}</select>
        <select name="cond" defaultValue={f.cond} aria-label="Condición"><option value="">Toda condición</option>{CONDS.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="status" defaultValue={f.status} aria-label="Estado"><option value="stock">En stock</option><option value="">Todos</option>{STATUSES.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="sort" defaultValue={sort} aria-label="Ordenar"><option value="">Más recientes</option><option value="categoria">Por categoría</option><option value="modelo">Por modelo</option></select>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No hay productos con esos filtros.</Empty> : (
          <table className="t" id="inv-t">
            <thead><tr><th>Producto</th><th>Condición</th><th>Estado</th><th>Recibido</th>{canCost && <th className="num">Costo</th>}<th className="num">Precio</th></tr></thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.id} className="hover:bg-gray-bg/60">
                  <td>
                    <Link href={`/inventario/${it.id}`} className="font-semibold hover:underline">{it.name}{it.spec ? ` · ${it.spec}` : ""}</Link>
                    <div className="note">{it.sku}{it.color ? ` · ${it.color}` : ""}{isQty(it) ? ` · ${it.qty} uds.` : it.serial ? ` · ••${it.serial.slice(-6)}` : ""}</div>
                  </td>
                  <td><CondChip cond={it.cond} /></td>
                  <td><StatusChip status={itemState(it)} />{it.approval && <span className="chip warn ml-1">🕒 {it.approval.kind === "alta" ? "Por aprobar" : "Eliminar pedido"}</span>}</td>
                  <td className="whitespace-nowrap">{fdatey(it.acq)} <span className="note">({daysIn(it)} d)</span></td>
                  {canCost && <td className="num">{fmt(it.cost + it.repairs)}</td>}
                  <td className="num"><b>{fmt(it.price)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
