import { beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { items, users } from "@/db/schema";
import { checkLogin, meFromToken } from "@/server/auth";
import { freshDb } from "./helpers";
import type { Db } from "@/db";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

describe("seed", () => {
  it("carga los equipos de ejemplo", async () => {
    const [{ n }] = await db.select({ n: count() }).from(items);
    expect(n).toBe(88);
  });
  it("no se vuelve a sembrar", async () => {
    const { seedDemo } = await import("@/server/seed");
    expect(await seedDemo(db, { rounds: 4 })).toBe(false);
  });
});

describe("login", () => {
  it("acepta el PIN correcto y devuelve el rol", async () => {
    const r = await checkLogin("u2", "2222");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const me = await meFromToken(r.token);
      expect(me?.name).toBe("Angelica");
      expect(me?.perms).toContain("reports");
    }
  });
  it("rechaza un PIN malo y bloquea tras 5 intentos", async () => {
    for (let i = 0; i < 5; i++) expect((await checkLogin("u3", "0000")).ok).toBe(false);
    const r = await checkLogin("u3", "3333");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Demasiados intentos/);
    await db.update(users).set({ lockedUntil: 0 }).where(eq(users.id, "u3"));
    expect((await checkLogin("u3", "3333")).ok).toBe(true);
  });
  it("un token falso no entra", async () => {
    expect(await meFromToken("abc.def.ghi")).toBeNull();
  });
});
