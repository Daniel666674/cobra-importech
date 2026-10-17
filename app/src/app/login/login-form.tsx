"use client";
import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth";
import { initials } from "@/lib/format";

export function LoginForm({ users }: { users: { id: string; name: string; role: string }[] }) {
  const [state, action, pending] = useActionState(login, null);
  const [sel, setSel] = useState(users[0]?.id ?? "");
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="user" value={sel} />
      <div className="grid gap-2">
        {users.map((u) => (
          <button
            type="button"
            key={u.id}
            onClick={() => setSel(u.id)}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left ${sel === u.id ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white text-xs font-bold">{initials(u.name)}</span>
            <span>
              <b className="block">{u.name}</b>
              <span className="note">{u.role}</span>
            </span>
          </button>
        ))}
      </div>
      <div>
        <label className="lb" htmlFor="pin">PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} placeholder="••••" required autoFocus />
      </div>
      {state?.error && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{state.error}</p>}
      <button className="btn primary w-full" disabled={pending || !sel}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
