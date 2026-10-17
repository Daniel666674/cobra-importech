import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
} from "drizzle-orm/pg-core";

/** Marca de tiempo en milisegundos desde 1970 (igual que la demo). */
const ms = (name: string) => bigint(name, { mode: "number" });

export type Payment = { method: string; amount: number };
export type SaleLine = {
  item: string;
  name: string;
  color: string;
  cond: string;
  serial: string;
  qty: number;
  price: number;
  cost: number;
  warr: number;
  ret: number;
};
export type OfficialCheck = {
  r: "clean" | "reported" | "blocked" | "locked";
  by: string;
  name: string;
  t: number;
};
export type ImeiCheck = { crc: OfficialCheck; apple: OfficialCheck };
export type HoldPay = {
  t: number;
  amount: number;
  method: string;
  by: string;
  no: string;
};
export type Hold = {
  client: string;
  reminded?: boolean;
  discNote?: string;
  abono: number;
  expires: number;
  t: number;
  by: string;
  no: string;
  pays: HoldPay[];
};

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  legal: text("legal").notNull().default(""),
  nit: text("nit").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  footer: text("footer").notNull().default(""),
  brand: text("brand").notNull().default("#1F2937"),
  logo: text("logo").notNull().default(""),
  branch: text("branch").notNull().default("Tienda principal"),
  warr: jsonb("warr").$type<Record<string, number>>().notNull(),
  maxDisc: integer("max_disc").notNull().default(5),
  minMargin: integer("min_margin").notNull().default(12),
  trm: integer("trm").notNull().default(4000),
  agedDays: integer("aged_days").notNull().default(45),
  holdDays: integer("hold_days").notNull().default(5),
  apartadoMinPct: integer("apartado_min_pct").notNull().default(20),
});

export const roles = pgTable("roles", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  locked: boolean("locked").notNull().default(false),
  perms: jsonb("perms").$type<string[]>().notNull(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  role: text("role").notNull().references(() => roles.key),
  active: boolean("active").notNull().default(true),
  pinHash: text("pin_hash").notNull(),
  failed: integer("failed").notNull().default(0),
  lockedUntil: ms("locked_until").notNull().default(0),
  createdAt: ms("created_at").notNull(),
});

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  doc: text("doc").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull(),
  cat: text("cat").notNull(),
  name: text("name").notNull(),
  spec: text("spec").notNull().default(""),
  color: text("color").notNull().default(""),
  cond: text("cond").notNull().default("Nuevo"),
  serial: text("serial").notNull().default(""),
  qty: integer("qty").notNull().default(1),
  cost: integer("cost").notNull().default(0),
  price: integer("price").notNull().default(0),
  warr: integer("warr").notNull().default(12),
  branch: text("branch").notNull().default(""),
  status: text("status").notNull().default("En vitrina"),
  acq: ms("acq").notNull(),
  src: text("src").notNull().default(""),
  batt: integer("batt"),
  notes: text("notes").notNull().default(""),
  repairs: integer("repairs").notNull().default(0),
  min: integer("min").notNull().default(0),
  track: text("track").notNull().default("unit"),
  imeiCheck: jsonb("imei_check").$type<ImeiCheck | null>(),
  hold: jsonb("hold").$type<Hold | null>(),
});

export const itemEvents = pgTable("item_events", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  t: ms("t").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  tone: text("tone").notNull().default(""),
  by: text("by").notNull().default(""),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  no: text("no").notNull(),
  t: ms("t").notNull(),
  client: text("client"),
  by: text("by").notNull(),
  method: text("method").notNull().default(""),
  mode: text("mode").notNull().default("contado"),
  payments: jsonb("payments").$type<Payment[]>().notNull(),
  lines: jsonb("lines").$type<SaleLine[]>().notNull(),
  disc: integer("disc").notNull().default(0),
  total: integer("total").notNull(),
  prepaid: integer("prepaid").notNull().default(0),
  notes: text("notes").notNull().default(""),
  discReason: text("disc_reason").notNull().default(""),
  cash: jsonb("cash").$type<{ given: number; change: number } | null>(),
  holdPays: jsonb("hold_pays").$type<{ t: number; amount: number; method: string; no: string }[] | null>(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  item: text("item"),
  job: text("job").notNull(),
  st: text("st").notNull(),
  cost: integer("cost").notNull().default(0),
  tech: text("tech").notNull().default(""),
  prev: text("prev").notNull().default("En vitrina"),
  t: ms("t").notNull(),
});

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  sup: text("sup").notNull(),
  desc: text("desc").notNull().default(""),
  qty: integer("qty").notNull(),
  usd: integer("usd").notNull(),
  trm: integer("trm").notNull(),
  /** % del valor FOB (puede tener decimales). */
  freight: real("freight").notNull().default(0),
  arancel: real("arancel").notNull().default(0),
  iva: integer("iva").notNull().default(19),
  st: text("st").notNull(),
  t: ms("t").notNull(),
});

export const claims = pgTable("claims", {
  id: text("id").primaryKey(),
  sale: text("sale").notNull(),
  line: integer("line").notNull().default(0),
  t: ms("t").notNull(),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("Abierto"),
  resolution: text("resolution").notNull().default(""),
});

export const feed = pgTable("feed", {
  id: serial("id").primaryKey(),
  t: ms("t").notNull(),
  type: text("type").notNull(),
  ic: text("ic").notNull().default(""),
  x: text("x").notNull(),
  by: text("by").notNull().default("Sistema"),
});

export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const autos = pgTable("autos", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
});

/** IMEI que una consulta oficial marcó como reportados: se bloquean solos en el futuro. */
export const imeiBlocklist = pgTable("imei_blocklist", {
  imei: text("imei").primaryKey(),
  reason: text("reason").notNull(),
  t: ms("t").notNull(),
  by: text("by").notNull().default(""),
});

export const holdHistory = pgTable("hold_history", {
  id: serial("id").primaryKey(),
  t: ms("t").notNull(),
  item: text("item").notNull(),
  client: text("client").notNull().default(""),
  abono: integer("abono").notNull().default(0),
  outcome: text("outcome").notNull(),
});
