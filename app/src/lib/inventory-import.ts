import { norm, parseDate, parseNum } from "./csv";
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
  { key: "price", label: "Precio de venta", hint: "Si el archivo no lo trae, se calcula desde el costo con el margen que elijas abajo", syn: ["precio", "precio venta", "pvp", "valor venta", "price", "precio publico", "valor", "precio de venta"] },
  { key: "warr", label: "Garantía (meses)", syn: ["garantia", "meses garantia", "garantia meses", "warranty"] },
  { key: "batt", label: "Batería (%)", syn: ["bateria", "salud bateria", "battery", "condicion bateria", "% bateria"] },
  { key: "min", label: "Stock mínimo", syn: ["minimo", "stock minimo", "min"] },
  { key: "acq", label: "Fecha de ingreso", hint: "Para saber cuántos días lleva en vitrina", syn: ["fecha", "fecha ingreso", "fecha compra", "ingreso", "fecha de ingreso", "fecha entrada"] },
  { key: "notes", label: "Notas / lote / origen", syn: ["notas", "observaciones", "comentarios", "nota", "lote", "origen", "proveedor"] },
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
  qty: number; cost: number; price: number; warr: number; batt: number | null; min: number; notes: string; acq: number | null;
};

export type BuildOpts = {
  warr: Record<string, number>;
  /** Número de fila (en el archivo) del primer elemento de `rows`, para los mensajes. */
  firstRow?: number;
  /** Condición cuando el archivo no la trae. */
  defaultCond?: string;
  /** Si no hay precio de venta: costo + este % (redondeado a 10.000). null = dejarlo sin precio. */
  markup?: number | null;
};

const SMALL = new Set(["de", "del", "la", "el", "y", "con", "sin"]);
/** «IPHONE 12 PRO MAX » → «iPhone 12 Pro Max»; respeta lo que ya viene en mayúsculas/minúsculas mezcladas. */
export function prettyName(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(" ").map((w, i) => {
    if (/^(iphone|ipad|imac|macbook|airpods)$/.test(w)) return { iphone: "iPhone", ipad: "iPad", imac: "iMac", macbook: "MacBook", airpods: "AirPods" }[w]!;
    if (/^(se|sim|esim|usb|gb|tb|xr|xs|m\d)$/.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}
/** «128» → «128 GB»; «1TB» → «1 TB». */
export const prettySpec = (raw: string) => {
  const t = raw.trim();
  const m = t.match(/^(\d+)\s*(gb|tb)?$/i);
  if (!m) return t;
  return `${m[1]} ${m[2] ? m[2].toUpperCase() : +m[1] <= 2 ? "TB" : "GB"}`;
};
const title = (raw: string) => { const t = raw.trim(); return t && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };

/** Convierte las filas del archivo en productos y reporta las filas que no se pueden importar. */
export function buildItems(rows: string[][], map: InvMapping, opts: BuildOpts) {
  const get = (r: string[], k: InvKey) => (map[k] === undefined ? "" : (r[map[k]!] ?? "").trim());
  const issues: { row: number; msg: string }[] = [];
  const items: ImportItem[] = [];
  const seen = new Set<string>();
  const first = opts.firstRow ?? 2;
  rows.forEach((r, i) => {
    const row = first + i;
    if (!r.some((c) => c && c.trim())) return; // fila vacía: se ignora
    const name = prettyName(get(r, "name"));
    if (!name) return issues.push({ row, msg: "Sin nombre de producto" });
    const cat = inferCat(get(r, "cat"), name);
    const unit = cat !== "Accesorios" && cat !== "AirPods";
    let serial = get(r, "serial").replace(/\s+/g, "");
    if (cat === "iPhone") {
      serial = serial.replace(/\D/g, "");
      if (!serial) return issues.push({ row, msg: "iPhone sin IMEI" });
      if (serial.length !== 15 || !luhnOk(serial)) return issues.push({ row, msg: `IMEI no válido: «${get(r, "serial")}» (${serial.length} dígitos)` });
    }
    if (serial) {
      if (seen.has(serial)) return issues.push({ row, msg: `IMEI/serial repetido en el archivo: ${serial}` });
      seen.add(serial);
    }
    const notes: string[] = [];
    const costRaw = get(r, "cost");
    let cost = costRaw ? parseNum(costRaw.replace(/'/g, ".")) : 0;
    // Texto en la columna de costo (p. ej. «GARANTIA»): se importa sin costo y se deja anotado.
    if (Number.isNaN(cost) || cost < 0) { notes.push(`Costo en el archivo: «${costRaw}»`); cost = 0; }
    // «4'200» o «4.200» en una columna de millones: se lee como miles de pesos.
    if (cost > 0 && cost < 20_000) { notes.push(`Costo en el archivo: «${costRaw}» (se tomó como ${Math.round(cost * 1000).toLocaleString("es-CO")})`); cost *= 1000; }
    const priceRaw = get(r, "price");
    let price = priceRaw ? parseNum(priceRaw) : NaN;
    if (!(price > 0)) {
      if (priceRaw) return issues.push({ row, msg: `Precio de venta no válido: «${priceRaw}»` });
      price = opts.markup != null && cost > 0 ? Math.ceil((cost * (1 + opts.markup / 100)) / 10_000) * 10_000 : 0;
    }
    const qRaw = get(r, "qty");
    const n = qRaw ? Math.round(parseNum(qRaw)) : 1;
    if (unit && serial && n > 1) return issues.push({ row, msg: `Un equipo con IMEI/serial es una sola unidad (dice ${n})` });
    // Equipos sin serial con cantidad > 1: se crea una unidad por cada uno (cada equipo se controla aparte).
    const copies = unit && !serial && n > 1 ? n : 1;
    const qty = unit || serial ? 1 : n;
    if (!(n > 0)) return issues.push({ row, msg: qRaw && parseNum(qRaw) === 0 ? "Cantidad en 0 (sin existencias): no se importa" : `Cantidad no válida: «${qRaw}»` });
    const b = parseNum(get(r, "batt").replace("%", ""));
    const batt = Number.isNaN(b) ? null : Math.max(0, Math.min(100, Math.round(b <= 1 ? b * 100 : b)));
    const cond = normCond(get(r, "cond")) || opts.defaultCond || "Nuevo";
    const w = parseNum(get(r, "warr"));
    const m = parseNum(get(r, "min"));
    const acqRaw = get(r, "acq");
    const acqT = acqRaw ? parseDate(acqRaw, /^\d{4}-/.test(acqRaw) ? "ymd" : "dmy") : NaN;
    if (acqRaw && Number.isNaN(acqT)) notes.push(`Ingreso: ${acqRaw}`);
    const extra = get(r, "notes");
    if (extra) notes.unshift(/^\d+$/.test(extra) ? `Lote ${extra}` : title(extra));
    for (let c = 0; c < copies; c++) items.push({
      key: serial ? "s:" + serial : `r:${row}${copies > 1 ? "." + (c + 1) : ""}`, cat, name, spec: prettySpec(get(r, "spec")), color: title(get(r, "color")), cond, serial,
      qty, cost: Math.round(cost), price: Math.round(price), warr: Number.isNaN(w) ? (opts.warr[cond] ?? 0) : Math.max(0, Math.min(60, Math.round(w))),
      batt, min: Number.isNaN(m) ? (unit ? 0 : 3) : Math.max(0, Math.round(m)), notes: notes.join(" · "),
      acq: Number.isNaN(acqT) || acqT > Date.now() + 86_400_000 ? null : acqT,
    });
  });
  return { items, issues };
}

const COLORS = /^(negro|blanco|azul|rojo|verde|rosado|rosa|morado|lila|amarillo|dorado|oro|plata|plateado|gris|grafito|natural|titanio.*|desierto|medianoche|blanco estelar|estelar|purpura|purple|black|white|blue|red|green|pink|gold|silver|gray|graphite|midnight|starlight|azil)$/i;

/**
 * ¿La primera fila es de encabezados? Si ningún texto de la primera fila se parece a un nombre de columna conocido
 * y hay celdas con números o IMEI, se asume que el archivo empieza directo con datos.
 */
export function hasHeaderRow(rows: string[][]) {
  const r0 = rows[0] ?? [];
  const known = Object.keys(guessInvMapping(r0)).length;
  const looksData = r0.some((c) => /^\d{8,}$/.test(c.replace(/\s/g, "")) || /iphone|ipad|airpods|macbook/i.test(c));
  return known >= 2 || !looksData;
}

/** Sin encabezados: propone cada columna mirando su contenido (IMEI, modelo, capacidad, color, batería, valores, fechas). */
export function guessByContent(rows: string[][]): InvMapping {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const sample = rows.slice(0, 80);
  const share = (j: number, test: (v: string) => boolean) => {
    const vals = sample.map((r) => (r[j] ?? "").trim()).filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const map: InvMapping = {};
  const take = (k: InvKey, test: (v: string) => boolean, min = 0.6) => {
    let best = -1, score = min;
    for (let j = 0; j < width; j++) {
      if (Object.values(map).includes(j)) continue;
      const sc = share(j, test);
      if (sc >= score) { score = sc; best = j; }
    }
    if (best >= 0) map[k] = best;
  };
  take("serial", (v) => /^\d{14,16}$/.test(v.replace(/\s/g, "")) || /^[A-Z0-9]{10,12}$/.test(v));
  take("name", (v) => /iphone|ipad|airpods|macbook|imac|watch|cargador|cable|forro|funda|vidrio/i.test(v));
  take("acq", (v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(v), 0.5);
  take("spec", (v) => /^(32|64|128|256|512|1|2)\s*(gb|tb)?$/i.test(v.trim()));
  take("color", (v) => COLORS.test(v.trim()), 0.5);
  take("batt", (v) => /^\d{2,3}%?$/.test(v) && +v.replace("%", "") >= 40 && +v.replace("%", "") <= 100, 0.6);
  take("cost", (v) => { const n = parseNum(v.replace(/'/g, ".")); return n >= 50_000 || (n > 0 && /'/.test(v)); }, 0.4);
  take("notes", (v) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,}$|^\d{3,6}$/.test(v), 0.4);
  return map;
}
