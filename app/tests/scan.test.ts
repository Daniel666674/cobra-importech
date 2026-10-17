import { describe, expect, it } from "vitest";
import { classifyCode, mergeRead, parseLabelText } from "@/lib/scan-parse";

describe("lector de etiquetas y pantallas", () => {
  it("tolera errores típicos del OCR en 'Número de serie'", () => expect(parseLabelText("NiUmero de serie F2LK9X8YQ4").serial).toBe("F2LK9X8YQ4"));
  it("pantalla Información en español", () => {
    const r = parseLabelText("Información Nombre del modelo iPhone 15 Pro Capacidad 256 GB Número de serie F2LK9X8YQ4 IMEI 35 733001 123456 4 Capacidad máxima 92% Natural Titanium Modelo A2848");
    expect(r).toMatchObject({ name: "iPhone 15 Pro", spec: "256 GB", serial: "F2LK9X8YQ4", batt: 92, color: "Titanio natural", modelno: "A2848" });
    expect(r.imei).toMatch(/^\d{15}$/);
  });
  it("pantalla en inglés", () => {
    const r = parseLabelText("About Model Name iPhone 16 Pro Max Capacity 512 GB Serial Number DX3ZH5Q6L1 IMEI 357330011234564 Battery Health Maximum Capacity 88 % Black Titanium");
    expect(r).toMatchObject({ name: "iPhone 16 Pro Max", spec: "512 GB", serial: "DX3ZH5Q6L1", batt: 88, color: "Titanio negro" });
  });
  it("etiqueta de caja", () => expect(parseLabelText("iPhone 17 Pro Max 256GB Cosmic Orange Model A3084 MFXX3LL/A")).toMatchObject({ name: "iPhone 17 Pro Max", color: "Titanio naranja", part: "MFXX3LL/A" }));
  it("modelos fuera del catálogo se conservan", () => expect(parseLabelText("Model Name iPhone 11 Pro Capacity 64 GB").name).toBe("iPhone 11 Pro"));
  it("texto sin datos no inventa nada", () => expect(parseLabelText("hola mundo sin datos 12345")).toEqual({}));
  it("clasifica códigos", () => {
    expect(classifyCode("SF2LK9X8YQ4").k).toBe("serial");
    expect(classifyCode("MFXX3LL/A").k).toBe("part");
    expect(classifyCode("A2848").k).toBe("modelno");
  });
  it("une lecturas de varias capturas sin pisar datos", () => {
    const m = mergeRead(mergeRead({}, { serial: "ABC123XYZ9", info: ["iOS 18.1"] }), { serial: "otro", batt: 91, info: ["412 ciclos de batería"] });
    expect(m).toEqual({ serial: "ABC123XYZ9", batt: 91, info: ["iOS 18.1", "412 ciclos de batería"] });
  });
});
