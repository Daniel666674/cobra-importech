import { z } from "zod";

/** Revisión del equipo al recibirlo (ingreso, retoma o diagnóstico): lo que funciona y lo que no. */
export const CHECKS: { key: string; label: string; cats: string[] }[] = [
  { key: "pantalla", label: "Pantalla (sin rayas, manchas ni píxeles muertos)", cats: ["iPhone", "iPad", "Mac", "Apple Watch"] },
  { key: "tactil", label: "Táctil", cats: ["iPhone", "iPad", "Apple Watch"] },
  { key: "faceid", label: "Face ID / Touch ID", cats: ["iPhone", "iPad", "Mac"] },
  { key: "camara_trasera", label: "Cámara trasera y flash", cats: ["iPhone", "iPad"] },
  { key: "camara_frontal", label: "Cámara frontal", cats: ["iPhone", "iPad", "Mac"] },
  { key: "altavoz", label: "Altavoz y auricular", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
  { key: "microfono", label: "Micrófono", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
  { key: "botones", label: "Botones y vibración", cats: ["iPhone", "iPad", "Apple Watch"] },
  { key: "carga", label: "Carga (puerto o inalámbrica)", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
  { key: "conectividad", label: "Wi-Fi, Bluetooth y señal", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
  { key: "sim", label: "Lector de SIM", cats: ["iPhone", "iPad"] },
  { key: "humedad", label: "Sin indicios de humedad", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
  { key: "marco", label: "Carcasa y marco sin golpes", cats: ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods"] },
];
export const checksFor = (cat: string) => CHECKS.filter((c) => c.cats.includes(cat));

export const inspectionSchema = z.object({
  checks: z.record(z.string(), z.enum(["ok", "falla"])).default({}),
  icloud: z.enum(["", "libre", "bloqueado"]).default(""),
  carrier: z.enum(["", "libre", "bloqueado"]).default(""),
  region: z.string().trim().max(20).default(""),
  appleWarrEnd: z.coerce.number().int().nullable().default(null),
  originalParts: z.enum(["", "si", "no"]).default(""),
  notes: z.string().trim().max(500).default(""),
});
export type InspectionInput = z.infer<typeof inspectionSchema>;
export const blankInspection = (): InspectionInput => ({ checks: {}, icloud: "", carrier: "", region: "", appleWarrEnd: null, originalParts: "", notes: "" });

export const DOC_TYPES = ["CC", "CE", "Pasaporte", "NIT", "TI"] as const;
export const sellerSchema = z.object({
  name: z.string().trim().max(120).default(""),
  docType: z.enum(DOC_TYPES).default("CC"),
  doc: z.string().trim().max(30).default(""),
  phone: z.string().trim().max(30).default(""),
  address: z.string().trim().max(200).default(""),
  /** Declaración de que es el dueño legítimo del equipo. */
  declared: z.boolean().default(false),
  /** Se recibió copia del documento de identidad. */
  idCopy: z.boolean().default(false),
});
export type SellerInput = z.infer<typeof sellerSchema>;

/** Resumen corto para el historial: cuántas fallas y qué bloqueos tiene. */
export function inspectionSummary(i: { checks: Record<string, string>; icloud: string; carrier: string }) {
  const fails = Object.entries(i.checks).filter(([, v]) => v === "falla").map(([k]) => CHECKS.find((c) => c.key === k)?.label.split(" (")[0] ?? k);
  const parts = [fails.length ? `Fallas: ${fails.join(", ")}` : "Sin fallas anotadas"];
  if (i.icloud) parts.push(`iCloud ${i.icloud}`);
  if (i.carrier) parts.push(`Operador ${i.carrier}`);
  return parts.join(" · ");
}
