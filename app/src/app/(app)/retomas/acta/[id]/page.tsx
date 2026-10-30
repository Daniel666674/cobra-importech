import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { items, settings } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { ReceiptFrame } from "@/components/receipt";
import { fdate, fdatey, fmt } from "@/lib/format";
import { uname } from "@/lib/items";
import { inWords } from "@/lib/words";
import { requireMe } from "@/server/session";

export const dynamic = "force-dynamic";

/** Acta de compra de un equipo usado: datos de quien lo entrega, del equipo, valor pagado y declaración de propiedad. */
export default async function Acta({ params }: PageProps<"/retomas/acta/[id]">) {
  await requireMe("tradein");
  const { id } = await params;
  const db = await getDb();
  const [it] = await db.select().from(items).where(eq(items.id, id));
  if (!it?.seller) notFound();
  const [cfg] = await db.select().from(settings).limit(1);
  const s = it.seller;
  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between"><Link href={`/inventario/${it.id}`} className="note hover:underline">← {uname(it)}</Link><PrintButton /></div>
      <ReceiptFrame cfg={cfg} kind="Acta de compra de equipo usado" no={it.id} t={s.t} stamp={["RETOMA", "warn"]} plainFooter>
        <div className="mt-5 grid gap-1 text-[13px]">
          <p><b>Vendedor:</b> {s.name || "—"} · <b>{s.docType}</b> {s.doc || "—"}{s.phone ? ` · Cel. ${s.phone}` : ""}</p>
          {s.address && <p><b>Dirección:</b> {s.address}</p>}
          <p><b>Equipo:</b> {uname(it)}{it.color ? ` · ${it.color}` : ""} · {it.cond}{it.batt != null ? ` · Batería ${it.batt}%` : ""}</p>
          <p><b>IMEI / serial:</b> <span className="font-mono">{it.serial || "—"}</span>{it.serial2 ? <span className="font-mono"> · {it.serial2}</span> : ""}</p>
          <p><b>Valor pagado:</b> {fmt(it.cost)} <span className="text-gray-600">({inWords(it.cost)})</span></p>
          <p><b>Fecha:</b> {fdatey(s.t)} · <b>Recibió:</b> {s.by}</p>
        </div>
        <div className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-gray-800">
          <p>El vendedor declara bajo la gravedad de juramento que: (1) es el propietario legítimo del equipo descrito y puede disponer libremente de él; (2) el equipo no es producto de hurto, robo ni de ningún otro delito, y no tiene reporte de pérdida ni de robo; (3) no está bloqueado por iCloud / «Buscar mi iPhone» ni por el operador, y no tiene gravámenes, embargos ni deudas pendientes; (4) los datos que suministra son ciertos.</p>
          <p>{cfg.name} paga el valor indicado y recibe el equipo en el estado descrito. Si lo declarado resulta falso, el vendedor responde por los perjuicios y se pondrá la información a disposición de las autoridades. {s.idCopy ? "Se anexa copia del documento de identidad del vendedor." : "No se anexó copia del documento de identidad."}</p>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[11.5px] text-gray-600">
          <div className="border-t border-gray-400 pt-1">Firma y huella del vendedor<br />{s.docType} {s.doc}</div>
          <div className="border-t border-gray-400 pt-1">Por {cfg.name}<br />{s.by}</div>
        </div>
        <p className="mt-6 text-[10.5px] text-gray-500">Modelo de referencia, elaborado el {fdate(Date.now())}. Pídele a tu abogado que lo revise y lo ajuste a tu negocio.</p>
      </ReceiptFrame>
    </>
  );
}
