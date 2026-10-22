import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clients, items, sales, settings } from "@/db/schema";
import { guessDateOrder, parseCsv, parseDate, parseNum } from "@/lib/csv";
import { buildSales, guessMapping, normMethod } from "@/lib/sales-import";
import { importSales, undoImport } from "@/server/import";
import { saveNumbering, saveSettings, saveWarranty } from "@/server/admin";
import { createSale } from "@/server/sales";
import type { Actor } from "@/server/core";
import type { Db } from "@/db";
import { freshDb } from "./helpers";

const dev: Actor = { id: "u1", name: "Dev", perms: [], locked: true };
const emp: Actor = { id: "u3", name: "Anderson", perms: ["sell", "reports"], locked: false };
const WARR = { Nuevo: 12, Exhibición: 9, Reacondicionado: 6, "Pre-owned": 3, Usado: 1 };

describe("lectura de CSV", () => {
  it("detecta ; y respeta comillas, comillas dobles y saltos de línea", () => {
    const rows = parseCsv('﻿Factura;Producto;Valor\r\nFV-1;"iPhone 15; 128 GB";"$ 3.500.000"\r\nFV-2;"Funda ""MagSafe""\nnegra";80.000\r\n\r\n');
    expect(rows).toEqual([["Factura", "Producto", "Valor"], ["FV-1", "iPhone 15; 128 GB", "$ 3.500.000"], ["FV-2", 'Funda "MagSafe"\nnegra', "80.000"]]);
  });
  it("entiende números en formato colombiano e internacional", () => {
    expect(parseNum("$ 1.250.000")).toBe(1250000);
    expect(parseNum("1.250.000,50")).toBe(1250000.5);
    expect(parseNum("1,250,000.50")).toBe(1250000.5);
    expect(parseNum("80.000")).toBe(80000);
    expect(parseNum("3500000")).toBe(3500000);
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("(5.000)")).toBe(-5000);
    expect(parseNum("abc")).toBeNaN();
    expect(parseNum("")).toBeNaN();
  });
  it("entiende fechas día/mes, mes/día, ISO, con hora y seriales de Excel", () => {
    const iso = (t: number) => new Date(t - 5 * 3600000).toISOString().slice(0, 16);
    expect(iso(parseDate("31/12/2025"))).toBe("2025-12-31T12:00");
    expect(iso(parseDate("05/03/2025 3:45 p.m."))).toBe("2025-03-05T15:45");
    expect(iso(parseDate("03/05/2025", "mdy"))).toBe("2025-03-05T12:00");
    expect(iso(parseDate("2025-03-05 09:10"))).toBe("2025-03-05T09:10");
    expect(iso(parseDate("45658"))).toBe("2025-01-01T00:00");
    expect(parseDate("31/02/2025")).toBeNaN();
    expect(parseDate("ayer")).toBeNaN();
    expect(guessDateOrder(["01/02/2025", "25/02/2025"])).toBe("dmy");
    expect(guessDateOrder(["02/25/2025"])).toBe("mdy");
  });
});

describe("mapeo de columnas", () => {
  it("reconoce encabezados comunes sin confundir total con total de línea", () => {
    const m = guessMapping(["No. Factura", "Fecha", "Cédula", "Nombre Cliente", "Descripción", "IMEI", "Cant", "Valor Unitario", "Total Línea", "Total", "Forma de Pago", "Vendedor"]);
    expect(m).toMatchObject({ no: 0, date: 1, doc: 2, client: 3, product: 4, serial: 5, qty: 6, price: 7, lineTotal: 8, total: 9, method: 10, seller: 11 });
  });
  it("la plantilla descargable se asigna sola, columna por columna", () => {
    const head = "Factura;Fecha;Cliente;Cédula;Teléfono;Correo;Producto;IMEI;Cantidad;Precio unitario;Costo unitario;Total factura;Forma de pago;Vendedor;Condición;Garantía meses;Observaciones";
    expect(guessMapping(parseCsv(head)[0])).toEqual({ no: 0, date: 1, client: 2, doc: 3, phone: 4, email: 5, product: 6, serial: 7, qty: 8, price: 9, cost: 10, total: 11, method: 12, seller: 13, cond: 14, warr: 15, notes: 16 });
    const src = readFileSync("src/app/(app)/config/import-sales.tsx", "utf8");
    expect(src).toContain(head);
  });
  it("normaliza formas de pago", () => {
    expect(normMethod("EFECTIVO")).toBe("Efectivo");
    expect(normMethod("Tarjeta crédito")).toBe("Tarjeta");
    expect(normMethod("Transferencia Bancolombia")).toBe("Transferencia");
    expect(normMethod("Bitcoin")).toBe("Bitcoin");
  });
  it("agrupa filas por factura, calcula descuentos y reporta filas malas", () => {
    const rows = parseCsv([
      "Factura,Fecha,Cliente,Cedula,Producto,IMEI,Cantidad,Precio,Total,Pago,Condicion",
      "A-10,02/01/2025,Juan Pérez,1010,iPhone 13,356000000000001,1,2.000.000,2.100.000,Efectivo,Usado",
      "A-10,02/01/2025,Juan Pérez,1010,Cargador,,2,100.000,2.100.000,Efectivo,Nuevo",
      "A-11,03/01/2025,,,AirPods Pro,,1,900.000,,Nequi,",
      ",fecha mala,,,iPad,,1,1,,,",
      "A-12,04/01/2025,,,,,1,1,,,",
    ].join("\n"));
    const m = guessMapping(rows[0]);
    const { sales: out, issues } = buildSales(rows.slice(1), m, { dateOrder: "dmy", warr: WARR });
    expect(out).toHaveLength(2);
    const a10 = out.find((s) => s.no === "A-10")!;
    expect(a10.lines).toHaveLength(2);
    expect(a10.total).toBe(2_100_000); // 2.200.000 en productos menos 100.000 de descuento
    expect(a10.client).toMatchObject({ name: "Juan Pérez", doc: "1010" });
    expect(a10.lines[0]).toMatchObject({ serial: "356000000000001", cond: "Usado", warr: 1 });
    expect(a10.lines[1]).toMatchObject({ qty: 2, price: 100_000, warr: 12 });
    expect(out.find((s) => s.no === "A-11")).toMatchObject({ total: 900_000, client: null, method: "Nequi" });
    expect(issues.map((i) => i.row)).toEqual([5, 6]);
  });
  it("sin precio unitario usa el total de la línea o el de la factura", () => {
    const rows = [["F1", "01/01/2025", "Mac", "2", "", "8.000.000"], ["F2", "01/01/2025", "iPad", "1", "", ""]];
    const map = { no: 0, date: 1, product: 2, qty: 3, lineTotal: 4, total: 5 } as const;
    const { sales: out, issues } = buildSales(rows, map, { dateOrder: "dmy", warr: WARR });
    expect(out[0].lines[0].price).toBe(4_000_000);
    expect(issues).toHaveLength(1);
  });
});

describe("importación al sistema", () => {
  let db: Db;
  beforeAll(async () => { db = await freshDb(); });
  const batch = () => {
    const rows = parseCsv([
      "Factura;Fecha;Cliente;Cédula;Teléfono;Producto;IMEI;Cant;Precio;Costo;Vendedor;Pago",
      "OLD-1;10/06/2024;Laura Ríos;55555;300 111 2233;iPhone 12;350000000000011;1;1.800.000;1.500.000;Angelica;Transferencia",
      "OLD-2;11/06/2024;Laura Ríos;55555;;Funda;;1;50.000;20.000;Pedro;Efectivo",
      "OLD-3;12/06/2024;Carlos;;;Apple Watch SE;;1;1.100.000;;;Tarjeta",
    ].join("\n"));
    return buildSales(rows.slice(1), guessMapping(rows[0]), { dateOrder: "dmy", warr: WARR }).sales;
  };

  it("crea las ventas sin tocar el inventario, une clientes y vendedores", async () => {
    const before = (await db.select().from(items)).map((i) => [i.id, i.status, i.qty]);
    const r = await importSales(db, dev, { source: "ventas-2024.csv", sales: batch() });
    expect(r).toMatchObject({ created: 3, skipped: 0, newClients: 2, amount: 2_950_000 });
    expect((await db.select().from(items)).map((i) => [i.id, i.status, i.qty])).toEqual(before);
    const s1 = (await db.select().from(sales).where(eq(sales.no, "OLD-1")))[0];
    expect(s1).toMatchObject({ mode: "historico", source: "ventas-2024.csv", total: 1_800_000, by: "u2", method: "Transferencia" });
    expect(s1.lines[0]).toMatchObject({ item: "", serial: "350000000000011", cost: 1_500_000, warr: 12 });
    const s2 = (await db.select().from(sales).where(eq(sales.no, "OLD-2")))[0];
    expect(s2.client).toBe(s1.client);
    expect(s2.by).toBe("");
    expect(s2.notes).toContain("Vendedor: Pedro");
    const [laura] = await db.select().from(clients).where(eq(clients.id, s1.client!));
    expect(laura).toMatchObject({ name: "Laura Ríos", doc: "55555" });
  });
  it("volver a subir el mismo archivo no duplica", async () => {
    const r = await importSales(db, dev, { source: "ventas-2024.csv", sales: batch() });
    expect(r).toMatchObject({ created: 0, skipped: 3 });
  });
  it("un número que ya existe en el sistema se renombra y se anota", async () => {
    const [existing] = await db.select().from(sales).limit(1);
    const s = { ...batch()[0], key: "x", no: existing.no, lines: [{ ...batch()[0].lines[0], serial: "" }] };
    await importSales(db, dev, { source: "otro.csv", sales: [s] });
    const [row] = await db.select().from(sales).where(eq(sales.source, "otro.csv"));
    expect(row.no).toMatch(/^H-/);
    expect(row.notes).toContain(`Número original: ${existing.no}`);
  });
  it("exige permisos de configuración y reportes", async () => {
    await expect(importSales(db, emp, { source: "x.csv", sales: batch() })).rejects.toThrow(/permiso/);
  });
  it("rechaza datos fuera de rango", async () => {
    const bad = { ...batch()[0], t: Date.now() + 10 * 86400000 };
    await expect(importSales(db, dev, { source: "x.csv", sales: [bad] })).rejects.toThrow();
  });
  it("deshacer borra solo lo importado de ese archivo", async () => {
    const n = await undoImport(db, dev, "ventas-2024.csv");
    expect(n).toBe(3);
    expect(await db.select().from(sales).where(eq(sales.source, "ventas-2024.csv"))).toHaveLength(0);
    expect(await db.select().from(sales).where(eq(sales.source, "otro.csv"))).toHaveLength(1);
  });
});

describe("configuración", () => {
  let db: Db;
  beforeAll(async () => { db = await freshDb(); });
  it("cambia prefijo y siguiente número, sin dejar retroceder", async () => {
    await expect(saveNumbering(db, dev, { prefix: "FV-", next: 1 })).rejects.toThrow(/mayor/);
    await saveNumbering(db, dev, { prefix: "IMP-", next: 5000 });
    const [it] = (await db.select().from(items)).filter((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 0);
    const s = await createSale(db, dev, { lines: [{ item: it.id, qty: 1 }], payments: [{ method: "Efectivo", amount: it.price }] });
    expect(s.no).toBe("IMP-5000");
    await expect(saveNumbering(db, dev, { prefix: "IMP-", next: 5000 })).rejects.toThrow(/mayor/);
    await expect(saveNumbering(db, dev, { prefix: "F V", next: 6000 })).rejects.toThrow(/prefijo/);
  });
  it("un descuento en pesos que no da un % entero se guarda y cuadra al peso", async () => {
    const [it] = (await db.select().from(items)).filter((i) => i.status === "En vitrina" && i.track === "unit" && i.price > 100_000);
    const total = it.price - 33_333;
    const s = await createSale(db, dev, { lines: [{ item: it.id, qty: 1 }], discount: { type: "cop", value: 33_333 }, discReason: "Prueba", payments: [{ method: "Efectivo", amount: total }] });
    expect(s.total).toBe(total);
    const [row] = await db.select().from(sales).where(eq(sales.id, s.id));
    expect(row.disc % 1).not.toBe(0);
    expect(row.total).toBe(total);
  });
  it("valida NIT y correo, y guarda los datos nuevos del comprobante", async () => {
    const [cfg] = await db.select().from(settings);
    await expect(saveSettings(db, dev, { ...cfg, nit: "abc" })).rejects.toThrow(/NIT/);
    await expect(saveSettings(db, dev, { ...cfg, email: "no-es-correo" })).rejects.toThrow(/correo/);
    await saveSettings(db, dev, { ...cfg, nit: "901.234.567-8", taxNote: "No responsable de IVA", instagram: "@importech", invTitle: "Remisión", showSignatures: false });
    const [after] = await db.select().from(settings);
    expect(after).toMatchObject({ nit: "901.234.567-8", taxNote: "No responsable de IVA", instagram: "importech", invTitle: "Remisión", showSignatures: false });
  });
  it("guarda meses de garantía y condiciones", async () => {
    await saveWarranty(db, dev, { warr: { ...WARR, Usado: 2 }, terms: ["Cubre defectos de fábrica.", "  ", "No cubre golpes."] });
    const [after] = await db.select().from(settings);
    expect(after.warr.Usado).toBe(2);
    expect(after.warrTerms).toEqual(["Cubre defectos de fábrica.", "No cubre golpes."]);
    await expect(saveWarranty(db, dev, { warr: { ...WARR, Nuevo: -1 }, terms: [] })).rejects.toThrow();
  });
});
