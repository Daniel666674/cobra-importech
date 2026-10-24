import { createHmac, timingSafeEqual } from "node:crypto";

/** Misma llave de sesión; si falta en desarrollo se usa la de prueba (igual que server/auth.ts). */
const key = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-change-me-please-32chars");

/** Firma corta e imposible de adivinar para abrir el comprobante de una venta sin iniciar sesión. */
export function receiptSig(saleId: string) {
  const k = key();
  if (!k) throw new Error("Falta la variable AUTH_SECRET.");
  return createHmac("sha256", k).update(`comprobante:${saleId}`).digest("base64url").slice(0, 22);
}

export function receiptSigOk(saleId: string, sig: string) {
  const a = Buffer.from(receiptSig(saleId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const receiptPath = (saleId: string) => `/comprobante/${saleId}/${receiptSig(saleId)}`;
