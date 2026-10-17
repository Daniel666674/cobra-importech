import type { ReactNode } from "react";
import { COND_CHIP } from "@/lib/catalog";
import { ST_CHIP } from "@/lib/items";

export const Chip = ({ children, tone = "gray" }: { children: ReactNode; tone?: string }) => <span className={`chip ${tone}`}>{children}</span>;
export const CondChip = ({ cond }: { cond: string }) => <Chip tone={COND_CHIP[cond] ?? "gray"}>{cond}</Chip>;
export const StatusChip = ({ status }: { status: string }) => <Chip tone={ST_CHIP[status] ?? "gray"}>{status}</Chip>;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-t2 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-t3">{children}</div>;
}

/** Texto del registro de actividad: solo se interpreta <b>…</b>; el resto es texto plano. */
export function FeedText({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g).filter(Boolean);
  const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return (
    <>
      {parts.map((p, i) => (p.startsWith("<b>") ? <b key={i}>{unesc(p.slice(3, -4))}</b> : <span key={i}>{unesc(p)}</span>))}
    </>
  );
}
