import { getDb } from "@/db";
import { getMe } from "@/server/auth";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Diagnóstico de velocidad: cuánto tarda cada ida y vuelta a la base de datos (solo con sesión). */
export async function GET() {
  if (!(await getMe())) return new Response("No autorizado", { status: 401 });
  const db = await getDb();
  const t: number[] = [];
  for (let i = 0; i < 5; i++) { const a = performance.now(); await db.execute(sql`select 1`); t.push(Math.round(performance.now() - a)); }
  return Response.json({ db_ms: t, region: process.env.VERCEL_REGION ?? "local" });
}
