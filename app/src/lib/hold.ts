import { DAY } from "./format";
import type { Hold } from "@/db/schema";

export const holdPaid = (h: Hold | null) => (h ? h.abono : 0);
export const holdBal = (price: number, h: Hold | null) => Math.max(0, price - holdPaid(h));
export const holdLeft = (h: Hold, now = Date.now()) => Math.ceil((h.expires - now) / DAY);
/** Abono mínimo: % del precio redondeado a $1.000. */
export const holdMin = (price: number, pct: number) => Math.round((price * (pct || 20)) / 100 / 1000) * 1000;
