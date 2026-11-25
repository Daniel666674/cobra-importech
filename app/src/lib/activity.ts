/** Clasifica un movimiento del registro de actividad por módulo, según su ícono. */
const MOD: [string, string][] = [
  ["🧾✏️🔢📅", "Ventas"], ["↩️", "Devoluciones"], ["🔒💰", "Apartados"], ["🧮💵", "Caja"], ["💸🏦🤝💼", "Cartera"], ["🔄", "Retomas"],
  ["📦📈🏷️📥📚", "Inventario"], ["🕒✅", "Aprobaciones"], ["🔧🛠️🧑‍🔧", "Taller"], ["🛡️", "Garantías"], ["🛒", "Compras"],
  ["⚙️🔑🔐👤", "Configuración y accesos"], ["🚨⛔", "Alertas"], ["📧", "Correo"], ["⚠️", "Errores"], ["🗑️", "Eliminaciones"], ["👥", "Clientes"],
];
export const MODULES = [...new Set(MOD.map(([, m]) => m)), "Otros"];
export function moduleOf(ic: string): string {
  for (const [icons, m] of MOD) if ([...icons.matchAll(/\p{Extended_Pictographic}(‍\p{Extended_Pictographic})*️?/gu)].some((x) => x[0].replace(/️/g, "") === ic.replace(/️/g, ""))) return m;
  return "Otros";
}
/** Referencias (comprobantes, SKU, tickets…) que se pueden volver enlaces dentro de un texto. */
export const REF = /\b[A-Z]{1,4}-\d{3,8}\b/g;
export function refHref(ref: string, sales: Map<string, string>, skus: Map<string, string>): string | null {
  if (sales.has(ref)) return `/ventas/${sales.get(ref)}`;
  if (skus.has(ref)) return `/inventario/${skus.get(ref)}`;
  const p = ref.split("-")[0];
  if (p === "T") return "/taller";
  if (p === "L") return "/compras";
  if (p === "G") return "/garantias";
  if (p === "CE") return "/cartera";
  if (p === "RA" || p === "RB") return "/apartados";
  return null;
}
