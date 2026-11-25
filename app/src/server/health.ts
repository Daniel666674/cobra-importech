import "server-only";
import type { Db } from "@/db";
import { allies, allyMoves, cashCloses, claims, items, orders, sales, settings, users } from "@/db/schema";
import { catDefs } from "@/lib/catalog";
import { isQty } from "@/lib/items";
import { fmt } from "@/lib/format";
import { lineNet, saleNet, saleVoid } from "@/lib/sales";
import { cajaDay } from "@/server/caja";

export type HealthLink = { label: string; href: string };
export type HealthCheck = { key: string; level: "ok" | "warn" | "bad"; title: string; detail: string; items: HealthLink[] };

/**
 * Revisión de consistencia: cruza inventario, ventas, caja, cartera, apartados, taller y garantías y
 * señala cualquier dato que no cuadre. Solo lee; no cambia nada.
 */
export async function systemHealth(db: Db): Promise<{ checks: HealthCheck[]; bad: number; warn: number; at: number }> {
  const [[cfg]] = await Promise.all([db.select().from(settings).limit(1)]);
  const [its, ss, orders_, claims_, allies_, moves, closes, us] = await Promise.all([
    db.select().from(items), db.select().from(sales), db.select().from(orders), db.select().from(claims),
    db.select().from(allies), db.select().from(allyMoves), db.select().from(cashCloses), db.select().from(users),
  ]);
  const checks: HealthCheck[] = [];
  const add = (key: string, level: "warn" | "bad", title: string, detail: string, list: HealthLink[]) => {
    checks.push({ key, level: list.length ? level : "ok", title, detail: list.length ? detail : "Todo en orden", items: list.slice(0, 25) });
  };
  const itemById = new Map(its.map((i) => [i.id, i]));
  const real = ss.filter((s) => s.mode !== "historico");
  const sold = new Map<string, string[]>(); // item → ventas vigentes donde está
  for (const s of ss) for (const l of s.lines) if (l.item && lineNet(l) > 0) sold.set(l.item, [...(sold.get(l.item) ?? []), s.no]);
  const saleHref = (s: { id: string }) => `/ventas/${s.id}`;

  // 1. Inventario ↔ ventas
  add("sold-no-sale", "bad", "Equipos marcados «Vendido» sin venta que los respalde", "El equipo salió del inventario pero ningún comprobante lo incluye: revisa si la venta se borró o se devolvió sin devolver el equipo.",
    its.filter((i) => !isQty(i) && i.status === "Vendido" && !sold.has(i.id)).map((i) => ({ label: `${i.name}${i.serial ? " · ••" + i.serial.slice(-6) : ""}`, href: `/inventario/${i.id}` })));
  add("sale-item-stock", "bad", "Equipos vendidos que siguen en vitrina", "Una venta vigente incluye el equipo pero el inventario lo muestra disponible: se podría vender dos veces.",
    real.flatMap((s) => s.lines.filter((l) => l.item && lineNet(l) > 0 && itemById.get(l.item) && !isQty(itemById.get(l.item)!) && itemById.get(l.item)!.status === "En vitrina").map((l) => ({ label: `${s.no} · ${l.name}`, href: saleHref(s) }))));
  add("negative-stock", "bad", "Stock negativo", "Hay productos por cantidad con unidades por debajo de cero.", its.filter((i) => isQty(i) && i.qty < 0).map((i) => ({ label: `${i.name}: ${i.qty}`, href: `/inventario/${i.id}` })));
  add("double-sold", "bad", "Un mismo equipo vendido en más de una venta vigente", "Un equipo único aparece en varios comprobantes sin devolución.",
    [...sold.entries()].filter(([id, nos]) => itemById.get(id)?.track !== "qty" && nos.length > 1).map(([id, nos]) => ({ label: `${itemById.get(id)?.name ?? id}: ${nos.join(", ")}`, href: `/inventario/${id}` })));

  // 2. Duplicados
  const bySerial = new Map<string, typeof its>();
  for (const i of its) if (!isQty(i) && i.serial) bySerial.set(i.serial, [...(bySerial.get(i.serial) ?? []), i]);
  add("dup-serial", "warn", "IMEI o serial repetido en el inventario", "Dos fichas comparten el mismo IMEI/serial (puede ser una retoma que volvió a entrar).",
    [...bySerial.entries()].filter(([, v]) => v.length > 1 && v.filter((i) => i.status !== "Vendido").length > 1).map(([sn, v]) => ({ label: `••${sn.slice(-6)} · ${v.map((i) => i.sku).join(", ")}`, href: `/inventario/${v[0].id}` })));
  const byNo = new Map<string, typeof ss>();
  for (const s of ss) byNo.set(s.no, [...(byNo.get(s.no) ?? []), s]);
  add("dup-invoice", "bad", "Número de comprobante repetido", "Dos ventas tienen el mismo número.", [...byNo.entries()].filter(([, v]) => v.length > 1).map(([no, v]) => ({ label: `${no} (${v.length} ventas)`, href: saleHref(v[0]) })));

  // 3. Ventas ↔ pagos
  add("sale-math", "bad", "Ventas cuyos pagos no cuadran con el total", "Total ≠ pagos + abonos del apartado + saldo pendiente. Edita la venta para corregirla.",
    real.filter((s) => !saleVoid(s)).filter((s) => {
      const paid = s.payments.reduce((a, p) => a + p.amount, 0) + (s.holdPays ?? []).reduce((a, p) => a + p.amount, 0);
      return Math.abs(saleNet(s) - (paid + s.pending)) > 1 && Math.abs(s.total - (paid + s.pending)) > 1;
    }).map((s) => ({ label: `${s.no} · total ${fmt(saleNet(s))}`, href: saleHref(s) })));
  add("pending-neg", "bad", "Saldo pendiente inválido", "Saldo pendiente negativo o mayor al total.", real.filter((s) => s.pending < 0 || s.pending > Math.max(saleNet(s), s.total) + 1).map((s) => ({ label: `${s.no} · saldo ${fmt(s.pending)}`, href: saleHref(s) })));
  add("sale-no-client-pending", "warn", "Ventas con saldo pendiente y sin cliente", "No se sabe a quién cobrarle.", real.filter((s) => s.pending > 0 && !saleVoid(s) && !s.client).map((s) => ({ label: `${s.no} · debe ${fmt(s.pending)}`, href: saleHref(s) })));
  add("tradein-missing", "bad", "Retomas de una venta que ya no existen en el inventario", "La venta dice que recibió un equipo pero la ficha fue eliminada.",
    ss.flatMap((s) => (s.tradeins ?? []).filter((t) => !itemById.has(t.item)).map((t) => ({ label: `${s.no} · ${t.name}`, href: saleHref(s) }))));

  // 4. Cartera con tiendas aliadas
  const debtRefs = new Set(moves.filter((m) => m.kind === "deuda").map((m) => m.ref));
  const allyConsign = new Map(allies_.map((a) => [a.id, a.mode === "consignacion"]));
  add("ally-no-debt", "bad", "Ventas de productos de tiendas aliadas sin deuda registrada", "Se vendió producto de una aliada en consignación y no quedó la deuda en su cartera.",
    real.filter((s) => !saleVoid(s)).filter((s) => s.lines.some((l) => l.ally && lineNet(l) > 0 && l.cost > 0 && (allyConsign.get(l.ally) || !l.item))).filter((s) => !debtRefs.has(s.no)).map((s) => ({ label: `${s.no}`, href: saleHref(s) })));
  add("ally-orphan", "warn", "Movimientos de cartera de ventas que ya no existen", "Quedó una deuda o pago ligado a un comprobante inexistente.",
    moves.filter((m) => m.ref && /^(FV|IMP|H)-?\d|^S-/i.test(m.ref) && !byNo.has(m.ref) && !m.voided).map((m) => ({ label: `${m.ref} · ${fmt(m.amount)}`, href: `/cartera/${m.ally}` })));
  add("ally-advance", "warn", "Tiendas aliadas con saldo a favor (anticipo)", "Se les pagó más de lo que se les debe; se cruza con lo que se les deba después.",
    allies_.filter((a) => moves.filter((m) => m.ally === a.id && !m.voided).reduce((x, m) => x + (m.kind === "pago" ? -m.amount : m.amount), 0) < 0).map((a) => ({ label: a.name, href: `/cartera/${a.id}` })));

  // 5. Apartados, taller, garantías
  add("hold-status", "bad", "Apartados con el equipo en otro estado", "El equipo tiene un apartado pero no figura «Apartado».", its.filter((i) => i.hold && i.status !== "Apartado").map((i) => ({ label: i.name, href: `/inventario/${i.id}` })));
  add("status-hold", "warn", "Equipos «Apartado» sin apartado", "Figuran apartados pero no hay abono ni vencimiento registrado.", its.filter((i) => i.status === "Apartado" && !i.hold).map((i) => ({ label: i.name, href: `/inventario/${i.id}` })));
  add("order-item", "warn", "Reparaciones abiertas cuyo equipo no está «En taller»", "El tablero y el inventario no coinciden.",
    orders_.filter((o) => !o.outcome && o.item && itemById.get(o.item) && itemById.get(o.item)!.status !== "En taller").map((o) => ({ label: `${o.id} · ${itemById.get(o.item!)!.name} (${itemById.get(o.item!)!.status})`, href: "/taller" })));
  const saleIds = new Set(ss.map((s) => s.id));
  add("claim-sale", "warn", "Reclamos de garantía de ventas que ya no existen", "El reclamo apunta a un comprobante inexistente.", claims_.filter((c) => !saleIds.has(c.sale)).map((c) => ({ label: c.id, href: "/garantias" })));
  add("review-stale", "warn", "Equipos «En revisión» desde hace más de 7 días", "Siguen esperando la verificación oficial.", its.filter((i) => i.status === "En revisión" && Date.now() - i.acq > 7 * 86400_000).map((i) => ({ label: i.name, href: `/inventario/${i.id}` })));
  add("no-price", "warn", "Equipos en vitrina sin precio de venta", "No se podrán vender sin escribir el precio en caja.", its.filter((i) => i.status === "En vitrina" && i.price <= 0 && (isQty(i) ? i.qty > 0 : true) && !i.approval).map((i) => ({ label: i.name, href: `/inventario/${i.id}` })));
  add("below-cost", "warn", "Equipos en vitrina con precio por debajo del costo", "Se perdería plata al venderlos al precio actual.", its.filter((i) => i.status === "En vitrina" && i.price > 0 && i.price < i.cost && !isQty(i) || (isQty(i) && i.qty > 0 && i.price > 0 && i.price < i.cost)).map((i) => ({ label: `${i.name}: precio ${fmt(i.price)} < costo ${fmt(i.cost)}`, href: `/inventario/${i.id}` })));

  // 5b. Catálogo y sedes
  const known = new Set(catDefs(cfg?.categories).map((c) => c.name));
  add("cat-unknown", "warn", "Productos de una categoría que ya no existe", "Revisa su categoría en la ficha o vuelve a crearla en Configuración.", its.filter((i) => !known.has(i.cat)).map((i) => ({ label: `${i.name} · ${i.cat}`, href: `/inventario/${i.id}` })));
  const sedes = new Set([cfg?.branch ?? "", ...(cfg?.branches ?? [])]);
  add("branch-unknown", "warn", "Productos en una sede que no está configurada", "Agrega la sede en Configuración → Categorías y sedes o traslada el producto.", its.filter((i) => i.status !== "Vendido" && i.branch && !sedes.has(i.branch)).map((i) => ({ label: `${i.name} · ${i.branch}`, href: `/inventario/${i.id}` })));

  // 6. Caja y accesos
  add("cash-diff", "warn", "Cierres de caja con diferencia", "El efectivo contado no coincidió con el esperado.", closes.filter((c) => c.counted !== c.expected).sort((a, b) => b.t - a.t).slice(0, 10).map((c) => ({ label: `${c.day} · diferencia ${fmt(c.counted - c.expected)}`, href: `/caja?dia=${c.day}` })));
  const recent = [...new Map(closes.sort((a, b) => b.t - a.t).map((c) => [c.day, c])).values()].slice(0, 5);
  const moved: HealthLink[] = [];
  for (const c of recent) { const d = await cajaDay(db, c.day); if (d.expected !== c.expected) moved.push({ label: `${c.day} · al cerrar esperaba ${fmt(c.expected)}, hoy calcula ${fmt(d.expected)}`, href: `/caja?dia=${c.day}` }); }
  add("cash-moved", "warn", "Cajas que cambiaron después de cerrarse", "Se editó, borró o registró algo en un día que ya estaba cerrado.", moved);
  const activeOwners = us.filter((u) => u.active && (u.role === "owner" || u.role === "dev"));
  add("no-owner", "bad", "No hay un propietario/a activo", "Nadie puede aprobar ni administrar el sistema.", activeOwners.length ? [] : [{ label: "Usuarios y permisos", href: "/usuarios" }]);

  return { checks, bad: checks.filter((c) => c.level === "bad").length, warn: checks.filter((c) => c.level === "warn").length, at: Date.now() };
}
