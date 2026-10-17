/** Cotizador de retomas: valor de referencia × porcentaje por condición − descuentos por defectos. */
export const TRADEIN_RATE: Record<string, number> = { Nuevo: 0.85, Exhibición: 0.8, Reacondicionado: 0.68, "Pre-owned": 0.62, Usado: 0.5 };

export const DEDUCTIONS = [
  { key: "screen", label: "Pantalla rota o rayada", pct: 15 },
  { key: "camera", label: "Falla de cámara o Face ID", pct: 12 },
  { key: "body", label: "Golpes o rayones en el cuerpo", pct: 8 },
  { key: "battery", label: "Batería por debajo del 80%", pct: 6 },
  { key: "noacc", label: "Sin caja ni cargador", pct: 2 },
] as const;
export type DeductionKey = (typeof DEDUCTIONS)[number]["key"];

export function tradeQuote(input: { ref: number; cond: string; deductions: DeductionKey[]; batt?: number | null }) {
  const keys = new Set<DeductionKey>(input.deductions);
  if (input.batt != null && input.batt < 80) keys.add("battery");
  const rate = TRADEIN_RATE[input.cond] ?? 0.5;
  const dedPct = DEDUCTIONS.filter((d) => keys.has(d.key)).reduce((a, d) => a + d.pct, 0);
  const base = Math.round(input.ref * rate);
  const offer = Math.max(0, Math.round((base * (1 - dedPct / 100)) / 10000) * 10000);
  return { rate, dedPct, base, offer, applied: [...keys] };
}
