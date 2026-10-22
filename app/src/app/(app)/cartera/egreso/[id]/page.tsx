import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { allies, allyMoves, settings } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { ReceiptFrame } from "@/components/receipt";
import { fdt, fmt } from "@/lib/format";
import { inWords } from "@/lib/words";
import { requireMe } from "@/server/session";

export const dynamic = "force-dynamic";

/** Comprobante de egreso de un pago a una tienda aliada, con espacio para la firma de quien recibe. */
export default async function Egreso({ params }: PageProps<"/cartera/egreso/[id]">) {
  await requireMe("purchase");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [m] = await db.select().from(allyMoves).where(eq(allyMoves.id, id));
  if (!m || m.kind !== "pago") notFound();
  const [[x], [cfg]] = await Promise.all([db.select().from(allies).where(eq(allies.id, m.ally)), db.select().from(settings).limit(1)]);
  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between"><Link href={`/cartera/${m.ally}`} className="note hover:underline">← {x?.name ?? "Cartera"}</Link><PrintButton /></div>
      <ReceiptFrame cfg={cfg} kind="Comprobante de egreso" no={m.no || `#${m.id}`} t={m.t} stamp={m.voided ? ["ANULADO", "bad"] : ["PAGADO", "ok"]}>
        <div className="mt-5 grid gap-1 text-[13px]">
          <p><b>Pagado a:</b> {x?.name ?? "—"}{x?.doc ? ` · NIT/C.C. ${x.doc}` : ""}{x?.contact ? ` · ${x.contact}` : ""}</p>
          <p><b>Concepto:</b> {m.detail}</p>
          <p><b>Forma de pago:</b> {m.method || "—"}{m.ref ? ` · Referencia ${m.ref}` : ""}{x?.bank ? ` · Cuenta ${x.bank}` : ""}</p>
          <p><b>Fecha:</b> {fdt(m.t)} · <b>Registró:</b> {m.by}</p>
        </div>
        <div className="mt-5 text-right text-[20px] font-extrabold tabular-nums">{fmt(m.amount)}</div>
        <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-[12px] font-semibold tracking-wide text-gray-700">{inWords(m.amount)}</p>
        <div className="mt-14 grid grid-cols-2 gap-10 text-center text-[12px] text-gray-600">
          <div className="border-t border-gray-400 pt-1">Elaboró / Aprobó</div>
          <div className="border-t border-gray-400 pt-1">Recibí conforme · Firma y C.C./NIT</div>
        </div>
      </ReceiptFrame>
    </>
  );
}
