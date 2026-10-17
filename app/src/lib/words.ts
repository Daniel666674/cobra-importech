/** Valor en letras para pesos colombianos (comprobantes). */
const UN = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
const DE = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CE = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function w999(n: number): string {
  if (!n) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = c ? CE[c] + (r ? " " : "") : "";
  if (r < 30) s += UN[r];
  else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    s += DE[d] + (u ? " Y " + UN[u] : "");
  }
  return s;
}

export function numWords(input: number): string {
  const n = Math.round(Math.abs(input));
  if (n === 0) return "CERO";
  if (n >= 1e9) return String(n);
  const mill = Math.floor(n / 1e6);
  const mil = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1e3;
  let s = "";
  if (mill) {
    s += mill === 1 ? "UN MILLÓN" : w999(mill).replace(/UNO$/, "UN") + " MILLONES";
    if (n % 1e6) s += " ";
  }
  if (mil) {
    s += mil === 1 ? "MIL" : w999(mil).replace(/UNO$/, "UN") + " MIL";
    if (rest) s += " ";
  }
  if (rest) s += w999(rest);
  return s.trim();
}

export const inWords = (n: number) => "SON: " + numWords(n) + " PESOS M/CTE";
