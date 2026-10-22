import { norm, parseDate, parseNum, type DateOrder } from "./csv";

/** Campos del sistema a los que se puede asignar una columna del archivo. */
export const IMPORT_FIELDS = [
  { key: "no", label: "Número de factura / comprobante", hint: "Agrupa varias filas en una misma venta", syn: ["factura", "no factura", "numero factura", "comprobante", "consecutivo", "documento venta", "prefijo numero", "invoice", "nro", "numero", "folio", "recibo"] },
  { key: "date", label: "Fecha", required: true, syn: ["fecha", "fecha venta", "fecha factura", "fecha emision", "date", "dia", "fecha y hora"] },
  { key: "product", label: "Producto / descripción", required: true, syn: ["producto", "descripcion", "articulo", "item", "referencia", "detalle", "nombre producto", "modelo", "equipo", "product", "concepto"] },
  { key: "serial", label: "IMEI / serial", syn: ["imei", "serial", "serie", "numero serie", "sn", "imei serial", "imei 1"] },
  { key: "qty", label: "Cantidad", syn: ["cantidad", "cant", "unidades", "qty", "und"] },
  { key: "price", label: "Precio unitario", syn: ["precio", "precio unitario", "valor unitario", "vr unitario", "precio venta", "unit price", "pvp", "valor unit"] },
  { key: "lineTotal", label: "Total de la línea", syn: ["total linea", "subtotal", "valor total", "vr total", "importe", "valor", "total item", "total producto"] },
  { key: "total", label: "Total de la factura", hint: "Si es menor que la suma de las líneas, la diferencia se toma como descuento", syn: ["total", "total factura", "total venta", "neto", "total a pagar", "valor factura"] },
  { key: "cost", label: "Costo unitario", hint: "Sin costo, el margen de esas ventas no se puede calcular", syn: ["costo", "costo unitario", "cost", "precio compra", "valor compra"] },
  { key: "client", label: "Cliente (nombre)", syn: ["cliente", "nombre cliente", "razon social", "comprador", "tercero", "customer", "nombre"] },
  { key: "doc", label: "Cédula / NIT del cliente", syn: ["cedula", "nit", "documento", "identificacion", "cc", "nit cliente", "documento cliente", "id cliente"] },
  { key: "phone", label: "Teléfono del cliente", syn: ["telefono", "celular", "movil", "whatsapp", "tel", "phone"] },
  { key: "email", label: "Correo del cliente", syn: ["correo", "email", "e mail", "mail"] },
  { key: "method", label: "Forma de pago", syn: ["forma pago", "forma de pago", "metodo pago", "medio pago", "pago", "metodo", "payment"] },
  { key: "seller", label: "Vendedor", syn: ["vendedor", "asesor", "atendio", "usuario", "cajero", "seller"] },
  { key: "cond", label: "Condición (nuevo, usado…)", syn: ["condicion", "estado", "tipo", "estado equipo"] },
  { key: "color", label: "Color", syn: ["color"] },
  { key: "warr", label: "Garantía (meses)", syn: ["garantia", "meses garantia", "garantia meses", "warranty"] },
  { key: "notes", label: "Observaciones", syn: ["observaciones", "notas", "comentarios", "nota", "observacion"] },
] as const;

export type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, number>>;

/** Propone qué columna corresponde a cada campo comparando los encabezados con sinónimos. */
export function guessMapping(headers: string[]): Mapping {
  const H = headers.map(norm);
  const used = new Set<number>();
  const map: Mapping = {};
  // Primero coincidencias exactas, luego las que contienen la palabra; así «total» no se roba «total linea».
  for (const exact of [true, false]) {
    for (const f of IMPORT_FIELDS) {
      if (map[f.key] !== undefined) continue;
      for (const s of f.syn) {
        const i = H.findIndex((h, j) => !used.has(j) && (exact ? h === s : h.split(" ").length <= 4 && (` ${h} `).includes(` ${s} `)));
        if (i >= 0) { map[f.key] = i; used.add(i); break; }
      }
    }
  }
  return map;
}

const METHOD_SYN: [RegExp, string][] = [
  [/efectivo|contado|cash/i, "Efectivo"],
  [/nequi/i, "Nequi"],
  [/daviplata/i, "Daviplata"],
  [/bold|link|enlace/i, "Enlace Bold"],
  [/tarjeta|cr[eé]dito|d[eé]bito|dat[aá]fono|visa|master|\btc\b|\btd\b/i, "Tarjeta"],
  [/transf|consigna|pse|bancolombia|banco/i, "Transferencia"],
];
export const normMethod = (s: string) => (s ? METHOD_SYN.find(([r]) => r.test(s))?.[1] ?? s.trim() : "");

const COND_SYN: [RegExp, string][] = [
  [/exhib/i, "Exhibición"], [/reacond|refurb|cpo/i, "Reacondicionado"], [/pre.?own|seminuevo/i, "Pre-owned"], [/usad|used/i, "Usado"], [/nuev|new|sellad/i, "Nuevo"],
];
export const normCond = (s: string) => COND_SYN.find(([r]) => r.test(s))?.[1] ?? "";

export type ImportLine = { name: string; serial: string; qty: number; price: number; cost: number; warr: number; cond: string; color: string };
export type ImportSale = {
  key: string; no: string; t: number;
  client: { name: string; doc: string; phone: string; email: string } | null;
  seller: string; method: string; notes: string; total: number; lines: ImportLine[];
};
export type RowIssue = { row: number; msg: string };

/**
 * Convierte las filas del archivo en ventas. Las filas con el mismo número de factura forman una sola venta;
 * sin columna de factura, cada fila es una venta.
 */
export function buildSales(rows: string[][], map: Mapping, opts: { dateOrder: DateOrder; warr: Record<string, number>; firstRow?: number }) {
  const get = (r: string[], k: FieldKey) => (map[k] === undefined ? "" : (r[map[k]!] ?? "").trim());
  const issues: RowIssue[] = [];
  const groups = new Map<string, ImportSale>();
  const totals = new Map<string, number>();
  const first = opts.firstRow ?? 2;
  rows.forEach((r, i) => {
    const rowNo = first + i;
    if (!r.some((c) => c && c.trim())) return;
    const name = get(r, "product");
    const t = parseDate(get(r, "date"), opts.dateOrder);
    if (!name) return issues.push({ row: rowNo, msg: "Sin producto" });
    if (Number.isNaN(t)) return issues.push({ row: rowNo, msg: `Fecha no reconocida: «${get(r, "date")}»` });
    if (t > Date.now() + 86400000) return issues.push({ row: rowNo, msg: "La fecha está en el futuro" });
    const qRaw = get(r, "qty");
    const qty = qRaw ? Math.round(parseNum(qRaw)) : 1;
    if (!(qty > 0)) return issues.push({ row: rowNo, msg: `Cantidad no válida: «${qRaw}»` });
    let price = parseNum(get(r, "price"));
    const lt = parseNum(get(r, "lineTotal"));
    if (Number.isNaN(price) && !Number.isNaN(lt)) price = lt / qty;
    const ft = parseNum(get(r, "total"));
    const no = get(r, "no");
    // Sin precio de línea, una venta de una sola fila puede tomar el total de la factura.
    if (Number.isNaN(price) && !Number.isNaN(ft) && (!no || !groups.has(no))) price = ft / qty;
    if (Number.isNaN(price) || price < 0) return issues.push({ row: rowNo, msg: "Sin precio: asigna «Precio unitario», «Total de la línea» o «Total de la factura»" });
    const cost = parseNum(get(r, "cost"));
    const cond = normCond(get(r, "cond")) || "Nuevo";
    const w = parseNum(get(r, "warr"));
    const line: ImportLine = {
      name, serial: get(r, "serial").replace(/\s+/g, ""), qty, price: Math.round(price),
      cost: Number.isNaN(cost) ? 0 : Math.round(cost), warr: Number.isNaN(w) ? (opts.warr[cond] ?? 0) : Math.max(0, Math.round(w)),
      cond, color: get(r, "color"),
    };
    const key = no || `fila-${rowNo}`;
    let s = groups.get(key);
    if (!s) {
      const cname = get(r, "client"), doc = get(r, "doc"), phone = get(r, "phone"), email = get(r, "email");
      s = {
        key, no, t, seller: get(r, "seller"), method: normMethod(get(r, "method")), notes: get(r, "notes"), total: 0, lines: [],
        client: cname || doc || phone || email ? { name: cname || doc || phone || email, doc, phone: phone.replace(/[^\d+]/g, ""), email } : null,
      };
      groups.set(key, s);
    }
    s.lines.push(line);
    if (!Number.isNaN(ft) && ft >= 0) totals.set(key, ft);
  });
  const out = [...groups.values()];
  for (const s of out) {
    const sub = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
    const ft = totals.get(s.key);
    // El total de factura se repite en cada fila: si es menor que la suma, la diferencia es descuento.
    s.total = ft !== undefined && ft > 0 && ft <= sub ? Math.round(ft) : sub;
  }
  return { sales: out, issues };
}

/** Descuento en % (con decimales) que lleva del subtotal al total. */
export const impliedDisc = (s: Pick<ImportSale, "lines" | "total">) => {
  const sub = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
  return sub > 0 ? Math.max(0, (1 - s.total / sub) * 100) : 0;
};
