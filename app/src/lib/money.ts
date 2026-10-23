/** Tope de un valor en pesos (la base de datos guarda enteros hasta ~2.147 millones). */
export const MAX_COP = 2_000_000_000;

/**
 * Pesos colombianos escritos a mano → número entero. Acepta «1.500.000», «$ 1,500,000», «1500000» y quita los
 * centavos si vienen («1.500.000,50» → 1500000; antes se leía como 150.000.050). Vacío o sin dígitos → NaN.
 */
export function parseCop(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : NaN;
  if (typeof v !== "string") return NaN;
  let s = v.trim().replace(/[$\s]|COP|cop/g, "");
  const neg = s.startsWith("-");
  // Centavos: una coma o un punto seguido de 1 o 2 dígitos al final (los miles siempre llevan 3).
  s = s.replace(/[.,]\d{1,2}$/, "");
  const d = s.replace(/\D/g, "");
  if (!d) return NaN;
  return (neg ? -1 : 1) * Number(d);
}

/** Para mostrar mientras se escribe: 1500000 → «1.500.000». */
export const fmtCopInput = (n: number | string) => {
  const d = String(n).replace(/\D/g, "");
  return d ? Number(d).toLocaleString("es-CO") : "";
};
