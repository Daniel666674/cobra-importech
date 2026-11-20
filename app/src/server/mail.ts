import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clients, sales, settings, users } from "@/db/schema";
import { buildReceiptPdf } from "@/server/receipt-pdf";
import { esc, logFeed, type Actor } from "@/server/core";
import { fmt } from "@/lib/format";

/** El correo sale por Resend (https://resend.com). Hacen falta RESEND_API_KEY y MAIL_FROM (p. ej. "Mi tienda <ventas@mitienda.co>"). */
export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendResult = { ok: true; to: string } | { ok: false; error: string };

/** Genera el comprobante en PDF y lo envía por correo. Nunca lanza: devuelve el resultado. */
export async function sendReceiptEmail(db: Db, saleId: string, opts: { to?: string; by?: Actor | null } = {}): Promise<SendResult> {
  try {
    if (!mailConfigured()) return { ok: false, error: "El servicio de correo no está configurado todavía" };
    const [s] = await db.select().from(sales).where(eq(sales.id, saleId));
    if (!s) return { ok: false, error: "Venta no encontrada" };
    const [cfg] = await db.select().from(settings).limit(1);
    const [client] = s.client ? await db.select().from(clients).where(eq(clients.id, s.client)) : [];
    const to = (opts.to ?? client?.email ?? "").trim();
    if (!EMAIL.test(to)) return { ok: false, error: "El cliente no tiene un correo válido" };
    const [u] = await db.select().from(users).where(eq(users.id, s.by));
    const pdf = await buildReceiptPdf(s, cfg, client ?? null, u?.name ?? "—");
    const name = client?.name?.split(" ")[0] ?? "";
    const title = cfg.invTitle || "Comprobante de venta";
    const html = `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px"><h2 style="margin:0 0 8px">${esc(cfg.name)}</h2><p>Hola${name ? " " + esc(name) : ""}, gracias por tu compra.</p><p>Adjuntamos tu <b>${esc(title.toLowerCase())} ${esc(s.no)}</b> por <b>${fmt(s.total)}</b>. Guárdalo: lo necesitas para hacer efectiva la garantía.</p>${cfg.footer ? `<p style="color:#6b7280">${esc(cfg.footer)}</p>` : ""}<p style="color:#6b7280;font-size:12px">${esc([cfg.phone, cfg.email].filter(Boolean).join(" · "))}</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM, to: [to], subject: `${title} ${s.no} · ${cfg.name}`, html,
        ...(EMAIL.test(cfg.email) ? { reply_to: cfg.email } : {}),
        attachments: [{ filename: `Comprobante ${s.no}.pdf`, content: Buffer.from(pdf).toString("base64") }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    await logFeed(db, opts.by ?? null, "fe", "📧", `Comprobante <b>${esc(s.no)}</b> enviado por correo a ${esc(to)}`);
    return { ok: true, to };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await logFeed(db, opts.by ?? null, "owner", "⚠️", `No se pudo enviar por correo el comprobante de la venta ${esc(saleId)}: ${esc(msg.slice(0, 160))}`); } catch { /* sin registro */ }
    return { ok: false, error: msg };
  }
}
