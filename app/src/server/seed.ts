import bcrypt from "bcryptjs";
import type { Db } from "@/db";
import * as s from "@/db/schema";
import demo from "@/data/demo-seed.json";
import { DEFAULT_ROLES } from "@/server/roles";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const seed = (demo as unknown as { seed: Json }).seed;

const TIME_KEYS = new Set(["t", "acq", "expires", "seedAt"]);
/** Mueve todas las fechas de la demo para que "hoy" sea hoy. */
function shift<T>(v: T, delta: number): T {
  if (Array.isArray(v)) return v.map((x) => shift(x, delta)) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, TIME_KEYS.has(k) && typeof x === "number" ? x + delta : shift(x, delta)]),
    ) as T;
  }
  return v;
}

export const DEMO_PINS: Record<string, string> = { u1: "1111", u2: "2222", u3: "3333" };

/** Carga datos de ejemplo (la demo estática convertida). Solo si la base está vacía. */
export async function seedDemo(db: Db, opts: { pins?: Record<string, string>; rounds?: number } = {}) {
  const existing = await db.select().from(s.settings).limit(1);
  if (existing.length) return false;
  const d = shift(seed, Date.now() - seed.seedAt);
  const pins = opts.pins ?? DEMO_PINS;
  const rounds = opts.rounds ?? 10;
  const st = d.settings;
  await db.transaction(async (tx) => {
    await tx.insert(s.settings).values({
      id: 1, name: st.name, legal: st.legal, nit: st.nit, address: st.address, phone: st.phone, email: st.email,
      footer: st.footer, brand: st.brand, logo: "", branch: st.branches[0], warr: st.warr, maxDisc: st.maxDisc,
      minMargin: st.minMargin, trm: st.trm, agedDays: st.agedDays, holdDays: st.holdDays, apartadoMinPct: st.apartadoMinPct,
    });
    await tx.insert(s.roles).values(Object.entries(DEFAULT_ROLES).map(([key, r]) => ({ key, name: r.name, locked: !!r.locked, perms: r.perms })));
    await tx.insert(s.users).values(
      await Promise.all(
        (d.users as Json[]).map(async (u) => ({
          id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
          pinHash: await bcrypt.hash(pins[u.id] ?? "0000", rounds), createdAt: d.seedAt,
        })),
      ),
    );
    await tx.insert(s.clients).values((d.clients as Json[]).map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, doc: c.doc, notes: c.notes ?? "" })));
    for (const it of d.items as Json[]) {
      await tx.insert(s.items).values({
        id: it.id, sku: it.sku, cat: it.cat, name: it.name, spec: it.spec, color: it.color, cond: it.cond, serial: it.serial,
        qty: it.qty, cost: it.cost, price: it.price, warr: it.warr, branch: it.branch, status: it.status, acq: it.acq, src: it.src,
        batt: it.batt ?? null, notes: it.notes ?? "", repairs: it.repairs ?? 0, min: it.min ?? 0, track: it.track, imeiCheck: null, hold: it.hold ?? null,
      });
      if (it.tl.length)
        await tx.insert(s.itemEvents).values(it.tl.map((e: Json) => ({ itemId: it.id, t: e.t, title: e.title, detail: e.detail ?? "", tone: e.tone ?? "", by: e.by ?? "" })));
    }
    if (d.sales.length)
      await tx.insert(s.sales).values(
        (d.sales as Json[]).map((x) => ({
          id: x.id, no: x.no, t: x.t, client: x.client ?? null, by: x.by, method: x.method ?? "", mode: x.mode, payments: x.payments,
          lines: x.lines, disc: x.disc ?? 0, total: x.total, prepaid: x.prepaid ?? 0, notes: x.notes ?? "",
        })),
      );
    if (d.orders.length) await tx.insert(s.orders).values((d.orders as Json[]).map((o) => ({ id: o.id, item: o.item ?? null, job: o.job, st: o.st, cost: o.cost, tech: o.tech, t: o.t })));
    if (d.purchases.length)
      await tx.insert(s.purchases).values(
        (d.purchases as Json[]).map((p) => ({ id: p.id, sup: p.sup, desc: p.desc, qty: p.qty, usd: p.usd, trm: p.trm, freight: p.freight, arancel: p.arancel, iva: p.iva, st: p.st, t: p.t })),
      );
    if (d.claims.length) await tx.insert(s.claims).values((d.claims as Json[]).map((c) => ({ id: c.id, sale: c.sale, line: c.line, t: c.t, note: c.note, status: c.status, resolution: c.resolution ?? "" })));
    if (d.feed.length)
      await tx.insert(s.feed).values((d.feed as Json[]).slice().reverse().map((f) => ({ t: f.t, type: f.type, ic: f.ic ?? "", x: f.x, by: f.by ?? "Sistema" })));
    const autoKeys = Object.keys(d.autos ?? {});
    if (autoKeys.length) await tx.insert(s.autos).values(autoKeys.map((key) => ({ key, enabled: !!d.autos[key] })));
    const holds = (d.items as Json[]).filter((i) => i.hold).map((i) => i.hold as Json);
    const maxNum = (rows: Json[], re: RegExp) => rows.reduce((a, r) => Math.max(a, +(re.exec(r.id)?.[1] ?? 0)), 0);
    const maxNo = (d.sales as Json[]).reduce((a, r) => Math.max(a, +(/(\d+)$/.exec(r.no)?.[1] ?? 0)), 1000);
    await tx.insert(s.counters).values([
      { key: "item", value: maxNum(d.items, /(\d+)$/) },
      { key: "sale", value: maxNum(d.sales, /(\d+)$/) },
      { key: "invoice", value: maxNo },
      { key: "client", value: maxNum(d.clients, /(\d+)$/) },
      { key: "order", value: maxNum(d.orders, /(\d+)$/) },
      { key: "po", value: maxNum(d.purchases, /(\d+)$/) },
      { key: "claim", value: maxNum(d.claims, /(\d+)$/) },
      { key: "user", value: 3 },
      { key: "hold", value: Math.max(900, ...holds.map((h) => +(/(\d+)$/.exec(h.no)?.[1] ?? 0))) },
      { key: "receipt", value: Math.max(910, ...holds.flatMap((h) => (h.pays as Json[]).map((p) => +(/(\d+)$/.exec(p.no)?.[1] ?? 0)))) },
    ]);
  });
  return true;
}
