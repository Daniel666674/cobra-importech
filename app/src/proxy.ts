import { NextResponse, type NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "importech_session";
const REMEMBER_S = 60 * 60 * 24 * 30;
const DAY_S = 60 * 60 * 24;

/**
 * Revisión rápida: sin cookie de sesión se manda al login. La verificación real (usuario activo, versión de sesión,
 * permisos) ocurre en cada página y acción. Si la sesión pidió «mantenerla iniciada» y tiene más de un día, se renueva
 * por otros 30 días: quien usa la app a diario no vuelve a escribir la contraseña.
 */
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  // /comprobante/…: enlace firmado que se manda al cliente por WhatsApp (no requiere sesión).
  const open = ["/login", "/setup"].includes(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith("/comprobante/");
  if (!token && !open) return NextResponse.redirect(new URL("/login", req.url));
  const res = NextResponse.next();
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      const key = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, key);
      const now = Math.floor(Date.now() / 1000);
      if (payload.r === 1 && payload.sub && now - (payload.iat ?? now) > DAY_S) {
        const fresh = await new SignJWT({ v: payload.v ?? 0, r: 1 }).setProtectedHeader({ alg: "HS256" }).setSubject(payload.sub).setIssuedAt().setExpirationTime(`${REMEMBER_S}s`).sign(key);
        res.cookies.set(COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REMEMBER_S });
      }
    } catch {
      // Token inválido o vencido: la página lo rechaza y manda al login.
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|vendor|logo.png|manifest.webmanifest|sw.js|favicon.ico).*)"],
};
