import type { ReactNode } from "react";
import type { clients, sales, settings } from "@/db/schema";
import { fdatey, fmt, ftime } from "@/lib/format";
import { lineNet, warrEnd } from "@/lib/sales";
import { inWords } from "@/lib/words";

type Sale = typeof sales.$inferSelect;
type Cfg = typeof settings.$inferSelect;
type Client = typeof clients.$inferSelect;

export const WARR_TERMS = [
  "La garantía cubre defectos de funcionamiento y de fabricación durante la vigencia indicada para cada producto.",
  "No cubre golpes, caídas, humedad, pantallas rotas, modificaciones de software ni reparaciones hechas por terceros.",
  "Para hacerla efectiva presenta este comprobante y el equipo con su serial/IMEI, sin alteraciones.",
  "Equipos reacondicionados, pre-owned y usados tienen la garantía del establecimiento indicada en este documento.",
  "Los accesorios se cambian solo por defecto de fábrica, en su empaque original cuando aplique.",
];

export function ReceiptFrame({ cfg, kind, no, t, stamp, children, plainFooter }: { cfg: Cfg; kind: string; no: string; t: number; stamp?: [string, "ok" | "bad" | "warn"]; children: ReactNode; plainFooter?: boolean }) {
  const tone = { ok: "text-green-700 border-green-700", bad: "text-red-700 border-red-700", warn: "text-amber-700 border-amber-700" };
  return (
    <article className="mx-auto max-w-[820px] overflow-hidden rounded-xl border border-line bg-white text-[#111827] shadow-sm print:shadow-none print:border-0" style={{ colorScheme: "light" }}>
      <div className="h-2" style={{ background: cfg.brand }} />
      <div className="p-7">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cfg.logo || "/logo.png"} alt={`Logo de ${cfg.name}`} className="h-20 w-20 rounded-lg object-contain" />
            <div className="text-[12px] leading-relaxed text-gray-600">
              <b className="block text-[16px] text-gray-900">{cfg.name}</b>
              {[cfg.legal, cfg.nit && `NIT ${cfg.nit}`].filter(Boolean).join(" · ")}
              {cfg.taxNote && <><br />{cfg.taxNote}</>}
              <br />{[cfg.address, cfg.city].filter(Boolean).join(", ")}
              <br />{[cfg.phone, cfg.whatsapp && `WhatsApp ${cfg.whatsapp}`, cfg.email].filter(Boolean).join(" · ")}
              {(cfg.web || cfg.instagram) && <><br />{[cfg.web, cfg.instagram && `@${cfg.instagram}`].filter(Boolean).join(" · ")}</>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{kind}</div>
            <div className="text-2xl font-extrabold tabular-nums">{no}</div>
            <div className="text-[12px] text-gray-600">{fdatey(t)} · {ftime(t)}</div>
            {stamp && <span className={`mt-1 inline-block rounded border-2 px-2 py-0.5 text-[11px] font-extrabold tracking-wider ${tone[stamp[1]]}`}>{stamp[0]}</span>}
          </div>
        </header>
        {children}
        {!plainFooter && <footer className="mt-7 border-t border-gray-200 pt-3 text-center text-[11.5px] text-gray-500">
          {cfg.footer}
          {cfg.legalNote && <span className="mt-1 block whitespace-pre-line">{cfg.legalNote}</span>}
          <i className="mt-1 block">Comprobante interno de venta. No reemplaza la factura electrónica DIAN. Valores en pesos colombianos (COP).</i>
        </footer>}
      </div>
    </article>
  );
}

const Card = ({ title, rows }: { title: string; rows: [string, string][] }) => (
  <div className="rounded-lg border border-gray-200 p-3 text-[12.5px]">
    <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">{title}</h4>
    {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-0.5"><span className="text-gray-500">{k}</span><span className="text-right">{v}</span></div>)}
  </div>
);

export function SaleReceipt({ s, cfg, client, seller }: { s: Sale; cfg: Cfg; client: Client | null; seller: string }) {
  const voided = s.lines.every((l) => lineNet(l) <= 0);
  const subtotal = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const discAmt = Math.max(0, subtotal - s.total);
  const pays = s.payments.length ? s.payments : [{ method: s.method, amount: s.total - s.prepaid }];
  const holdPaid = (s.holdPays ?? []).reduce((a, y) => a + y.amount, 0);
  const paidNow = pays.reduce((a, p) => a + p.amount + (p.fee ?? 0), 0) + holdPaid;
  return (
    <ReceiptFrame cfg={cfg} kind={cfg.invTitle || "Comprobante de venta"} no={s.no} t={s.t} stamp={voided ? ["DEVUELTA", "bad"] : s.mode === "historico" ? ["HISTÓRICA", "warn"] : ["PAGADA", "ok"]}>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card title="Cliente" rows={[["Nombre", client?.name ?? "Cliente de mostrador"], ["Documento", client?.doc ?? ""], ["Teléfono", client?.phone ?? ""], ["Dirección", client?.address ?? ""], ["Correo", client?.email ?? ""]]} />
        <Card title="Detalles de la venta" rows={[["Atendió", seller], ["Forma de pago", s.method], ["Descuento", s.disc ? `${+s.disc.toFixed(1)}%${s.discReason ? " · " + s.discReason : ""}` : ""], ["Observaciones", s.notes]]} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead><tr className="border-b-2 border-gray-300 text-left text-[10.5px] uppercase tracking-wider text-gray-500"><th className="py-2 pr-2">#</th><th>Descripción</th><th>Serial / IMEI</th><th className="text-right">Cant.</th><th className="text-right">Vr. unitario</th><th className="text-right">Total</th><th className="pl-3">Garantía</th></tr></thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i} className={`border-b border-gray-100 align-top ${lineNet(l) <= 0 ? "text-gray-400 line-through" : ""}`}>
                <td className="py-2 pr-2">{i + 1}</td>
                <td><b>{l.name}</b><small className="block text-gray-500">{[l.color, l.cond, l.batt != null ? `Batería ${l.batt}%` : ""].filter(Boolean).join(" · ")}</small></td>
                <td className="font-mono text-[11.5px]">{l.serial || "—"}{l.serial2 && <span className="block">{l.serial2}</span>}</td>
                <td className="text-right">{l.qty}{l.ret ? <small className="block">dev. {l.ret}</small> : null}</td>
                <td className="text-right tabular-nums">{fmt(l.price)}</td>
                <td className="text-right font-bold tabular-nums">{fmt(l.price * l.qty)}</td>
                <td className="pl-3">{l.warr ? <>{l.warr} {l.warr === 1 ? "mes" : "meses"}<small className="block text-gray-500">hasta {fdatey(warrEnd(s.t, l))}</small></> : <small>Sin garantía</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.tradeins?.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 p-3 text-[12.5px]">
          <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">Equipo recibido como parte de pago</h4>
          {s.tradeins.map((t) => (
            <div key={t.item} className="flex justify-between gap-3 py-0.5">
              <span><b>{t.name}</b> · {t.cond}{t.serial && <span className="font-mono text-[11.5px]"> · {t.serial}</span>}</span>
              <span className="tabular-nums font-semibold">{fmt(t.amount)}</span>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-gray-500">El cliente declara ser el propietario legítimo del equipo entregado y que no tiene reporte de hurto ni bloqueo.</p>
        </div>
      )}
      <div className="mt-5 grid gap-5 sm:grid-cols-[1.2fr_1fr]">
        <div className="text-[11.5px] text-gray-600">
          <h4 className="mb-1 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">Condiciones de garantía</h4>
          <ul className="list-disc space-y-1 pl-4">{(cfg.warrTerms?.length ? cfg.warrTerms : WARR_TERMS).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmt(subtotal)}</span></div>
          {discAmt > 0 && <div className="flex justify-between"><span>Descuento</span><span className="tabular-nums">−{fmt(discAmt)}</span></div>}
          <div className="flex justify-between border-y-2 border-gray-900 py-1.5 text-[17px] font-extrabold"><span>TOTAL</span><span className="tabular-nums">{fmt(s.total)}</span></div>
          {holdPaid > 0 && <div className="flex justify-between"><span>Abonos del apartado ({s.holdPays!.length})</span><span className="tabular-nums">{fmt(holdPaid)}</span></div>}
          {(s.surcharge ?? 0) > 0 && <div className="flex justify-between"><span>Recargo por forma de pago</span><span className="tabular-nums">{fmt(s.surcharge)}</span></div>}
          {pays.map((p, i) => <div key={i} className="flex justify-between"><span>{p.method}{p.fee ? ` (incluye recargo ${fmt(p.fee)})` : ""}</span><span className="tabular-nums">{fmt(p.amount + (p.fee ?? 0))}</span></div>)}
          {s.cash && <div className="flex justify-between"><span>Efectivo recibido · cambio</span><span className="tabular-nums">{fmt(s.cash.given)} · {fmt(s.cash.change)}</span></div>}
          <div className="flex justify-between border-t border-gray-200 pt-2 font-bold"><span>Total pagado</span><span className="tabular-nums">{fmt(paidNow)}</span></div>
          {s.pending > 0 && <div className="flex justify-between font-bold text-red-700"><span>Saldo pendiente</span><span className="tabular-nums">{fmt(s.pending)}</span></div>}
        </div>
      </div>
      <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-[12px] font-semibold tracking-wide text-gray-700">{inWords(s.total)}</p>
      {cfg.showSignatures !== false && <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[11.5px] text-gray-500">
        <div className="border-t border-gray-400 pt-1">Firma del cliente</div>
        <div className="border-t border-gray-400 pt-1">Firma autorizada · {seller.split(" ")[0]}</div>
      </div>}
    </ReceiptFrame>
  );
}
