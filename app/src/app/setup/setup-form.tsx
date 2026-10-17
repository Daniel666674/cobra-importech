"use client";
import { useActionState } from "react";
import { setupAction } from "@/app/actions/auth";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  return (
    <form action={action} className="space-y-4">
      <div><label className="lb" htmlFor="business">Nombre del negocio</label><input id="business" name="business" required placeholder="Importech" /></div>
      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-[13px] font-semibold">Propietario/a (administrador)</legend>
        <div><label className="lb" htmlFor="ownerName">Nombre</label><input id="ownerName" name="ownerName" required /></div>
        <div><label className="lb" htmlFor="ownerPin">PIN (4 a 6 números)</label><input id="ownerPin" name="ownerPin" type="password" inputMode="numeric" maxLength={6} required autoComplete="new-password" /></div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-[13px] font-semibold">Desarrollador (opcional)</legend>
        <div><label className="lb" htmlFor="devName">Nombre</label><input id="devName" name="devName" /></div>
        <div><label className="lb" htmlFor="devPin">PIN</label><input id="devPin" name="devPin" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" /></div>
      </fieldset>
      {state?.error && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{state.error}</p>}
      <button className="btn primary w-full" disabled={pending}>{pending ? "Creando…" : "Crear mi tienda"}</button>
    </form>
  );
}
