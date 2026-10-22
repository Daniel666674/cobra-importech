import { count, eq, or } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { items, settings } from "@/db/schema";
import { logout } from "@/app/actions/auth";
import { Nav, type NavItem } from "@/components/nav";
import { hasPerm } from "@/server/auth";
import { requireMe } from "@/server/session";
import { initials } from "@/lib/format";
import { pendingCount } from "@/server/approvals";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { perm?: string })[] = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/inventario", label: "Inventario", icon: "📦", perm: "inv_view" },
  { href: "/aprobaciones", label: "Aprobaciones", icon: "🕒", perm: "inv_view" },
  { href: "/ingreso", label: "Ingresar producto", icon: "➕", perm: "inv_edit" },
  { href: "/venta", label: "Nueva venta", icon: "🧾", perm: "sell" },
  { href: "/ventas", label: "Ventas", icon: "📑", perm: "sell" },
  { href: "/retomas", label: "Retomas", icon: "🔄", perm: "tradein" },
  { href: "/apartados", label: "Apartados", icon: "🔒", perm: "credit" },
  { href: "/garantias", label: "Garantías", icon: "🛡️", perm: "sell" },
  { href: "/clientes", label: "Clientes", icon: "👥", perm: "clients" },
  { href: "/taller", label: "Taller", icon: "🔧", perm: "workshop" },
  { href: "/cartera", label: "Cartera", icon: "💼", perm: "purchase" },
  { href: "/reportes", label: "Reportes", icon: "📊", perm: "reports" },
  { href: "/usuarios", label: "Usuarios y permisos", icon: "🔐", perm: "users" },
  { href: "/config", label: "Configuración", icon: "⚙️", perm: "settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const db = await getDb();
  const [[cfg], [{ n: review }], pend] = await Promise.all([db.select().from(settings).limit(1), db.select({ n: count() }).from(items).where(eq(items.status, "En revisión")), pendingCount(db)]);
  const nav = NAV.filter((n) => !n.perm || hasPerm(me, n.perm)).map(({ perm, ...n }) => (n.href === "/aprobaciones" ? { ...n, badge: pend || undefined } : perm === "inv_view" ? { ...n, badge: review || undefined } : n))
    .filter((n) => n.href !== "/aprobaciones" || pend > 0 || me.perms.includes("approve"));
  void or;
  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cfg?.logo || "/logo.png"} alt="" className="h-9 w-9 rounded-lg object-contain bg-white border border-line" />
      <b className="text-[15px]">{cfg?.name ?? "Importech"}</b>
    </Link>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="no-print hidden lg:flex flex-col gap-4 border-r border-line bg-card p-4 sticky top-0 h-screen overflow-y-auto">
        {brand}
        <Nav items={nav} />
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white text-[11px] font-bold">{initials(me.name)}</span>
          <div className="flex-1 leading-tight">
            <b className="block text-[13px]">{me.name}</b>
            <span className="note">{me.roleName}</span>
          </div>
          <Link href="/cuenta" className="btn sm" title="Cambiar contraseña">🔑</Link>
          <form action={logout}><button className="btn sm" title="Cerrar sesión">Salir</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print lg:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card px-4 py-2.5">
          {brand}
          <details className="relative">
            <summary className="btn sm list-none">☰ Menú</summary>
            <div className="card absolute right-0 mt-2 w-64 p-3 shadow-lg">
              <Nav items={nav} />
              <Link href="/cuenta" className="btn sm w-full mt-2">🔑 Cambiar contraseña</Link>
              <form action={logout} className="mt-2 border-t border-line pt-2"><button className="btn sm w-full">Salir · {me.name}</button></form>
            </div>
          </details>
        </header>
        <main className="mx-auto max-w-[1180px] p-4 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
