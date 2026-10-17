"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium ${on ? "bg-accent/10 text-accent" : "text-t2 hover:bg-gray-bg"}`}
            style={on ? undefined : undefined}
          >
            <span className="w-5 text-center">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {n.badge ? <span className="chip bad">{n.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
