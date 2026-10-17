// Aplica las migraciones a la base de datos de DATABASE_URL (Neon/Postgres).
import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL no está definida: se omiten las migraciones.");
  process.exit(0);
}
if (typeof WebSocket === "undefined") throw new Error("Se requiere Node 22+ (WebSocket global).");
const { neonConfig } = await import("@neondatabase/serverless");
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
await pool.end();
console.log("Migraciones aplicadas.");
