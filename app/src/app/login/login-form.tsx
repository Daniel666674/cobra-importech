"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="lb" htmlFor="username">Usuario</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
      </div>
      <PasswordInput id="password" name="password" label="Contraseña" autoComplete="current-password" />
      {state?.error && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{state.error}</p>}
      <button className="btn primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      <p className="note text-center">¿Olvidaste la contraseña? Pídele al propietario/a que te la restablezca.</p>
    </form>
  );
}
