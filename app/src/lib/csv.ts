/** Lectura de CSV exportados de Excel, Siigo, Alegra, Loggro, etc. (separador , ; o tabulador). */

/** Detecta el separador mirando la primera línea (fuera de comillas). */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",", n = -1;
  for (const d of [",", ";", "\t", "|"]) {
    let c = 0, q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch === d) c++; }
    if (c > n) { n = c; best = d; }
  }
  return best;
}

/** Convierte el texto en filas; respeta comillas, comillas dobles y saltos de línea dentro de celdas. */
export function parseCsv(input: string, delim = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * Número en formato colombiano o internacional: «$ 1.250.000», «1,250,000.50», «1.250.000,50», «(5.000)».
 * Devuelve NaN si no se reconoce.
 */
export function parseNum(raw: string): number {
  let s = (raw ?? "").replace(/[\s$]|COP|USD/gi, "");
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // El último separador que aparece es el decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (dots > 1 || commas > 1) s = s.replace(/[.,]/g, "");
  else if (dots === 1 || commas === 1) {
    // Un solo separador: si le siguen exactamente 3 dígitos es de miles (los precios en COP no llevan centavos).
    const [, dec = ""] = s.split(/[.,]/);
    s = dec.length === 3 ? s.replace(/[.,]/, "") : s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return (neg ? -1 : 1) * Number(s);
}

export type DateOrder = "dmy" | "mdy" | "ymd";

/** Fecha (con hora opcional) a milisegundos, interpretada en hora de Colombia (UTC−5). NaN si no se reconoce. */
export function parseDate(raw: string, order: DateOrder = "dmy"): number {
  const s = (raw ?? "").trim();
  if (!s) return NaN;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Número de serie de Excel (días desde 1899-12-30).
    return Math.round((Number(s) - 25569) * 86400000) + 5 * 3600000;
  }
  const m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?)?/i);
  if (!m) return NaN;
  const [a, b, c] = [+m[1], +m[2], +m[3]];
  let y: number, mo: number, d: number;
  if (m[1].length === 4 || order === "ymd") [y, mo, d] = [a, b, c];
  else if (order === "mdy") [mo, d, y] = [a, b, c];
  else [d, mo, y] = [a, b, c];
  if (y < 100) y += 2000;
  let h = m[4] ? +m[4] : 12;
  const mi = m[5] ? +m[5] : 0;
  const sec = m[6] ? +m[6] : 0;
  if (m[7]) { const pm = /p/i.test(m[7]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return NaN;
  const t = Date.UTC(y, mo - 1, d, h + 5, mi, sec);
  const back = new Date(t - 5 * 3600000);
  if (back.getUTCDate() !== d) return NaN; // 31/02, etc.
  return t;
}

/** Adivina el orden de las fechas: si algún primer número pasa de 12 es día/mes; si el segundo, mes/día. */
export function guessDateOrder(samples: string[]): DateOrder {
  let dmy = 0, mdy = 0, ymd = 0;
  for (const s of samples) {
    const m = s.trim().match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/);
    if (!m) continue;
    if (m[1].length === 4) ymd++;
    else if (+m[1] > 12) dmy++;
    else if (+m[2] > 12) mdy++;
  }
  if (ymd && !dmy && !mdy) return "ymd";
  return mdy > dmy ? "mdy" : "dmy";
}

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
