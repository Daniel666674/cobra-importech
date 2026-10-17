import Link from "next/link";
import { getDb } from "@/db";
import { CondChip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { CATS, CONDS, STATUSES } from "@/lib/catalog";
import { daysIn, itemState, isQty, stockQty, margin, marginPct } from "@/lib/items";
import { fmt } from "@/lib/format";
import { hasPerm } from "@/server/auth";
import { listItems } from "@/server/inventory";
import { requireMe } from "@/server/session";

export default async function Inventario({ searchParams }: PageProps<"/inventario">) {
  const me = await requireMe("inv_view");
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const f = { q: one("q"), cat: one("cat"), cond: one("cond"), status: one("status") || "stock" };
  const rows = await listItems(await getDb(), f);
  const canCost = hasPerm(me, "cost_view");
  const units = rows.reduce((a, it) => a + stockQty(it), 0);
  return (
    <>
      <PageHeader title="Inventario" subtitle={`${rows.length} referencias · ${units} unidades`}
        actions={hasPerm(me, "inv_edit") ? <Link href="/ingreso" className="btn primary">➕ Ingresar producto</Link> : undefined} />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]" action="/inventario">
        <input name="q" defaultValue={f.q} placeholder="Buscar por nombre, IMEI, serial o SKU" aria-label="Buscar" />
        <select name="cat" defaultValue={f.cat} aria-label="Categoría"><option value="">Todas las categorías</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="cond" defaultValue={f.cond} aria-label="Condición"><option value="">Toda condición</option>{CONDS.map((c) => <option key={c}>{c}</option>)}</select>
        <select name="status" defaultValue={f.status} aria-label="Estado"><option value="stock">En stock</option><option value="">Todos</option>{STATUSES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No hay productos con esos filtros.</Empty> : (
          <table className="t" id="inv-t">
            <thead><tr><th>Producto</th><th>Condición</th><th>Estado</th><th className="num">Días</th>{canCost && <th className="num">Costo</th>}<th className="num">Precio</th>{canCost && <th className="num">Margen</th>}</tr></thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.id} className="hover:bg-gray-bg/60">
                  <td>
                    <Link href={`/inventario/${it.id}`} className="font-semibold hover:underline">{it.name}{it.spec ? ` · ${it.spec}` : ""}</Link>
                    <div className="note">{it.sku}{it.color ? ` · ${it.color}` : ""}{isQty(it) ? ` · ${it.qty} uds.` : it.serial ? ` · ••${it.serial.slice(-6)}` : ""}</div>
                  </td>
                  <td><CondChip cond={it.cond} /></td>
                  <td><StatusChip status={itemState(it)} /></td>
                  <td className="num">{daysIn(it)}</td>
                  {canCost && <td className="num">{fmt(it.cost + it.repairs)}</td>}
                  <td className="num"><b>{fmt(it.price)}</b></td>
                  {canCost && <td className="num">{marginPct(it)}% <span className="note">({fmt(margin(it))})</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
