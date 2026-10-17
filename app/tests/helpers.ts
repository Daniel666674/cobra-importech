import { __setDb, getDb, type Db } from "@/db";
import { seedDemo } from "@/server/seed";

/** Base nueva en memoria con los datos de ejemplo. */
export async function freshDb(): Promise<Db> {
  __setDb(undefined);
  const db = await getDb();
  await seedDemo(db, { rounds: 4 });
  return db;
}

/** Base nueva y vacía (como la ve el cliente la primera vez). */
export async function emptyDb(): Promise<Db> {
  __setDb(undefined);
  return getDb();
}
