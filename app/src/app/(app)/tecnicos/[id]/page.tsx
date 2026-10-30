import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdt, fmt } from "@/lib/format";
import { techDetail } from "@/server/tecnicos";
import { requireMe } from "@/server/session";
import { PayTech, VoidPay } from "../tech-forms";

export const dynamic = "force-dynamic";

export default async function TecnicoDetalle({ params }: PageProps<"/tecnicos/[id]">) {
  await requireMe("purchase");
  const { id } = await params;
  const d = await techDetail(await getDb(), id);
  if (!d) notFound();
  return (
    <>
      <div className="mb-3"><Link href="/tecnicos" className="note hover:underline">← Técnicos</Link></div>
      <PageHeader title={d.tech.name} subtitle={`${d.tech.phone || "Sin celular"} · se le debe ${fmt(d.balance)}`} />
      <div className="mb-4"><PayTech id={d.tech.id} balance={d.balance} /></div>
      <div className="card overflow-x-auto">
        <h2 className="px-4 pt-3 font-semibold">Movimientos</h2>
        {d.moves.length === 0 ? <Empty>Aún no hay movimientos. Cada reparación entregada le suma lo que se acordó pagarle.</Empty> : (
          <table className="t"><thead><tr><th>Fecha</th><th>Detalle</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>{d.moves.map((m) => (
              <tr key={m.id} className={m.voided ? "opacity-50 line-through" : ""}>
                <td className="whitespace-nowrap">{fdt(m.t)}</td>
                <td>{m.kind === "deuda" ? <><b>{m.ref}</b> · {m.detail}</> : <>Pago · {m.method}{m.detail ? ` · ${m.detail}` : ""}</>}<div className="note">{m.by}</div></td>
                <td className="num">{m.kind === "deuda" ? <Chip tone="warn">+ {fmt(m.amount)}</Chip> : <Chip tone="ok">− {fmt(m.amount)}</Chip>}</td>
                <td>{m.kind === "pago" && !m.voided ? <VoidPay id={m.id} /> : null}</td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
