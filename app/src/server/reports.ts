import { bogotaToday, dayRange } from "@/server/caja";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { claims, clients, items, orders, sales, settings, users } from "@/db/schema";
import { DAY, daysAgo } from "@/lib/format";
import { holdBal, holdLeft } from "@/lib/hold";
import { daysIn, inStock, isQty, stockQty, uname } from "@/lib/items";
import { lineNet, saleCost, saleNet, saleVoid } from "@/lib/sales";

export type Alert = { key: string; level: "bad" | "warn" | "info"; title: string; detail: string; href: string };

export async function dashboard(db: Db, now = Date.now()) {
  const [[st], its, ss, cl] = await Promise.all([db.select().from(settings).limit(1), db.select().from(items), db.select().from(sales), db.select().from(claims)]);
  const stock = its.filter(inStock);
  const valid = ss.filter((s) => !saleVoid(s));
  // «Hoy» = el día calendario de Bogotá (UTC−5, sin horario de verano): de 00:00 a 24:00 hora local.
  const todayMs = dayRange(bogotaToday(now)).from;
  const inRange = (t: number, days: number) => now - t <= days * DAY;
  const sum = (arr: typeof valid, f: (s: (typeof valid)[number]) => number) => arr.reduce((a, s) => a + f(s), 0);
  const month = valid.filter((s) => inRange(s.t, 30));
  const prev = valid.filter((s) => inRange(s.t, 60) && !inRange(s.t, 30));
  const today = valid.filter((s) => s.t >= todayMs && s.t < todayMs + DAY);
  const value = (kind: "price" | "cost") => stock.reduce((a, it) => a + (kind === "price" ? it.price : it.cost + (it.repairs || 0) / Math.max(1, stockQty(it))) * stockQty(it), 0);

  const alerts: Alert[] = [];
  const aged = stock.filter((it) => !isQty(it) && it.status === "En vitrina" && daysIn(it, now) >= st.agedDays);
  if (aged.length) alerts.push({ key: "aged", level: "warn", title: `${aged.length} equipos con más de ${st.agedDays} días en vitrina`, detail: "Capital inmovilizado: considera bajar el precio.", href: "/inventario?status=stock" });
  const low = its.filter((it) => isQty(it) && it.min && it.qty <= it.min);
  if (low.length) alerts.push({ key: "reorder", level: "warn", title: `${low.length} productos con stock bajo`, detail: low.slice(0, 3).map((i) => i.name).join(" · "), href: "/inventario" });
  const holds = its.filter((it) => it.hold);
  const soon = holds.filter((it) => holdLeft(it.hold!, now) <= 2);
  if (soon.length) alerts.push({ key: "apartado", level: "bad", title: `${soon.length} apartado(s) vencen en 2 días o menos`, detail: soon.map((i) => uname(i)).slice(0, 2).join(" · "), href: "/apartados" });
  const review = its.filter((it) => it.status === "En revisión");
  if (review.length) alerts.push({ key: "review", level: "warn", title: `${review.length} equipo(s) esperan verificación oficial`, detail: "No se pueden vender hasta registrar CRC y Apple.", href: "/inventario?status=En revisión" });
  const open = cl.filter((c) => c.status !== "Resuelto");
  if (open.length) alerts.push({ key: "claims", level: "info", title: `${open.length} reclamo(s) de garantía abiertos`, detail: "Revisa la sección de garantías.", href: "/garantias" });

  const owing = valid.filter((s) => s.pending > 0);
  if (owing.length) alerts.push({ key: "pending", level: "warn", title: `${owing.length} venta(s) con saldo pendiente`, detail: `Por cobrar ${owing.reduce((x, s) => x + s.pending, 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}`, href: "/cobrar" });

  const byProduct = new Map<string, number>();
  for (const s of month) for (const l of s.lines) byProduct.set(l.name, (byProduct.get(l.name) ?? 0) + lineNet(l));
  const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const days = Array.from({ length: 14 }, (_, i) => {
    const from = todayMs - (13 - i) * DAY;
    return { t: from, total: valid.filter((s) => s.t >= from && s.t < from + DAY).reduce((a, s) => a + saleNet(s), 0) };
  });
  return {
    kpi: {
      todayTotal: sum(today, saleNet), todayCount: today.length,
      monthTotal: sum(month, saleNet), monthCount: month.length, prevTotal: sum(prev, saleNet),
      monthMargin: sum(month, (s) => saleNet(s) - saleCost(s)),
      stockUnits: stock.reduce((a, it) => a + stockQty(it), 0), stockCost: value("cost"), stockPrice: value("price"),
      holds: holds.length, holdsBalance: holds.reduce((a, it) => a + holdBal(it.price, it.hold), 0),
    },
    alerts, top, days,
  };
}

export async function reportData(db: Db, days: number, now = Date.now()) {
  const ss = (await db.select().from(sales)).filter((s) => !saleVoid(s) && now - s.t <= days * DAY);
  const its = await db.select().from(items);
  const byCat = new Map<string, { total: number; margin: number; units: number }>();
  const byMethod = new Map<string, number>();
  const byUser = new Map<string, number>();
  const itemCat = new Map(its.map((i) => [i.id, i.cat]));
  for (const s of ss) {
    for (const l of s.lines) {
      const cat = itemCat.get(l.item) ?? "Otros";
      const e = byCat.get(cat) ?? { total: 0, margin: 0, units: 0 };
      const net = Math.round(lineNet(l) * l.price * (1 - s.disc / 100));
      e.total += net; e.margin += net - lineNet(l) * l.cost; e.units += lineNet(l);
      byCat.set(cat, e);
    }
    for (const p of s.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    byUser.set(s.by, (byUser.get(s.by) ?? 0) + saleNet(s));
  }
  const ords = await db.select().from(orders).where(eq(orders.outcome, ""));
  return {
    total: ss.reduce((a, s) => a + saleNet(s), 0), count: ss.length, margin: ss.reduce((a, s) => a + saleNet(s) - saleCost(s), 0),
    byCat: [...byCat.entries()].map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.total - a.total),
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    byUser: [...byUser.entries()],
    openOrders: ords.length,
  };
}

/* ───────────── Reportes avanzados (con filtros y comparación de período) ───────────── */
export type ReportFilters = { desde: string; hasta: string; vendedor: string; metodo: string; cat: string };
type Agg = { total: number; margin: number; units: number; n: number };
const blank = (): Agg => ({ total: 0, margin: 0, units: 0, n: 0 });

function aggregate(ss: (typeof sales.$inferSelect)[], f: ReportFilters, itemCat: Map<string, string>) {
  const byCat = new Map<string, Agg>(), byProduct = new Map<string, Agg & { item: string }>(), bySeller = new Map<string, Agg>(), byClient = new Map<string, Agg>();
  const byMethod = new Map<string, { amount: number; n: number }>();
  const byDay = new Map<string, { total: number; n: number }>();
  const byWeekday = Array.from({ length: 7 }, () => ({ total: 0, n: 0 })); // 0 = lunes
  const byHour = Array.from({ length: 24 }, () => ({ total: 0, n: 0 }));
  let total = 0, margin = 0, units = 0, count = 0, discount = 0, surcharge = 0, pending = 0;
  for (const s of ss) {
    if (saleVoid(s)) continue;
    if (f.vendedor && s.by !== f.vendedor) continue;
    if (f.metodo && !(s.method === f.metodo || s.payments.some((p) => p.method === f.metodo))) continue;
    let sTotal = 0, sMargin = 0, sUnits = 0, hit = false;
    const touched = new Set<string>();
    for (const l of s.lines) {
      const cat = itemCat.get(l.item) ?? "Otros";
      if (f.cat && cat !== f.cat) continue;
      const q = lineNet(l);
      if (q <= 0) continue;
      hit = true;
      const net = Math.round(q * l.price * (1 - s.disc / 100));
      const mg = net - q * l.cost;
      sTotal += net; sMargin += mg; sUnits += q; discount += q * l.price - net;
      const c = byCat.get(cat) ?? blank(); c.total += net; c.margin += mg; c.units += q; if (!touched.has("c" + cat)) { c.n++; touched.add("c" + cat); } byCat.set(cat, c);
      const key = l.name; const pr = byProduct.get(key) ?? { ...blank(), item: l.item }; pr.total += net; pr.margin += mg; pr.units += q; if (!touched.has("p" + key)) { pr.n++; touched.add("p" + key); } byProduct.set(key, pr);
    }
    if (!hit) continue;
    count++; total += sTotal; margin += sMargin; units += sUnits; surcharge += s.surcharge ?? 0; pending += s.pending;
    const sl = bySeller.get(s.by) ?? blank(); sl.total += sTotal; sl.margin += sMargin; sl.units += sUnits; sl.n++; bySeller.set(s.by, sl);
    const ck = s.client ?? ""; const cl = byClient.get(ck) ?? blank(); cl.total += sTotal; cl.margin += sMargin; cl.units += sUnits; cl.n++; byClient.set(ck, cl);
    for (const p of s.payments) { const m = byMethod.get(p.method) ?? { amount: 0, n: 0 }; m.amount += p.amount; m.n++; byMethod.set(p.method, m); }
    const local = new Date(s.t - 5 * 3600_000);
    const ymd = local.toISOString().slice(0, 10);
    const d = byDay.get(ymd) ?? { total: 0, n: 0 }; d.total += sTotal; d.n++; byDay.set(ymd, d);
    const wd = (local.getUTCDay() + 6) % 7; byWeekday[wd].total += sTotal; byWeekday[wd].n++;
    const h = local.getUTCHours(); byHour[h].total += sTotal; byHour[h].n++;
  }
  const sortBy = <T extends { total: number }>(m: Map<string, T>) => [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  return { total, margin, units, count, discount, surcharge, pending, ticket: count ? total / count : 0, byCat: sortBy(byCat), byProduct: sortBy(byProduct), bySeller: sortBy(bySeller), byClient: sortBy(byClient), byMethod: [...byMethod.entries()].sort((a, b) => b[1].amount - a[1].amount), byDay, byWeekday, byHour };
}

export async function advancedReport(db: Db, f: ReportFilters, now = Date.now()) {
  const from = dayRange(f.desde).from, to = dayRange(f.hasta).from + DAY;
  const span = to - from;
  const [ss, its, cl, us] = await Promise.all([db.select().from(sales), db.select().from(items), db.select({ id: clients.id, name: clients.name }).from(clients), db.select({ id: users.id, name: users.name }).from(users)]);
  const itemCat = new Map(its.map((i) => [i.id, i.cat]));
  const cur = aggregate(ss.filter((s) => s.t >= from && s.t < to), f, itemCat);
  const prev = aggregate(ss.filter((s) => s.t >= from - span && s.t < from), f, itemCat);
  // Serie diaria completa (días sin ventas = 0); si el rango es largo se agrupa por mes.
  const days: { key: string; label: string; total: number; n: number; from: string; to: string }[] = [];
  const ndays = Math.round(span / DAY);
  if (ndays <= 62) {
    for (let i = 0; i < ndays; i++) { const ymd = new Date(from + i * DAY - 5 * 3600_000).toISOString().slice(0, 10); const v = cur.byDay.get(ymd); days.push({ key: ymd, label: ymd.slice(8), total: v?.total ?? 0, n: v?.n ?? 0, from: ymd, to: ymd }); }
  } else {
    const months = new Map<string, { total: number; n: number }>();
    for (const [ymd, v] of cur.byDay) { const m = ymd.slice(0, 7); const e = months.get(m) ?? { total: 0, n: 0 }; e.total += v.total; e.n += v.n; months.set(m, e); }
    for (const [m, v] of [...months.entries()].sort()) days.push({ key: m, label: m.slice(5) + "/" + m.slice(2, 4), total: v.total, n: v.n, from: m + "-01", to: new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).toISOString().slice(0, 10) });
  }
  // Inventario (foto de hoy): capital por categoría y antigüedad de lo que está en vitrina.
  const stock = its.filter(inStock);
  const capByCat = new Map<string, { units: number; cost: number; price: number }>();
  for (const it of stock) { const q = stockQty(it); const e = capByCat.get(it.cat) ?? { units: 0, cost: 0, price: 0 }; e.units += q; e.cost += (it.cost + (it.repairs || 0) / Math.max(1, q)) * q; e.price += it.price * q; capByCat.set(it.cat, e); }
  const aging = [["0-30", 0, 30], ["31-60", 31, 60], ["61-90", 61, 90], ["91+", 91, 99999]].map(([label, a, b]) => {
    const g = stock.filter((it) => !isQty(it) && it.status === "En vitrina" && daysIn(it, now) >= (a as number) && daysIn(it, now) <= (b as number));
    return { label: label as string, count: g.length, cost: g.reduce((x, it) => x + it.cost + (it.repairs || 0), 0) };
  });
  const slow = stock.filter((it) => !isQty(it) && it.status === "En vitrina").map((it) => ({ id: it.id, name: uname(it), days: daysIn(it, now), cost: it.cost + (it.repairs || 0), price: it.price })).sort((a, b) => b.days - a.days).slice(0, 10);
  // Antes de que se vendan: capital en cartera por cobrar.
  const owing = ss.filter((s) => !saleVoid(s) && s.pending > 0).reduce((a, s) => a + s.pending, 0);
  return { f, from, to, ndays, cur, prev, days, clientName: new Map(cl.map((c) => [c.id, c.name])), userName: new Map(us.map((u) => [u.id, u.name])), capByCat: [...capByCat.entries()].sort((a, b) => b[1].cost - a[1].cost), aging, slow, owing, stockUnits: stock.reduce((a, it) => a + stockQty(it), 0) };
}
