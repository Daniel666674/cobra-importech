import { describe, expect, it } from "vitest";
import { inWords, numWords } from "@/lib/words";
import { luhnOk, officialGate, checkImei } from "@/lib/imei";
import { withCheck } from "@/lib/imei-test";
import { posTotals } from "@/lib/sales";
import { holdMin } from "@/lib/hold";
import { landed } from "@/lib/landed";
import { listPrice } from "@/lib/catalog";

describe("valor en letras", () => {
  it.each([[0, "CERO"], [1000, "MIL"], [1500000, "UN MILLÓN QUINIENTOS MIL"], [3999000, "TRES MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL"], [21000, "VEINTIUN MIL"], [100, "CIEN"]])("%s", (n, w) => expect(numWords(n)).toBe(w));
  it("formato", () => expect(inWords(179000)).toBe("SON: CIENTO SETENTA Y NUEVE MIL PESOS M/CTE"));
});
describe("IMEI", () => {
  it("Luhn", () => { expect(luhnOk(withCheck("35911001700001"))).toBe(true); expect(luhnOk("359110017000010")).toBe(false); });
  it("TAC desconocido pide revisión", () => expect(checkImei(withCheck("49015420323751")).verdict).toBe("review"));
  it("compuerta oficial", () => {
    expect(officialGate("clean", {}).canSave).toBe(false);
    expect(officialGate("clean", { crc: "clean", apple: "clean" })).toMatchObject({ canSave: true, needsOwner: false });
    expect(officialGate("clean", { crc: "reported", apple: "clean" }).canSave).toBe(false);
    expect(officialGate("clean", { crc: "clean", apple: "locked" })).toMatchObject({ canSave: true, needsOwner: true });
    expect(officialGate("review", { crc: "clean", apple: "clean" }).needsOwner).toBe(true);
  });
});
describe("ventas y costos", () => {
  it("totales con descuento y abonos", () => {
    const T = posTotals([{ price: 1000000, cost: 800000, qty: 2 }], { type: "pct", value: 10 }, 500000);
    expect(T).toMatchObject({ sub: 2000000, total: 1800000, discAmt: 200000, due: 1300000 });
    expect(posTotals([{ price: 1000, cost: 0, qty: 1 }], { type: "cop", value: 500 }).total).toBe(500);
  });
  it("abono mínimo", () => expect(holdMin(5899000, 20)).toBe(1180000));
  it("costo real de importación", () => expect(Math.round(landed({ usd: 820, qty: 12, trm: 4050, freight: 1.5, arancel: 0, iva: 19 }).unit)).toBe(Math.round(820 * 4050 * 1.015 * 1.19)));
  it("precio sugerido", () => expect(listPrice("iPhone 16", "128 GB", "Nuevo")).toBe(3100000));
});
