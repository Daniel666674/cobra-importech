import { CATALOG } from "./catalog";

export function luhnOk(s: string): boolean {
  if (!/^\d{15}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = +s[14 - i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Modelo según el TAC (8 primeros dígitos). Solo conoce los modelos del catálogo. */
export function modelByTac(imei: string) {
  return CATALOG.find((m) => m.tac === imei.slice(0, 8)) ?? null;
}

export type StepState = "ok" | "warn" | "fail" | "skip";
export type Step = { label: string; state: StepState; detail: string };
export type Verdict = "clean" | "review" | "blocked";
export type ImeiFacts = {
  /** Equipo ya existente con el mismo IMEI (otro que no sea el que se re-verifica). */
  existing?: { id: string; name: string; status: string } | null;
  /** Motivo si el IMEI está en la lista interna de bloqueados. */
  blocked?: string | null;
};
export type ImeiResult = {
  steps: Step[];
  verdict: Verdict;
  modelName: string | null;
  reason: "invalid" | "dup" | "neg" | null;
};

const L = [
  "Formato del IMEI",
  "Modelo (TAC)",
  "Duplicado en tu inventario",
  "Lista interna de bloqueados",
];

/** Verificaciones automáticas. El hurto, iCloud y operador reales se confirman en la verificación oficial. */
export function checkImei(imei: string, facts: ImeiFacts = {}): ImeiResult {
  const steps: Step[] = [];
  const P = (label: string, state: StepState, detail: string) => steps.push({ label, state, detail });
  if (!luhnOk(imei)) {
    P(L[0], "fail", imei.length !== 15 ? `Debe tener 15 dígitos (${imei.length} ingresados)` : "El dígito verificador no coincide: IMEI inválido o mal digitado");
    for (let i = 1; i < L.length; i++) P(L[i], "skip", "No se ejecuta");
    return { steps, verdict: "blocked", modelName: null, reason: "invalid" };
  }
  let verdict: Verdict = "clean";
  let reason: ImeiResult["reason"] = null;
  P(L[0], "ok", "15 dígitos · dígito verificador correcto");
  const model = modelByTac(imei);
  if (model) P(L[1], "ok", "Identificado: " + model.name);
  else {
    P(L[1], "warn", `TAC ${imei.slice(0, 8)} no reconocido · selecciona el modelo manualmente`);
    verdict = "review";
  }
  if (facts.existing) {
    P(L[2], "fail", `Ya existe: ${facts.existing.name} · ${facts.existing.id} · estado ${facts.existing.status}`);
    verdict = "blocked";
    reason = "dup";
  } else P(L[2], "ok", "No está registrado en el inventario");
  if (facts.blocked) {
    P(L[3], "fail", facts.blocked);
    verdict = "blocked";
    reason = reason ?? "neg";
  } else P(L[3], "ok", "No está en la lista interna de bloqueados");
  return { steps, verdict, modelName: model?.name ?? null, reason };
}

export type OfficialSource = "crc" | "apple";
export type OfficialResult = "clean" | "reported" | "blocked" | "locked";
export const OFFICIAL_URL: Record<OfficialSource, string> = {
  crc: "https://www.imeicolombia.com.co/",
  apple: "https://www.icloud.com/activationlock",
};
export const OFFICIAL_LABEL: Record<OfficialSource, string> = {
  crc: "CRC · Base de datos negativa",
  apple: "Apple · Activation Lock",
};
export const OFFICIAL_TEXT: Record<OfficialResult, string> = {
  clean: "Limpio",
  reported: "Reportado (hurto/extravío)",
  blocked: "Bloqueado",
  locked: "Activation Lock activo",
};

export type OfficialInput = { crc?: OfficialResult; apple?: OfficialResult };
export type Gate = { canSave: boolean; needsOwner: boolean; message: string };

/**
 * Regla para guardar un equipo: sin resultado oficial no se guarda; si la CRC dice
 * reportado/bloqueado no se guarda; con Activation Lock o advertencias hace falta
 * la aprobación del propietario.
 */
export function officialGate(verdict: Verdict, o: OfficialInput): Gate {
  if (!o.crc || !o.apple)
    return { canSave: false, needsOwner: false, message: "Falta registrar el resultado de la verificación oficial (CRC y Apple)." };
  if (o.crc !== "clean" && o.crc !== "reported" && o.crc !== "blocked")
    return { canSave: false, needsOwner: false, message: "Resultado de CRC inválido." };
  if (o.crc !== "clean")
    return { canSave: false, needsOwner: false, message: `Resultado oficial: equipo ${OFFICIAL_TEXT[o.crc].toLowerCase()}. No se puede ingresar.` };
  if (o.apple !== "clean" && o.apple !== "locked")
    return { canSave: false, needsOwner: false, message: "Resultado de Apple inválido." };
  return { canSave: true, needsOwner: verdict === "review" || o.apple === "locked", message: "" };
}
