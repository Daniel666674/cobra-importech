import catalog from "@/data/catalog.json";

export const CATS = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods", "Accesorios"] as const;
export type Cat = (typeof CATS)[number];
export const CAT_SKU: Record<Cat, string> = {
  iPhone: "IPH", iPad: "IPD", Mac: "MAC", "Apple Watch": "AWT", AirPods: "APD", Accesorios: "ACC",
};
export const CONDS = ["Nuevo", "Exhibición", "Reacondicionado", "Pre-owned", "Usado"] as const;
export const STATUSES = ["En vitrina", "Apartado", "En taller", "En revisión", "Vendido"] as const;
export const METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Nequi", "Daviplata", "Enlace Bold"] as const;
export const COND_F: Record<string, number> = {
  Nuevo: 1, Exhibición: 0.92, Reacondicionado: 0.82, "Pre-owned": 0.74, Usado: 0.62,
};
export const COND_CHIP: Record<string, string> = {
  Nuevo: "ok", Exhibición: "info", Reacondicionado: "pur", "Pre-owned": "warn", Usado: "gray",
};
const STOR: Record<number, number> = { 128: -400000, 256: 0, 512: 1000000, 1024: 2000000 };

export type CatalogEntry = { cat: Cat; name: string; retail: number; tac?: string };
/** Catálogo de referencia (modelos y precio de lista). Editable desde el código; no es inventario. */
export const CATALOG = catalog as CatalogEntry[];
const BY_NAME = new Map(CATALOG.map((c) => [c.name, c]));
export const catalogEntry = (name: string) => BY_NAME.get(name);

/** Precio sugerido según modelo, capacidad y condición (redondeado a $10.000). */
export function listPrice(name: string, spec: string, cond: string): number {
  const c = BY_NAME.get(name);
  let base = c ? c.retail : 0;
  if (c && c.cat === "iPhone") {
    const m = /(\d+)\s*(TB|GB)/i.exec(spec || "");
    if (m) {
      const gb = m[2].toUpperCase() === "TB" ? +m[1] * 1024 : +m[1];
      if (STOR[gb] != null) base += STOR[gb];
    }
  }
  return Math.round((base * (COND_F[cond] ?? 1)) / 10000) * 10000;
}
