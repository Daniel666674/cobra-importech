import fs from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Transacción o conexión: los servicios aceptan cualquiera de las dos. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __db?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
    const pool = new Pool({ connectionString: url });
    return drizzle(pool, { schema }) as unknown as Db;
  }
  if (process.env.VERCEL) throw new Error("Falta la variable DATABASE_URL (base de datos Postgres).");
  // Sin DATABASE_URL: base embebida (PGlite) para desarrollo y pruebas.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_MEMORY ? undefined : path.join(process.cwd(), ".data", "pglite");
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

/** Devuelve la conexión única de este proceso. */
export function getDb(): Promise<Db> {
  if (!g.__db) g.__db = connect();
  return g.__db;
}

/** Solo para pruebas: reemplaza la conexión. */
export function __setDb(p: Promise<Db> | undefined) {
  g.__db = p;
}

export { schema };
