"use client";
import { useActionState, useState } from "react";
import { changePasswordAction, logout } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";

export function ChangePasswordForm({ ctx, first }: { ctx: { name: string; username: string; business?: string }; first: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const [next, setNext] = useState("");
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <PasswordInput id="current" name="current" label={first ? "Contraseña temporal o PIN actual" : "Contraseña actual"} autoComplete="current-password" autoFocus />
        <PasswordInput id="next" name="next" label="Contraseña nueva" autoComplete="new-password" value={next} onChange={setNext} strength ctx={ctx} />
        <PasswordInput id="confirm" name="confirm" label="Repite la contraseña nueva" autoComplete="new-password" />
        {state?.error && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{state.error}</p>}
        <button className="btn primary w-full" disabled={pending}>{pending ? "Guardando…" : "Guardar contraseña"}</button>
        <p className="note">Al cambiarla se cierran tus sesiones abiertas en otros dispositivos.</p>
      </form>
      {first && <form action={logout}><button className="btn sm w-full">Salir</button></form>}
    </div>
  );
}
