"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createUserAction, saveRolePermsAction, updateUserAction } from "@/app/actions/admin";
import { Chip } from "@/components/ui";

type U = { id: string; name: string; role: string; active: boolean };
type R = { key: string; name: string; locked: boolean; perms: string[] };

export function UsersClient({ meId, meDev, users, roles, perms }: { meId: string; meDev: boolean; users: U[]; roles: R[]; perms: { key: string; label: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const [nu, setNu] = useState({ name: "", role: "employee", pin: "" });
  const [draft, setDraft] = useState<Record<string, string[]>>(Object.fromEntries(roles.map((r) => [r.key, r.perms])));
  const [pinFor, setPinFor] = useState<{ id: string; pin: string } | null>(null);
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { setMsg({ ok: true, t: okText }); after?.(); router.refresh(); } else setMsg({ ok: false, t: (r as { error: string }).error });
  });
  const assignable = roles.filter((r) => !r.locked || meDev);
  return (
    <div className="space-y-5">
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      <div className="card overflow-x-auto">
        <table className="t"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td><b>{u.name}</b>{u.id === meId && <span className="note"> (tú)</span>}</td>
              <td><select value={u.role} aria-label={`Rol de ${u.name}`} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value }), "Rol actualizado")}>{assignable.concat(roles.filter((r) => r.key === u.role && !assignable.includes(r))).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></td>
              <td>{u.active ? <Chip tone="ok">Activo</Chip> : <Chip tone="gray">Inactivo</Chip>}</td>
              <td className="space-x-2 whitespace-nowrap">
                <button className="btn sm" onClick={() => setPinFor(pinFor?.id === u.id ? null : { id: u.id, pin: "" })}>Cambiar PIN</button>
                <button className="btn sm" onClick={() => run(() => updateUserAction(u.id, { active: !u.active }), u.active ? "Usuario desactivado" : "Usuario activado")}>{u.active ? "Desactivar" : "Activar"}</button>
                {pinFor?.id === u.id && <span className="inline-flex gap-1"><input className="!w-24" type="password" inputMode="numeric" maxLength={6} value={pinFor.pin} onChange={(e) => setPinFor({ id: u.id, pin: e.target.value })} aria-label="Nuevo PIN" placeholder="Nuevo PIN" /><button className="btn sm primary" disabled={busy} onClick={() => run(() => updateUserAction(u.id, { pin: pinFor.pin }), `PIN de ${u.name} actualizado`, () => setPinFor(null))}>Guardar</button></span>}
              </td></tr>))}</tbody></table>
      </div>
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Nuevo usuario</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_auto] items-end">
          <div><label className="lb" htmlFor="nu-n">Nombre</label><input id="nu-n" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></div>
          <div><label className="lb" htmlFor="nu-r">Rol</label><select id="nu-r" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></div>
          <div><label className="lb" htmlFor="nu-p">PIN (4 a 6 números)</label><input id="nu-p" type="password" inputMode="numeric" maxLength={6} value={nu.pin} onChange={(e) => setNu({ ...nu, pin: e.target.value })} autoComplete="new-password" /></div>
          <button className="btn primary" disabled={busy} onClick={() => run(() => createUserAction(nu), "Usuario creado", () => setNu({ name: "", role: "employee", pin: "" }))}>Crear</button>
        </div>
      </div>
      <div className="card overflow-x-auto p-4">
        <h2 className="font-semibold mb-1">Permisos por rol</h2>
        <p className="note mb-3">El rol de {roleName("dev")} tiene siempre todos los permisos y no se puede editar.</p>
        <table className="t"><thead><tr><th>Permiso</th>{roles.map((r) => <th key={r.key} className="text-center">{r.name}</th>)}</tr></thead>
          <tbody>{perms.filter((p) => p.key !== "dev" || meDev).map((p) => (
            <tr key={p.key}><td>{p.label}</td>{roles.map((r) => (
              <td key={r.key} className="text-center"><input type="checkbox" className="!w-auto" disabled={r.locked} aria-label={`${p.label} · ${r.name}`} checked={r.locked || (draft[r.key] ?? []).includes(p.key)}
                onChange={(e) => setDraft({ ...draft, [r.key]: e.target.checked ? [...(draft[r.key] ?? []), p.key] : (draft[r.key] ?? []).filter((x) => x !== p.key) })} /></td>))}</tr>))}</tbody></table>
        <div className="mt-3 flex flex-wrap gap-2">{roles.filter((r) => !r.locked).map((r) => <button key={r.key} className="btn primary" disabled={busy} onClick={() => run(() => saveRolePermsAction(r.key, draft[r.key] ?? []), `Permisos de ${r.name} guardados`)}>Guardar permisos de {r.name}</button>)}</div>
      </div>
    </div>
  );
}
