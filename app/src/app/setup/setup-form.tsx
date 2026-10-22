"use client";
import { useActionState, useState } from "react";
import { setupAction } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { suggestUsername } from "@/lib/password";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  const [v, setV] = useState({ business: "", ownerName: "", ownerUser: "", ownerPass: "", devName: "", devUser: "", devPass: "" });
  const [touched, setTouched] = useState({ ownerUser: false, devUser: false });
  const set = (k: keyof typeof v, x: string) => setV((o) => {
    const n = { ...o, [k]: x };
    if (k === "ownerName" && !touched.ownerUser) n.ownerUser = suggestUsername(x);
    if (k === "devName" && !touched.devUser) n.devUser = suggestUsername(x);
    return n;
  });
  const txt = (k: keyof typeof v, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="lb" htmlFor={k}>{label}</label><input id={k} name={k} value={v[k]} onChange={(e) => { if (k === "ownerUser" || k === "devUser") setTouched({ ...touched, [k]: true }); set(k, e.target.value); }} {...extra} /></div>
  );
  return (
    <form action={action} className="space-y-4">
      {txt("business", "Nombre del negocio", { required: true, placeholder: "Importech" })}
      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-[13px] font-semibold">Propietario/a (administrador)</legend>
        {txt("ownerName", "Nombre", { required: true })}
        {txt("ownerUser", "Usuario para entrar", { required: true, autoCapitalize: "none", autoComplete: "username" })}
        <PasswordInput id="ownerPass" name="ownerPass" label="Contraseña" autoComplete="new-password" value={v.ownerPass} onChange={(x) => set("ownerPass", x)} strength ctx={{ name: v.ownerName, username: v.ownerUser, business: v.business }} />
        <PasswordInput id="ownerPass2" name="ownerPass2" label="Repite la contraseña" autoComplete="new-password" />
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-[13px] font-semibold">Desarrollador (opcional)</legend>
        {txt("devName", "Nombre")}
        {v.devName && <>
          {txt("devUser", "Usuario", { autoCapitalize: "none" })}
          <PasswordInput id="devPass" name="devPass" label="Contraseña" autoComplete="new-password" value={v.devPass} onChange={(x) => set("devPass", x)} strength ctx={{ name: v.devName, username: v.devUser, business: v.business }} />
        </>}
      </fieldset>
      {state?.error && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{state.error}</p>}
      <button className="btn primary w-full" disabled={pending}>{pending ? "Creando…" : "Crear mi tienda"}</button>
    </form>
  );
}
