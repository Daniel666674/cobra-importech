import Link from "next/link";
import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fmt } from "@/lib/format";
import { techSummary } from "@/server/tecnicos";
import { requireMe } from "@/server/session";
import { NewTech } from "./tech-forms";

export const dynamic = "force-dynamic";

/** Técnicos del taller y su cartera: lo que se les debe por reparaciones entregadas y lo que ya se les pagó. */
export default async function Tecnicos() {
  await requireMe("purchase");
  const db = await getDb();
  const list = await techSummary(db);
  const owed = list.reduce((a, t) => a + Math.max(0, t.balance), 0);
  return (
    <>
      <PageHeader title="Técnicos" subtitle={`${list.length} técnico${list.length !== 1 ? "s" : ""} · se les debe ${fmt(owed)}`} actions={<NewTech />} />
      <div className="card overflow-x-auto">
        {list.length === 0 ? <Empty>Aún no hay técnicos. Se crean solos al escribir su nombre en un ticket del taller, o con «Nuevo técnico».</Empty> : (
          <table className="t"><thead><tr><th>Técnico</th><th className="num">Tickets abiertos</th><th className="num">Ganado</th><th className="num">Pagado</th><th className="num">Se le debe</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id}>
                <td><Link className="font-semibold hover:underline" href={`/tecnicos/${t.id}`}>{t.name}</Link> {!t.active && <Chip tone="gray">Inactivo</Chip>}<div className="note">{t.phone}</div></td>
                <td className="num">{t.openJobs}{t.openFees > 0 && <div className="note">{fmt(t.openFees)} por ganar</div>}</td>
                <td className="num">{fmt(t.owed)}</td><td className="num">{fmt(t.paid)}</td>
                <td className="num"><b>{fmt(t.balance)}</b></td>
              </tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
