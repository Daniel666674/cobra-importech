import { beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { feed, items, users } from "@/db/schema";
import { checkLogin, lockMs, meFromToken } from "@/server/auth";
import { updateUser } from "@/server/admin";
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
  it("los intentos en paralelo no saltan el bloqueo", async () => {
    await db.update(users).set({ failed: 0, lockedUntil: 0 }).where(eq(users.id, "u3"));
    // 30 intentos a la vez: solo se compara el PIN en los que quedaron registrados, nunca más de 5.
    const rs = await Promise.all(Array.from({ length: 30 }, () => checkLogin("u3", "0000")));
    expect(rs.every((r) => !r.ok)).toBe(true);
    const tried = rs.filter((r) => !r.ok && r.error.startsWith("Contraseña incorrecta")).length;
    const [u] = await db.select().from(users).where(eq(users.id, "u3"));
    expect(tried).toBe(u.failed);
    expect(tried).toBeLessThanOrEqual(5);
    // Y en tandas seguidas, al quinto fallo queda bloqueado aunque el siguiente PIN sea el correcto.
    for (let i = 0; i < 10 && !(await db.select().from(users).where(eq(users.id, "u3")))[0].lockedUntil; i++) {
      await Promise.all(Array.from({ length: 10 }, () => checkLogin("u3", "0000")));
    }
    const [after] = await db.select().from(users).where(eq(users.id, "u3"));
    expect(after.failed).toBe(5);
    expect(after.lockedUntil).toBeGreaterThan(Date.now());
    expect((await checkLogin("u3", "3333")).ok).toBe(false);
  });
  it("cada bloqueo seguido dura más, hasta 24 h", async () => {
    expect(lockMs(1)).toBe(5 * 60_000);
    expect(lockMs(2)).toBe(15 * 60_000);
    expect(lockMs(3)).toBe(45 * 60_000);
    expect(lockMs(20)).toBe(24 * 60 * 60_000);
    await db.update(users).set({ failed: 5, lockedUntil: 0 }).where(eq(users.id, "u3"));
    const now = Date.now();
    for (let i = 0; i < 5; i++) expect((await checkLogin("u3", "0000", now)).ok).toBe(false);
    const [u] = await db.select().from(users).where(eq(users.id, "u3"));
    expect(u.lockedUntil).toBe(now + 15 * 60_000);
    const feedRows = await db.select().from(feed);
    expect(feedRows.some((f) => f.x.includes("quedó bloqueado"))).toBe(true);
    await db.update(users).set({ lockedUntil: 0 }).where(eq(users.id, "u3"));
    expect((await checkLogin("u3", "3333")).ok).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, "u3"));
    expect(after.failed).toBe(0);
  });
  it("restablecer la contraseña o desactivar cierra las sesiones abiertas", async () => {
    const r = await checkLogin("u3", "3333");
    if (!r.ok) throw new Error(r.error);
    expect(await meFromToken(r.token)).not.toBeNull();
    const owner = { id: "u1", name: "Dueño", perms: [], locked: true };
    const { temp } = await updateUser(db, owner, "u3", { resetPassword: true });
    expect(temp).toMatch(/^[A-Z][a-z]{2}\d-[A-Z][a-z]{2}\d-[A-Z][a-z]{2}\d$/);
    expect(await meFromToken(r.token)).toBeNull();
    expect((await checkLogin("u3", "3333")).ok).toBe(false);
    const r2 = await checkLogin("u3", temp!);
    if (!r2.ok) throw new Error(r2.error);
    expect((await meFromToken(r2.token))?.mustChange).toBe(true);
    await updateUser(db, owner, "u3", { active: false });
    expect(await meFromToken(r2.token)).toBeNull();
    await updateUser(db, owner, "u3", { active: true });
    expect(await meFromToken(r2.token)).toBeNull();
  });
  it("quien administra usuarios no puede restablecer la contraseña del desarrollador", async () => {
    const admin = { id: "u2", name: "Angelica", perms: ["users"], locked: false };
    await expect(updateUser(db, admin, "u1", { resetPassword: true })).rejects.toThrow(/Solo un desarrollador/);
    expect((await checkLogin("u1", "1111")).ok).toBe(true);
  });
  it("un token falso no entra", async () => {
    expect(await meFromToken("abc.def.ghi")).toBeNull();
  });
});

describe("contraseñas", () => {
  it("reglas: largo, variedad, comunes y datos personales", async () => {
    const { passwordProblem, passwordScore, tempPassword, suggestUsername } = await import("@/lib/password");
    expect(passwordProblem("corta1!A")).toMatch(/al menos 10/);
    expect(passwordProblem("solominusculas")).toMatch(/Combina/);
    expect(passwordProblem("una frase larga de vitrina")).toBeNull();
    expect(passwordProblem("Vitrina#7Luna")).toBeNull();
    expect(passwordProblem("Password123!")).toMatch(/común/);
    expect(passwordProblem("Importech2025!")).toMatch(/común/);
    expect(passwordProblem("aaaaaaaaaaaA1!")).toMatch(/repite/);
    expect(passwordProblem("Anderson#2025", { name: "Anderson Ruiz" })).toMatch(/nombre/);
    expect(passwordProblem("x".repeat(65))).toMatch(/pasar de 64/);
    expect(passwordScore("Vitrina#7Luna")).toBeGreaterThanOrEqual(3);
    expect(tempPassword(() => 0)).toBe("Aaa2-Aaa2-Aaa2");
    expect(passwordProblem(tempPassword((n) => Math.floor(Math.random() * n)))).toBeNull();
    expect(suggestUsername("María José Gómez")).toBe("maria.gomez");
  });
  it("cambiar la propia contraseña: exige la actual, aplica reglas, quita «temporal» y cierra otras sesiones", async () => {
    const { changeOwnPassword } = await import("@/server/account");
    const owner = { id: "u1", name: "Dueño", perms: [], locked: true };
    const { temp } = await updateUser(db, owner, "u3", { resetPassword: true });
    const r = await checkLogin("u3", temp!);
    if (!r.ok) throw new Error(r.error);
    await expect(changeOwnPassword(db, "u3", { current: "mala", next: "Vitrina#7Luna", confirm: "Vitrina#7Luna" })).rejects.toThrow(/actual no es correcta/);
    await expect(changeOwnPassword(db, "u3", { current: temp, next: "Vitrina#7Luna", confirm: "Vitrina#7Lunx" })).rejects.toThrow(/no coincide/);
    await expect(changeOwnPassword(db, "u3", { current: temp, next: "123456789012", confirm: "123456789012" })).rejects.toThrow();
    await expect(changeOwnPassword(db, "u3", { current: temp, next: temp, confirm: temp })).rejects.toThrow(/distinta/);
    const v = await changeOwnPassword(db, "u3", { current: temp, next: "Vitrina#7Luna", confirm: "Vitrina#7Luna" });
    expect(await meFromToken(r.token)).toBeNull();
    const [u] = await db.select().from(users).where(eq(users.id, "u3"));
    expect(u).toMatchObject({ mustChange: false, sessionV: v });
    const { loginWithPassword } = await import("@/server/auth");
    const ok = await loginWithPassword(u.username, "Vitrina#7Luna");
    expect(ok.ok).toBe(true);
    expect((await loginWithPassword(u.username, temp!)).ok).toBe(false);
  });

});
