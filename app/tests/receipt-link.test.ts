import { describe, expect, it } from "vitest";
import { receiptPath, receiptSig, receiptSigOk } from "@/server/receipt-link";

describe("enlace público del comprobante", () => {
  it("acepta solo la firma de esa venta", () => {
    const sig = receiptSig("s1");
    expect(receiptSigOk("s1", sig)).toBe(true);
    expect(receiptSigOk("s2", sig)).toBe(false);
    expect(receiptSigOk("s1", sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(receiptSigOk("s1", "")).toBe(false);
  });
  it("arma la ruta con id y firma", () => {
    expect(receiptPath("s1")).toBe(`/comprobante/s1/${receiptSig("s1")}`);
  });
});
