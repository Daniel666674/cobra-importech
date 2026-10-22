/** Reglas de contraseña (sin dependencias: se usan igual en el navegador y en el servidor). */

export const PW_MIN = 10;
export const PW_PASSPHRASE = 16;
export const PW_MAX = 64; // bcrypt solo usa los primeros 72 bytes

const COMMON = [
  "password", "contrasena", "contraseña", "123456", "1234567890", "qwerty", "asdfgh", "abc123", "iloveyou", "admin",
  "importech", "iphone", "apple", "colombia", "medellin", "bogota", "tienda", "celular", "bienvenido", "welcome", "letmein",
];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
/** Propone un usuario a partir del nombre: «María José Gómez» → «maria.gomez». */
export function suggestUsername(name: string) {
  const parts = norm(name).replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const u = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0] ?? "";
  return u.slice(0, 30);
}

/** Qué clases de caracteres tiene: minúsculas, mayúsculas, números, símbolos. */
const classes = (pw: string) => [/[a-zñ]/, /[A-ZÑ]/, /\d/, /[^A-Za-zÑñ\d]/].filter((r) => r.test(pw)).length;

/** Devuelve el primer problema de la contraseña, o null si cumple las reglas. */
export function passwordProblem(pw: string, ctx: { name?: string; username?: string; business?: string } = {}): string | null {
  if (pw.length < PW_MIN) return `La contraseña debe tener al menos ${PW_MIN} caracteres`;
  if (pw.length > PW_MAX) return `La contraseña no puede pasar de ${PW_MAX} caracteres`;
  if (pw.length < PW_PASSPHRASE && classes(pw) < 3)
    return `Combina al menos 3 de: minúsculas, mayúsculas, números y símbolos (o usa una frase de ${PW_PASSPHRASE}+ caracteres)`;
  if (/^(.)\1+$/.test(pw) || new Set(pw).size < 5) return "La contraseña repite demasiados caracteres";
  const p = norm(pw).replace(/[^a-z0-9]/g, "");
  if (COMMON.some((c) => p.includes(norm(c).replace(/[^a-z0-9]/g, "")) && p.length - c.length < 6)) return "Esa contraseña es demasiado común o fácil de adivinar";
  for (const w of [ctx.username, ...(ctx.name ?? "").split(/\s+/), ...(ctx.business ?? "").split(/\s+/)]) {
    const t = norm(w ?? "").replace(/[^a-z0-9]/g, "");
    if (t.length >= 4 && p.includes(t)) return "La contraseña no puede contener tu nombre, tu usuario ni el nombre del negocio";
  }
  return null;
}

/** Puntaje 0–4 para el medidor visual (no reemplaza a passwordProblem). */
export function passwordScore(pw: string) {
  if (!pw) return 0;
  let s = Math.min(2, Math.floor(pw.length / 8)) + Math.max(0, classes(pw) - 2);
  if (pw.length >= PW_PASSPHRASE) s++;
  return Math.max(1, Math.min(4, s));
}

/** Contraseña temporal fácil de dictar (sin 0/O, 1/l/I): «Kmt7-Rpw4-Xhe9». */
export function tempPassword(rand: (n: number) => number) {
  const L = "abcdefghjkmnpqrstuvwxyz", U = "ABCDEFGHJKMNPQRSTUVWXYZ", D = "23456789";
  const pick = (s: string) => s[rand(s.length)];
  const block = () => pick(U) + pick(L) + pick(L) + pick(D);
  return `${block()}-${block()}-${block()}`;
}
