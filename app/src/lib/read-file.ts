/** Lectura de archivos de Excel (.xlsx) o CSV en el navegador, como tabla de texto. */
import { parseCsv } from "./csv";

/** Lee el archivo como UTF-8 y, si trae caracteres dañados (típico de Excel en Windows), como Windows-1252. */
export async function readText(f: File) {
  const buf = await f.arrayBuffer();
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf;
}

/** Lee la primera hoja con datos de un Excel (.xlsx) y la deja como texto, igual que un CSV. */
export async function readExcel(f: File): Promise<string[][]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(f);
  const sheet = sheets.find((s) => s.data.some((r) => r.some((c) => c !== null && String(c).trim() !== ""))) ?? sheets[0];
  const two = (n: number) => String(n).padStart(2, "0");
  const cell = (c: unknown) => {
    if (c === null || c === undefined) return "";
    // Excel guarda fechas sin zona horaria: se leen como vienen (año-mes-día hora:minuto).
    if (c instanceof Date) return `${c.getUTCFullYear()}-${two(c.getUTCMonth() + 1)}-${two(c.getUTCDate())} ${two(c.getUTCHours())}:${two(c.getUTCMinutes())}`;
    return String(c).trim();
  };
  return (sheet?.data ?? []).map((r) => r.map(cell)).filter((r) => r.some(Boolean));
}

const isExcel = async (f: File) => /\.xlsx$/i.test(f.name) || new TextDecoder().decode(await f.slice(0, 2).arrayBuffer()) === "PK";


/** Lee un .xlsx o un CSV y devuelve las filas (la primera es el encabezado). Lanza un Error con un mensaje para la pantalla. */
export async function readTable(f: File): Promise<string[][]> {
  if (/\.xls$/i.test(f.name)) throw new Error("Ese es el formato antiguo de Excel (.xls). Ábrelo en Excel y guárdalo como .xlsx o como CSV.");
  try {
    return (await isExcel(f)) ? await readExcel(f) : parseCsv(await readText(f));
  } catch {
    throw new Error("No se pudo leer el archivo. Si es Excel, guárdalo como .xlsx o CSV e inténtalo de nuevo.");
  }
}
