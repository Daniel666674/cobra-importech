import { getDb } from "../src/db";
import { seedDemo } from "../src/server/seed";

const db = await getDb();
console.log((await seedDemo(db)) ? "Datos de ejemplo cargados. PIN: Daniel 1111 · Angelica 2222 · Anderson 3333" : "La base ya tiene datos: no se cargó nada.");
process.exit(0);
