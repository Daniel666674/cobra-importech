import { count } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { counters, roles, settings, users } from "@/db/schema";
import { DEFAULT_ROLES } from "./roles";
import { AppError } from "./core";
import { hashPin } from "./auth";

/** La herramienta está "vacía" hasta que se complete la configuración inicial. */
export async function needsSetup(db: Db): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(settings);
  return n === 0;
}

const pin = z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 números");
export const setupInput = z.object({
  business: z.string().trim().min(2, "Escribe el nombre del negocio"),
  ownerName: z.string().trim().min(2, "Escribe el nombre del propietario/a"),
  ownerPin: pin,
  devName: z.string().trim().default(""),
  devPin: z.string().default(""),
});

/** Configuración inicial: negocio, roles y el primer usuario (más un desarrollador opcional). Sin datos de ejemplo. */
export async function runSetup(db: Db, raw: unknown) {
  const v = setupInput.parse(raw);
  if (v.devName && !pin.safeParse(v.devPin).success) throw new AppError("El PIN del desarrollador debe tener de 4 a 6 números", "invalid");
  const ownerHash = await hashPin(v.ownerPin);
  const devHash = v.devName ? await hashPin(v.devPin) : "";
  return db.transaction(async (tx) => {
    if (!(await needsSetup(tx))) throw new AppError("La configuración inicial ya se hizo", "conflict");
    await tx.insert(settings).values({
      id: 1, name: v.business, warr: { Nuevo: 12, Exhibición: 9, Reacondicionado: 6, "Pre-owned": 3, Usado: 1 },
      footer: "Gracias por tu compra. Conserva este comprobante para hacer válida tu garantía.",
    });
    await tx.insert(roles).values(Object.entries(DEFAULT_ROLES).map(([key, r]) => ({ key, name: r.name, locked: !!r.locked, perms: r.perms })));
    const now = Date.now();
    const rows = [{ id: "u1", name: v.ownerName, email: "", role: "owner", active: true, pinHash: ownerHash, createdAt: now }];
    if (v.devName) rows.push({ id: "u2", name: v.devName, email: "", role: "dev", active: true, pinHash: devHash, createdAt: now });
    await tx.insert(users).values(rows);
    await tx.insert(counters).values([{ key: "user", value: rows.length }, { key: "invoice", value: 1000 }, { key: "hold", value: 0 }, { key: "receipt", value: 0 }]);
    return rows[0].id;
  });
}
