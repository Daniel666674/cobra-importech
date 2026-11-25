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

export type QuoteCfg = { rates?: Record<string, number>; deds?: { key: string; label: string; pct: number }[] };
/** Porcentajes y descuentos vigentes: los configurados por el negocio, o los de fábrica. */
export const rateTable = (c?: QuoteCfg): Record<string, number> => ({ ...TRADEIN_RATE, ...Object.fromEntries(Object.entries(c?.rates ?? {}).map(([k, v]) => [k, v / 100])) });
export const dedTable = (c?: QuoteCfg): { key: string; label: string; pct: number }[] => (c?.deds?.length ? c.deds : DEDUCTIONS.map((d) => ({ ...d })));

export function tradeQuote(input: { ref: number; cond: string; deductions: string[]; batt?: number | null; cfg?: QuoteCfg }) {
  const keys = new Set<string>(input.deductions);
  if (input.batt != null && input.batt < 80) keys.add("battery");
  const rate = rateTable(input.cfg)[input.cond] ?? 0.5;
  const dedPct = dedTable(input.cfg).filter((d) => keys.has(d.key)).reduce((a, d) => a + d.pct, 0);
  const base = Math.round(input.ref * rate);
  const offer = Math.max(0, Math.round((base * (1 - dedPct / 100)) / 10000) * 10000);
  return { rate, dedPct, base, offer, applied: [...keys] as string[] };
}
