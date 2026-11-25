import catalog from "@/data/catalog.json";

export const CATS = ["iPhone", "Samsung", "Android", "iPad", "Mac", "Apple Watch", "AirPods", "Accesorios"] as const;
export type Cat = (typeof CATS)[number];
/** Celulares: llevan IMEI y, al recibirlos como retoma, consulta de la CRC. Solo el iPhone tiene además bloqueo de Apple. */
export const MOBILE_CATS: readonly string[] = ["iPhone", "Samsung", "Android"];
export const isMobile = (cat: string) => MOBILE_CATS.includes(cat);
export const CAT_SKU: Record<Cat, string> = {
  iPhone: "IPH", Samsung: "SAM", Android: "AND", iPad: "IPD", Mac: "MAC", "Apple Watch": "AWT", AirPods: "APD", Accesorios: "ACC",
};
/** Categorías de producto configurables por negocio: las de fábrica se pueden ocultar y se pueden agregar otras propias. */
export type CatDef = { name: string; kind: "unit" | "qty"; sku: string; active: boolean; builtin: boolean; mobile: boolean };
export const DEFAULT_CATDEFS: CatDef[] = CATS.map((name) => ({ name, kind: name === "AirPods" || name === "Accesorios" ? "qty" : "unit", sku: CAT_SKU[name], active: true, builtin: true, mobile: MOBILE_CATS.includes(name) }));
export function catDefs(stored?: { name: string; kind?: string; sku?: string; active?: boolean }[] | null): CatDef[] {
  const out: CatDef[] = [];
  for (const s of stored ?? []) {
    const d = DEFAULT_CATDEFS.find((x) => x.name === s.name);
    if (d) out.push({ ...d, active: s.active !== false });
    else if (s.name && !out.some((x) => x.name === s.name)) out.push({ name: s.name, kind: s.kind === "qty" ? "qty" : "unit", sku: (s.sku || s.name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase().padEnd(3, "X"), active: s.active !== false, builtin: false, mobile: false });
  }
  for (const d of DEFAULT_CATDEFS) if (!out.some((x) => x.name === d.name)) out.push({ ...d });
  return out;
}
/** Productos que pueden ir sin garantía: accesorios y las categorías propias por cantidad. */
export const noWarrantyOk = (it: { cat: string; track?: string }) => it.cat === "Accesorios" || (it.track === "qty" && it.cat !== "AirPods");
export const activeCatNames = (defs: CatDef[]) => defs.filter((d) => d.active).map((d) => d.name);

export const CONDS = ["Nuevo", "Exhibición", "Reacondicionado", "Pre-owned", "Usado"] as const;
export const STATUSES = ["En vitrina", "Apartado", "En taller", "En revisión", "Vendido"] as const;
export const METHODS = ["Efectivo", "Transferencia", "Tarjeta débito", "Tarjeta crédito", "Nequi", "Daviplata", "Addi", "Vanti", "Enlace Bold", "Datáfono Bold", "Datáfono Redeban"] as const;
/** Recargo por forma de pago: el valor se divide por (1 − %), p. ej. Addi 12 % → valor ÷ 0,88. Se cambia en Configuración → Ventas y caja. */
export const DEFAULT_SURCHARGES: Record<string, number> = { Addi: 12, Vanti: 6, "Tarjeta crédito": 7, "Datáfono Bold": 7, "Datáfono Redeban": 7 };
export const surchargeOf = (cfg: { surcharges?: Record<string, number> | null }, method: string) => (cfg.surcharges ?? DEFAULT_SURCHARGES)[method] ?? 0;
/** Recargo en pesos de un pago: valor ÷ (1 − %/100) − valor, redondeado al peso. */
export const feeFor = (pct: number, amount: number) => (pct > 0 && pct < 100 ? Math.round(amount / (1 - pct / 100)) - amount : 0);
/** Formas de pago habilitadas en Configuración (vacío = todas). */
export const enabledMethods = (cfg: { methods?: string[] | null }): string[] => (cfg.methods?.length ? METHODS.filter((m) => cfg.methods!.includes(m)) : [...METHODS]);
export const COND_F: Record<string, number> = {
  Nuevo: 1, Exhibición: 0.92, Reacondicionado: 0.82, "Pre-owned": 0.74, Usado: 0.62,
};
export const COND_CHIP: Record<string, string> = {
  Nuevo: "ok", Exhibición: "info", Reacondicionado: "pur", "Pre-owned": "warn", Usado: "gray",
};
const STOR: Record<number, number> = { 128: -400000, 256: 0, 512: 1000000, 1024: 2000000 };

export type CatalogEntry = { cat: Cat; name: string; retail: number };
/** Catálogo de referencia (modelos y precio de lista). Editable desde el código; no es inventario. */
export const CATALOG = catalog as CatalogEntry[];
const BY_NAME = new Map(CATALOG.map((c) => [c.name, c]));
export const catalogEntry = (name: string) => BY_NAME.get(name);

/** Precio sugerido según modelo, capacidad y condición (redondeado a $10.000). */
export function listPrice(name: string, spec: string, cond: string): number {
  const c = BY_NAME.get(name);
  if (!c?.retail) return 0;
  let base = c.retail;
  if (c && c.cat === "iPhone") {
    const m = /(\d+)\s*(TB|GB)/i.exec(spec || "");
    if (m) {
      const gb = m[2].toUpperCase() === "TB" ? +m[1] * 1024 : +m[1];
      if (STOR[gb] != null) base += STOR[gb];
    }
  }
  return Math.round((base * (COND_F[cond] ?? 1)) / 10000) * 10000;
}

/** Opciones de los menús desplegables (capacidad y color) por categoría. Siempre se puede escribir otro valor. */
export const SPEC_OPTIONS: Record<Cat, string[]> = {
  iPhone: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "2 TB"],
  Samsung: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"],
  Android: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"],
  iPad: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "2 TB"],
  Mac: ["8 GB / 256 GB", "8 GB / 512 GB", "16 GB / 256 GB", "16 GB / 512 GB", "16 GB / 1 TB", "24 GB / 512 GB", "24 GB / 1 TB", "32 GB / 1 TB", "36 GB / 1 TB", "48 GB / 1 TB"],
  "Apple Watch": ["40 mm", "41 mm", "42 mm", "44 mm", "45 mm", "46 mm", "49 mm"],
  AirPods: [],
  Accesorios: [],
};
export const COLOR_OPTIONS: Record<Cat, string[]> = {
  iPhone: ["Negro", "Blanco", "Azul", "Rojo", "Verde", "Rosado", "Morado", "Amarillo", "Medianoche", "Blanco estelar", "Grafito", "Plata", "Dorado", "Azul Sierra", "Azul Pacífico", "Morado oscuro", "Titanio natural", "Titanio negro", "Titanio blanco", "Titanio azul", "Titanio desierto", "Naranja cósmico", "Azul profundo", "Ultramar", "Verde azulado", "Lavanda", "Salvia", "Azul cielo", "Dorado claro"],
  Samsung: ["Negro", "Blanco", "Gris", "Azul", "Verde", "Morado", "Crema", "Lavanda", "Titanio gris", "Titanio negro", "Titanio azul", "Titanio violeta", "Dorado"],
  Android: ["Negro", "Blanco", "Gris", "Azul", "Verde", "Rojo", "Dorado", "Plata", "Rosado", "Morado"],
  iPad: ["Gris espacial", "Plata", "Azul", "Rosado", "Amarillo", "Morado", "Blanco estelar", "Negro espacial"],
  Mac: ["Gris espacial", "Plata", "Medianoche", "Blanco estelar", "Negro espacial", "Azul cielo", "Azul", "Verde", "Rosado", "Amarillo", "Naranja", "Morado"],
  "Apple Watch": ["Medianoche", "Blanco estelar", "Plata", "Negro azabache", "Oro rosa", "Titanio natural", "Titanio negro", "Rojo"],
  AirPods: ["Blanco", "Medianoche", "Azul", "Morado", "Naranja", "Blanco estelar"],
  Accesorios: ["Negro", "Blanco", "Transparente", "Azul", "Rojo", "Rosado", "Verde", "Morado"],
};
