import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { clients, sales, settings } from "@/db/schema";
import { fdatey, fmt, ftime } from "@/lib/format";
import { lineNet, warrEnd } from "@/lib/sales";
import { inWords } from "@/lib/words";
import { WARR_TERMS } from "@/components/receipt";

type Sale = typeof sales.$inferSelect;
type Cfg = typeof settings.$inferSelect;
type Client = typeof clients.$inferSelect;

/** Solo caracteres que las fuentes estándar del PDF pueden dibujar (Latin-1). */
const clean = (s: string) =>
  String(s ?? "").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[   ]/g, " ").replace(/[^\x20-\x7E¡-ÿ]/g, "");

function hex(h: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  const n = m ? parseInt(m[1], 16) : 0x1f2937;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function loadLogo(doc: PDFDocument, src: string): Promise<PDFImage | null> {
  try {
    if (src.startsWith("data:image/png;base64,")) return await doc.embedPng(Buffer.from(src.split(",")[1], "base64"));
    if (/^data:image\/jpe?g;base64,/.test(src)) return await doc.embedJpg(Buffer.from(src.split(",")[1], "base64"));
    const f = path.join(process.cwd(), "public", "logo.png");
    if (!src && fs.existsSync(f)) return await doc.embedPng(fs.readFileSync(f));
  } catch { /* sin logo */ }
  return null;
}

/** Comprobante de venta en PDF (A4), generado en el servidor: liviano y sin depender del dispositivo. */
export async function buildReceiptPdf(s: Sale, cfg: Cfg, client: Client | null, seller: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${cfg.invTitle || "Comprobante de venta"} ${s.no}`);
  doc.setAuthor(cfg.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(doc, cfg.logo || "");
  const W = 595, H = 842, M = 40, brand = hex(cfg.brand);
  const gray = rgb(0.42, 0.45, 0.5), dark = rgb(0.07, 0.09, 0.15), line = rgb(0.85, 0.87, 0.9);
  let page!: PDFPage, y = 0;
  const newPage = () => { page = doc.addPage([W, H]); page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: brand }); y = H - 40; };
  const need = (h: number) => { if (y - h < 50) newPage(); };
  const text = (t: string, x: number, yy: number, size = 9, f: PDFFont = font, color = dark) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const right = (t: string, xr: number, yy: number, size = 9, f: PDFFont = font, color = dark) => { const c = clean(t); page.drawText(c, { x: xr - f.widthOfTextAtSize(c, size), y: yy, size, font: f, color }); };
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = []; let cur = "";
    for (const w of clean(t).split(/\s+/).filter(Boolean)) {
      const test = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur); cur = w; } else cur = test;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };

  newPage();
  // Encabezado
  let hx = M;
  if (logo) { const k = Math.min(54 / logo.width, 54 / logo.height); page.drawImage(logo, { x: M, y: y - 54 + 6, width: logo.width * k, height: logo.height * k }); hx = M + 64; }
  text(cfg.name, hx, y - 12, 14, bold);
  const head = [[cfg.legal, cfg.nit && `NIT ${cfg.nit}`].filter(Boolean).join(" · "), cfg.taxNote, [cfg.address, cfg.city].filter(Boolean).join(", "), [cfg.phone, cfg.whatsapp && `WhatsApp ${cfg.whatsapp}`, cfg.email].filter(Boolean).join(" · "), [cfg.web, cfg.instagram && `@${cfg.instagram}`].filter(Boolean).join(" · ")].filter(Boolean);
  head.forEach((l, i) => text(l, hx, y - 26 - i * 11, 8, font, gray));
  right((cfg.invTitle || "Comprobante de venta").toUpperCase(), W - M, y - 8, 8, bold, gray);
  right(s.no, W - M, y - 28, 20, bold);
  right(`${fdatey(s.t)} - ${ftime(s.t)}`, W - M, y - 42, 9, font, gray);
  const voided = s.lines.every((l) => lineNet(l) <= 0);
  const stamp = voided ? "DEVUELTA" : s.mode === "historico" ? "HISTORICA" : s.pending > 0 ? "CON SALDO PENDIENTE" : "PAGADA";
  const sc = voided ? rgb(0.75, 0.1, 0.1) : s.pending > 0 ? rgb(0.7, 0.4, 0) : rgb(0.05, 0.5, 0.2);
  const sw = bold.widthOfTextAtSize(stamp, 9) + 14;
  page.drawRectangle({ x: W - M - sw, y: y - 66, width: sw, height: 16, borderColor: sc, borderWidth: 1.5 });
  right(stamp, W - M - 7, y - 61, 9, bold, sc);
  y -= Math.max(78, 26 + head.length * 11 + 12);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: line });
  y -= 18;

  // Cliente y detalles
  const box = (x: number, w: number, title: string, rows: [string, string][]) => {
    const r = rows.filter(([, v]) => v);
    const h = 22 + r.length * 12;
    page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: line, borderWidth: 0.8 });
    text(title.toUpperCase(), x + 8, y - 13, 7.5, bold, gray);
    r.forEach(([k, v], i) => { text(k, x + 8, y - 26 - i * 12, 8.5, font, gray); right(v.length > 42 ? v.slice(0, 41) + "." : v, x + w - 8, y - 26 - i * 12, 8.5); });
    return h;
  };
  const half = (W - 2 * M - 12) / 2;
  const h1 = box(M, half, "Cliente", [["Nombre", client?.name ?? "Cliente de mostrador"], ["Documento", client?.doc ?? ""], ["Telefono", client?.phone ?? ""], ["Direccion", client?.address ?? ""], ["Correo", client?.email ?? ""]]);
  const h2 = box(M + half + 12, half, "Detalles de la venta", [["Atendio", seller], ["Forma de pago", s.method], ["Descuento", s.disc ? `${+s.disc.toFixed(1)}%${s.discReason ? " - " + s.discReason : ""}` : ""], ["Observaciones", s.notes]]);
  y -= Math.max(h1, h2) + 16;

  // Tabla de productos
  const X = { n: M, d: M + 14, s: M + 176, q: M + 272, u: M + 336, t: M + 398, g: M + 410 };
  const heads = () => {
    need(30);
    text("#", X.n, y, 7.5, bold, gray); text("DESCRIPCION", X.d, y, 7.5, bold, gray); text("SERIAL / IMEI", X.s, y, 7.5, bold, gray);
    right("CANT.", X.q, y, 7.5, bold, gray); right("VR. UNIT.", X.u, y, 7.5, bold, gray); right("TOTAL", X.t, y, 7.5, bold, gray); text("GARANTIA", X.g, y, 7.5, bold, gray);
    y -= 5; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.7, 0.72, 0.76) }); y -= 12;
  };
  heads();
  s.lines.forEach((l, i) => {
    const dl = wrap(l.name, bold, 9, 156);
    const sub = [l.color, l.cond, l.sim, l.batt != null ? `Bateria ${l.batt}%` : ""].filter(Boolean).join(" - ");
    const sl = wrap(sub, font, 7.5, 156);
    const ser = [l.serial || "-", l.serial2 || ""].filter(Boolean);
    const rowH = Math.max(dl.length * 11 + sl.length * 9, ser.length * 10) + 14;
    if (y - rowH < 60) { newPage(); heads(); }
    const dim = lineNet(l) <= 0 ? gray : dark;
    text(String(i + 1), X.n, y, 8.5, font, dim);
    dl.forEach((t, k) => text(t, X.d, y - k * 11, 9, bold, dim));
    sl.forEach((t, k) => text(t, X.d, y - dl.length * 11 - k * 9 + 2, 7.5, font, gray));
    ser.forEach((t, k) => text(t, X.s, y - k * 10, 8, font, dim));
    right(String(l.qty) + (l.ret ? ` (dev. ${l.ret})` : ""), X.q, y, 8.5, font, dim);
    right(fmt(l.price), X.u, y, 8.5, font, dim);
    right(fmt(l.price * l.qty), X.t, y, 8.5, bold, dim);
    if (l.warr) { text(`${l.warr} ${l.warr === 1 ? "mes" : "meses"}`, X.g, y, 8.5, font, dim); text(`hasta ${fdatey(warrEnd(s.t, l))}`, X.g, y - 9, 6.5, font, gray); } else text("Sin garantia", X.g, y, 8, font, gray);
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.4, color: line });
  });
  y -= 8;

  // Retomas
  if (s.tradeins?.length) {
    need(30 + s.tradeins.length * 12);
    text("EQUIPO RECIBIDO COMO PARTE DE PAGO", M, y, 7.5, bold, gray); y -= 13;
    for (const t of s.tradeins) { text(`${t.name} - ${t.cond}${t.serial ? " - " + t.serial : ""}`, M, y, 8.5); right(fmt(t.amount), W - M, y, 8.5, bold); y -= 12; }
    y -= 6;
  }

  // Totales (derecha) y garantía (izquierda)
  const subtotal = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const discAmt = Math.max(0, subtotal - s.total);
  const pays = s.payments.length ? s.payments : [{ method: s.method, amount: s.total - s.prepaid } as (typeof s.payments)[number]];
  const holdPaid = (s.holdPays ?? []).reduce((a, p) => a + p.amount, 0);
  const paidNow = pays.reduce((a, p) => a + p.amount + (p.fee ?? 0), 0) + holdPaid;
  const rowsT: [string, string, boolean?][] = [["Subtotal", fmt(subtotal)]];
  if (discAmt > 0) rowsT.push(["Descuento", "-" + fmt(discAmt)]);
  rowsT.push(["TOTAL", fmt(s.total), true]);
  if (holdPaid > 0) rowsT.push([`Abonos del apartado (${s.holdPays!.length})`, fmt(holdPaid)]);
  if ((s.surcharge ?? 0) > 0) rowsT.push(["Recargo por forma de pago", fmt(s.surcharge)]);
  for (const p of pays) rowsT.push([`${p.method}${p.bank ? " - " + p.bank : ""}${p.fee ? ` (incl. recargo ${fmt(p.fee)})` : ""}`, fmt(p.amount + (p.fee ?? 0))]);
  rowsT.push(["Total pagado", fmt(paidNow)]);
  if (s.pending > 0) rowsT.push(["Saldo pendiente", fmt(s.pending)]);
  const terms = (cfg.warrTerms?.length ? cfg.warrTerms : WARR_TERMS).flatMap((t) => wrap(t, font, 7.5, 255).map((ln, k) => (k === 0 ? "- " : "  ") + ln));
  const blockH = Math.max(rowsT.length * 14 + 6, 14 + terms.length * 9.5);
  need(blockH + 60);
  text("CONDICIONES DE GARANTIA", M, y, 7.5, bold, gray);
  terms.forEach((t, i) => text(t, M, y - 13 - i * 9.5, 7.5, font, gray));
  const tx = W - M - 220;
  let ty = y;
  for (const [k, v, big] of rowsT) {
    if (big) { page.drawLine({ start: { x: tx, y: ty + 11 }, end: { x: W - M, y: ty + 11 }, thickness: 1.2, color: dark }); }
    text(k.length > 38 ? k.slice(0, 37) + "." : k, tx, ty, big ? 11 : 8.5, big ? bold : font);
    right(v, W - M, ty, big ? 11 : 8.5, bold, k === "Saldo pendiente" ? rgb(0.75, 0.1, 0.1) : dark);
    if (big) page.drawLine({ start: { x: tx, y: ty - 5 }, end: { x: W - M, y: ty - 5 }, thickness: 1.2, color: dark });
    ty -= big ? 17 : 14;
  }
  y -= blockH + 10;

  need(60);
  page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 20, color: rgb(0.96, 0.96, 0.97) });
  text(inWords(s.total), M + 8, y - 10, 8.5, bold, rgb(0.25, 0.27, 0.32));
  y -= 40;
  if (cfg.showSignatures !== false) {
    need(60); y -= 20;
    page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.7, color: gray });
    page.drawLine({ start: { x: W - M - 220, y }, end: { x: W - M, y }, thickness: 0.7, color: gray });
    text("Firma del cliente", M + 70, y - 11, 8, font, gray);
    text(`Firma autorizada - ${seller.split(" ")[0]}`, W - M - 175, y - 11, 8, font, gray);
    y -= 30;
  }
  need(50);
  const foot = [cfg.footer, cfg.legalNote, "Comprobante interno de venta. No reemplaza la factura electronica DIAN. Valores en pesos colombianos (COP)."].filter(Boolean);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line }); y -= 12;
  for (const f of foot) for (const ln of wrap(f, font, 7.5, W - 2 * M)) { const c = clean(ln); text(ln, (W - font.widthOfTextAtSize(c, 7.5)) / 2, y, 7.5, font, gray); y -= 10; }
  return doc.save();
}
