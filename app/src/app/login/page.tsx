import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { getMe } from "@/server/auth";
import { needsSetup } from "@/server/setup";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getMe()) redirect("/");
  const db = await getDb();
  if (await needsSetup(db)) redirect("/setup");
  const [cfg] = await db.select().from(settings).limit(1);
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cfg?.logo || "/logo.png"} alt="" className="h-11 w-11 rounded-lg object-contain bg-white border border-line" />
          <div>
            <h1 className="text-lg font-bold leading-tight">{cfg?.name ?? "Importech"}</h1>
            <p className="note">Inventario, ventas y garantías</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
