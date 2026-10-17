import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { needsSetup } from "@/server/setup";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup(await getDb()))) redirect("/login");
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-xl font-bold">Bienvenido</h1>
        <p className="text-t2 mt-1 mb-5">Configura tu tienda. Después podrás cambiar todo desde Configuración y Usuarios.</p>
        <SetupForm />
      </div>
    </main>
  );
}
