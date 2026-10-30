import type { Db } from "@/db";
import { claims, items, orders, sales, settings } from "@/db/schema";
import { DAY, daysAgo } from "@/lib/format";
import { holdBal, holdLeft } from "@/lib/hold";
import { daysIn, inStock, isQty, stockQty, uname } from "@/lib/items";
import { lineNet, saleCost, saleNet, saleVoid } from "@/lib/sales";

export type Alert = { key: string; level: "bad" | "warn" | "info"; title: string; detail: string; href: string };

export async function dashboard(db: Db, now = Date.now()) {
  const [[st], its, ss, cl] = await Promise.all([db.select().from(settings).limit(1), db.select().from(items), db.select().from(sales), db.select().from(claims)]);
  const stock = its.filter(inStock);
  const valid = ss.filter((s) => !saleVoid(s));
  const startDay = new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/Bogota" })).setHours(0, 0, 0, 0);
  const todayMs = now - (new Date(now).getTime() - startDay) % DAY; // aproximado, solo para el KPI del día
  const inRange = (t: number, days: number) => now - t <= days * DAY;
  const sum = (arr: typeof valid, f: (s: (typeof valid)[number]) => number) => arr.reduce((a, s) => a + f(s), 0);
  const month = valid.filter((s) => inRange(s.t, 30));
  const prev = valid.filter((s) => inRange(s.t, 60) && !inRange(s.t, 30));
  const today = valid.filter((s) => s.t >= todayMs);
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
    const from = now - (13 - i) * DAY;
    return { t: from, total: valid.filter((s) => daysAgo(s.t, now) === 13 - i).reduce((a, s) => a + saleNet(s), 0) };
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
  const ords = await db.select().from(orders);
  return {
    total: ss.reduce((a, s) => a + saleNet(s), 0), count: ss.length, margin: ss.reduce((a, s) => a + saleNet(s) - saleCost(s), 0),
    byCat: [...byCat.entries()].map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.total - a.total),
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    byUser: [...byUser.entries()],
    openOrders: ords.length,
  };
}
