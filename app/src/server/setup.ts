import { count } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { counters, roles, settings, users } from "@/db/schema";
import { DEFAULT_ROLES } from "./roles";
import { AppError } from "./core";
import { hashPin } from "./auth";
import { PW_MAX, passwordProblem } from "@/lib/password";
import { usernameSchema } from "./admin";

/** La herramienta está "vacía" hasta que se complete la configuración inicial. */
export async function needsSetup(db: Db): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(settings);
  return n === 0;
}

export const setupInput = z.object({
  business: z.string().trim().min(2, "Escribe el nombre del negocio"),
  ownerName: z.string().trim().min(2, "Escribe el nombre del propietario/a"),
  ownerUser: usernameSchema,
  ownerPass: z.string().max(PW_MAX),
  ownerPass2: z.string().max(PW_MAX),
  devName: z.string().trim().default(""),
  devUser: z.string().trim().toLowerCase().default(""),
  devPass: z.string().max(PW_MAX).default(""),
});

/** Configuración inicial: negocio, roles y el primer usuario (más un desarrollador opcional). Sin datos de ejemplo. */
export async function runSetup(db: Db, raw: unknown) {
  const v = setupInput.parse(raw);
  if (v.ownerPass !== v.ownerPass2) throw new AppError("La confirmación de la contraseña no coincide", "invalid");
  const p1 = passwordProblem(v.ownerPass, { name: v.ownerName, username: v.ownerUser, business: v.business });
  if (p1) throw new AppError(p1, "invalid");
  if (v.devName) {
    usernameSchema.parse(v.devUser);
    if (v.devUser === v.ownerUser) throw new AppError("El desarrollador necesita un usuario distinto al del propietario/a", "invalid");
    const p2 = passwordProblem(v.devPass, { name: v.devName, username: v.devUser, business: v.business });
    if (p2) throw new AppError("Desarrollador: " + p2, "invalid");
  }
  const ownerHash = await hashPin(v.ownerPass);
  const devHash = v.devName ? await hashPin(v.devPass) : "";
  return db.transaction(async (tx) => {
    if (!(await needsSetup(tx))) throw new AppError("La configuración inicial ya se hizo", "conflict");
    await tx.insert(settings).values({
      id: 1, name: v.business, warr: { Nuevo: 12, Exhibición: 9, Reacondicionado: 6, "Pre-owned": 3, Usado: 1 },
      footer: "Gracias por tu compra. Conserva este comprobante para hacer válida tu garantía.",
    });
    await tx.insert(roles).values(Object.entries(DEFAULT_ROLES).map(([key, r]) => ({ key, name: r.name, locked: !!r.locked, perms: r.perms })));
    const now = Date.now();
    const rows = [{ id: "u1", name: v.ownerName, username: v.ownerUser, email: "", role: "owner", active: true, pinHash: ownerHash, createdAt: now }];
    if (v.devName) rows.push({ id: "u2", name: v.devName, username: v.devUser, email: "", role: "dev", active: true, pinHash: devHash, createdAt: now });
    await tx.insert(users).values(rows);
    await tx.insert(counters).values([{ key: "user", value: rows.length }, { key: "invoice", value: 1000 }, { key: "hold", value: 0 }, { key: "receipt", value: 0 }]);
    return rows[0].id;
  });
}
