import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { getMe } from "@/server/auth";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

/** Mi cuenta: cambiar la contraseña. Fuera del menú principal para que funcione también con una contraseña temporal. */
export default async function Cuenta() {
  const me = await getMe();
  if (!me) redirect("/login");
  const [cfg] = await (await getDb()).select({ name: settings.name }).from(settings).limit(1);
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-md p-6">
        {!me.mustChange && <Link href="/" className="note hover:underline">← Volver</Link>}
        <h1 className="text-xl font-bold mt-1">{me.mustChange ? "Crea tu contraseña" : "Cambiar contraseña"}</h1>
        <p className="text-t2 mt-1 mb-5">
          {me.mustChange
            ? `Hola, ${me.name.split(" ")[0]}. Tu contraseña actual es temporal (o un PIN antiguo): crea una nueva para seguir.`
            : `${me.name} · usuario «${me.username}»`}
        </p>
        <ChangePasswordForm ctx={{ name: me.name, username: me.username, business: cfg?.name }} first={me.mustChange} />
      </div>
    </main>
  );
}
