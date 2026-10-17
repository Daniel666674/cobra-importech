import { NextResponse, type NextRequest } from "next/server";

/** Revisión rápida: sin cookie de sesión se manda al login. La verificación real ocurre en cada página y acción. */
export function proxy(req: NextRequest) {
  const has = req.cookies.has("importech_session");
  if (!has && !["/login", "/setup"].includes(req.nextUrl.pathname)) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|logo.png|manifest.webmanifest|sw.js|favicon.ico).*)"],
};
