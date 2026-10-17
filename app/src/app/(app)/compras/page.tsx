import { getDb } from "@/db";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { fdate, fmt } from "@/lib/format";
import { landed } from "@/lib/landed";
import { listPurchases } from "@/server/ops";
import { requireMe } from "@/server/session";
import { PurchaseForm, ReceiveForm } from "./purchase-forms";
import { settings } from "@/db/schema";

export default async function Compras() {
  await requireMe("purchase");
  const db = await getDb();
  const [rows, [cfg]] = await Promise.all([listPurchases(db), db.select().from(settings).limit(1)]);
  return (
    <>
      <PageHeader title="Compras e importaciones" subtitle="Costo real de cada lote: USD × TRM + flete + aranceles + IVA" />
      <PurchaseForm trm={cfg.trm} />
      <div className="card mt-4 overflow-x-auto">
        {rows.length === 0 ? <Empty>Aún no hay compras registradas.</Empty> : (
          <table className="t"><thead><tr><th>Lote</th><th>Proveedor</th><th className="num">Uds.</th><th className="num">USD / u.</th><th className="num">TRM</th><th className="num">Costo real / u.</th><th>Estado</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td><b>{p.id}</b><div className="note">{fdate(p.t)} · {p.desc}</div></td><td>{p.sup}</td><td className="num">{p.qty}</td><td className="num">${p.usd.toLocaleString("es-CO")}</td><td className="num">{p.trm.toLocaleString("es-CO")}</td><td className="num"><b>{fmt(landed(p).unit)}</b></td>
                <td><Chip tone={p.st === "Recibido" ? "ok" : "info"}>{p.st}</Chip></td><td>{p.st !== "Recibido" && <ReceiveForm po={p.id} />}</td></tr>))}</tbody></table>
        )}
      </div>
    </>
  );
}
