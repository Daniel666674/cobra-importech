import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { clients, sales, settings, users } from "@/db/schema";
import { PrintButton } from "@/components/print-button";
import { SaleReceipt } from "@/components/receipt";
import { receiptSigOk } from "@/server/receipt-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comprobante de venta", robots: { index: false, follow: false } };

/** Comprobante que el cliente abre desde el enlace de WhatsApp: sin sesión, protegido por la firma del enlace. */
export default async function PublicReceipt({ params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await params;
  if (!receiptSigOk(id, sig)) notFound();
  const db = await getDb();
  const [s] = await db.select().from(sales).where(eq(sales.id, id));
  if (!s) notFound();
  const [cfg] = await db.select().from(settings).limit(1);
  const [client] = s.client ? await db.select().from(clients).where(eq(clients.id, s.client)) : [];
  const [u] = await db.select().from(users).where(eq(users.id, s.by));
  return (
    <main className="mx-auto max-w-[860px] p-4">
      <div className="no-print mb-4 flex justify-end"><PrintButton label="⬇️ Guardar / imprimir PDF" /></div>
      <SaleReceipt s={s} cfg={cfg} client={client ?? null} seller={(u?.name ?? "—").split(" ")[0]} />
    </main>
  );
}
