import { norm, parseNum } from "./csv";
import { CATS, type Cat } from "./catalog";
import { luhnOk } from "./imei";
import { normCond } from "./sales-import";

/** Campos del inventario a los que se puede asignar una columna del archivo. */
export const INV_FIELDS = [
  { key: "name", label: "Producto / modelo", required: true, syn: ["producto", "modelo", "descripcion", "nombre", "articulo", "referencia", "equipo", "item", "nombre producto", "product"] },
  { key: "cat", label: "Categoría", hint: "Si no está, se deduce del nombre (iPhone, iPad, Mac, Watch, AirPods; lo demás, Accesorios)", syn: ["categoria", "tipo", "linea", "familia", "category", "grupo"] },
  { key: "spec", label: "Capacidad / detalle", syn: ["capacidad", "almacenamiento", "memoria", "gb", "detalle", "especificacion", "storage"] },
  { key: "color", label: "Color", syn: ["color", "colour"] },
  { key: "cond", label: "Condición (nuevo, usado…)", syn: ["condicion", "estado", "estado equipo", "condition", "grado"] },
  { key: "serial", label: "IMEI / serial", syn: ["imei", "serial", "serie", "numero serie", "sn", "imei 1", "imei serial", "imei1"] },
  { key: "qty", label: "Cantidad", hint: "Solo para accesorios y AirPods; un equipo con IMEI o serie es siempre 1", syn: ["cantidad", "cant", "unidades", "stock", "existencias", "qty", "und", "inventario"] },
  { key: "cost", label: "Costo unitario", syn: ["costo", "costo unitario", "precio compra", "valor compra", "cost", "precio costo", "costo und"] },
  { key: "price", label: "Precio de venta", required: true, syn: ["precio", "precio venta", "pvp", "valor venta", "price", "precio publico", "valor", "precio de venta"] },
  { key: "warr", label: "Garantía (meses)", syn: ["garantia", "meses garantia", "garantia meses", "warranty"] },
  { key: "batt", label: "Batería (%)", syn: ["bateria", "salud bateria", "battery", "condicion bateria", "% bateria"] },
  { key: "min", label: "Stock mínimo", syn: ["minimo", "stock minimo", "min"] },
  { key: "notes", label: "Notas", syn: ["notas", "observaciones", "comentarios", "nota"] },
] as const;

export type InvKey = (typeof INV_FIELDS)[number]["key"];
export type InvMapping = Partial<Record<InvKey, number>>;

export function guessInvMapping(headers: string[]): InvMapping {
  const H = headers.map(norm);
  const used = new Set<number>();
  const map: InvMapping = {};
  for (const exact of [true, false]) {
    for (const f of INV_FIELDS) {
      if (map[f.key] !== undefined) continue;
      for (const s of f.syn) {
        const i = H.findIndex((h, j) => !used.has(j) && (exact ? h === s : h.split(" ").length <= 4 && ` ${h} `.includes(` ${s} `)));
        if (i >= 0) { map[f.key] = i; used.add(i); break; }
      }
    }
  }
  return map;
}

/** Categoría a partir de una columna o del nombre del producto. */
export function inferCat(cat: string, name: string): Cat {
  const c = norm(cat);
  const exact = CATS.find((x) => norm(x) === c);
  if (exact) return exact;
  const t = `${c} ${norm(name)}`;
  if (/iphone/.test(t)) return "iPhone";
  if (/ipad/.test(t)) return "iPad";
  if (/macbook|imac|mac mini|mac studio|\bmac\b/.test(t)) return "Mac";
  if (/watch|reloj/.test(t)) return "Apple Watch";
  if (/airpods/.test(t)) return "AirPods";
  return "Accesorios";
}

export type ImportItem = {
  key: string; cat: Cat; name: string; spec: string; color: string; cond: string; serial: string;
  qty: number; cost: number; price: number; warr: number; batt: number | null; min: number; notes: string;
};

/** Convierte las filas del archivo en productos y reporta las filas que no se pueden importar. */
export function buildItems(rows: string[][], map: InvMapping, opts: { warr: Record<string, number>; firstRow?: number }) {
  const get = (r: string[], k: InvKey) => (map[k] === undefined ? "" : (r[map[k]!] ?? "").trim());
  const issues: { row: number; msg: string }[] = [];
  const items: ImportItem[] = [];
  const seen = new Set<string>();
  const first = opts.firstRow ?? 2;
  rows.forEach((r, i) => {
    const row = first + i;
    const name = get(r, "name");
    if (!name) return issues.push({ row, msg: "Sin nombre de producto" });
    const cat = inferCat(get(r, "cat"), name);
    const unit = cat !== "Accesorios" && cat !== "AirPods";
    let serial = get(r, "serial").replace(/\s+/g, "");
    if (cat === "iPhone") {
      serial = serial.replace(/\D/g, "");
      if (!serial) return issues.push({ row, msg: "iPhone sin IMEI" });
      if (serial.length !== 15 || !luhnOk(serial)) return issues.push({ row, msg: `IMEI no válido: «${get(r, "serial")}»` });
    }
    if (serial) {
      if (seen.has(serial)) return issues.push({ row, msg: `IMEI/serial repetido en el archivo: ${serial}` });
      seen.add(serial);
    }
    const price = parseNum(get(r, "price"));
    if (!(price > 0)) return issues.push({ row, msg: `Precio de venta no válido: «${get(r, "price")}»` });
    const costRaw = get(r, "cost");
    const cost = costRaw ? parseNum(costRaw) : 0;
    if (Number.isNaN(cost) || cost < 0) return issues.push({ row, msg: `Costo no válido: «${costRaw}»` });
    const qRaw = get(r, "qty");
    const n = qRaw ? Math.round(parseNum(qRaw)) : 1;
    if (unit && serial && n > 1) return issues.push({ row, msg: `Un equipo con IMEI/serial es una sola unidad (dice ${n})` });
    // Equipos sin serial con cantidad > 1: se crea una unidad por cada uno (cada equipo se controla aparte).
    const copies = unit && !serial && n > 1 ? n : 1;
    const qty = unit || serial ? 1 : n;
    if (!(n > 0)) return issues.push({ row, msg: qRaw && parseNum(qRaw) === 0 ? "Cantidad en 0 (sin existencias): no se importa" : `Cantidad no válida: «${qRaw}»` });
    const cond = normCond(get(r, "cond")) || "Nuevo";
    const w = parseNum(get(r, "warr"));
    const b = parseNum(get(r, "batt").replace("%", ""));
    const m = parseNum(get(r, "min"));
    for (let c = 0; c < copies; c++) items.push({
      key: serial ? "s:" + serial : `r:${row}${copies > 1 ? "." + (c + 1) : ""}`, cat, name, spec: get(r, "spec"), color: get(r, "color"), cond, serial,
      qty, cost: Math.round(cost), price: Math.round(price), warr: Number.isNaN(w) ? (opts.warr[cond] ?? 0) : Math.max(0, Math.min(60, Math.round(w))),
      batt: Number.isNaN(b) ? null : Math.max(0, Math.min(100, Math.round(b))), min: Number.isNaN(m) ? (unit ? 0 : 3) : Math.max(0, Math.round(m)), notes: get(r, "notes"),
    });
  });
  return { items, issues };
}
