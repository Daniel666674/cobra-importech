"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createUserAction, saveRolePermsAction, updateUserAction } from "@/app/actions/admin";
import { Chip } from "@/components/ui";
import { suggestUsername } from "@/lib/password";

type U = { id: string; name: string; username: string; role: string; active: boolean; mustChange: boolean };
type R = { key: string; name: string; locked: boolean; perms: string[] };

export function UsersClient({ meId, meDev, users, roles, perms }: { meId: string; meDev: boolean; users: U[]; roles: R[]; perms: { key: string; label: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const [nu, setNu] = useState({ name: "", username: "", role: "employee" });
  const [userTouched, setUserTouched] = useState(false);
  const [temp, setTemp] = useState<{ name: string; username: string; pw: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, string[]>>(Object.fromEntries(roles.map((r) => [r.key, r.perms])));
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.ok) { setMsg({ ok: true, t: okText }); after?.(); router.refresh(); } else setMsg({ ok: false, t: (r as { error: string }).error });
  });
  const assignable = roles.filter((r) => !r.locked || meDev);
  return (
    <div className="space-y-5">
      {msg && <p role="status" className={`chip ${msg.ok ? "ok" : "bad"} !rounded-md !whitespace-normal`}>{msg.t}</p>}
      {temp && (
        <div role="alert" className="card border-2 !border-amber-500 p-4">
          <h2 className="font-semibold">Contraseña temporal de {temp.name}</h2>
          <p className="note mb-2">Entrégasela en persona. Se muestra <b>solo esta vez</b>; al entrar, el sistema le pedirá crear la suya.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span>Usuario: <b className="mono">{temp.username}</b></span>
            <span>Contraseña: <b className="mono text-lg tracking-wider select-all" data-temp-password>{temp.pw}</b></span>
            <button className="btn sm" onClick={() => navigator.clipboard?.writeText(temp.pw)}>Copiar</button>
            <button className="btn sm" onClick={() => setTemp(null)}>Ya la entregué</button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="t"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}><td><b>{u.name}</b>{u.id === meId && <span className="note"> (tú)</span>}</td><td className="mono">{u.username}</td>
              <td><select value={u.role} aria-label={`Rol de ${u.name}`} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value }), "Rol actualizado")}>{assignable.concat(roles.filter((r) => r.key === u.role && !assignable.includes(r))).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></td>
              <td>{u.active ? <Chip tone="ok">Activo</Chip> : <Chip tone="gray">Inactivo</Chip>}{u.active && u.mustChange && <Chip tone="warn">Contraseña temporal</Chip>}</td>
              <td className="space-x-2 whitespace-nowrap">
                {u.id === meId ? <a className="btn sm" href="/cuenta">Cambiar mi contraseña</a> : (
                  <button className="btn sm" disabled={busy} onClick={() => { if (confirm(`¿Restablecer la contraseña de ${u.name}? Se cerrarán sus sesiones y tendrá que crear una nueva al entrar.`)) start(async () => {
                    const r = await updateUserAction(u.id, { resetPassword: true });
                    if (!r.ok) return setMsg({ ok: false, t: r.error });
                    setMsg(null); setTemp({ name: u.name, username: u.username, pw: r.data.temp! }); router.refresh();
                  }); }}>Restablecer contraseña</button>
                )}
                <button className="btn sm" onClick={() => run(() => updateUserAction(u.id, { active: !u.active }), u.active ? "Usuario desactivado" : "Usuario activado")}>{u.active ? "Desactivar" : "Activar"}</button>
              </td></tr>))}</tbody></table>
      </div>
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Nuevo usuario</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1.5fr_auto] items-end">
          <div><label className="lb" htmlFor="nu-n">Nombre</label><input id="nu-n" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value, username: userTouched ? nu.username : suggestUsername(e.target.value) })} /></div>
          <div><label className="lb" htmlFor="nu-u">Usuario</label><input id="nu-u" autoCapitalize="none" value={nu.username} onChange={(e) => { setUserTouched(true); setNu({ ...nu, username: e.target.value.toLowerCase() }); }} /></div>
          <div><label className="lb" htmlFor="nu-r">Rol</label><select id="nu-r" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></div>
          <button className="btn primary" disabled={busy} onClick={() => start(async () => {
            const r = await createUserAction(nu);
            if (!r.ok) return setMsg({ ok: false, t: r.error });
            setMsg({ ok: true, t: "Usuario creado" }); setTemp({ name: nu.name, username: nu.username, pw: r.data.temp });
            setNu({ name: "", username: "", role: "employee" }); setUserTouched(false); router.refresh();
          })}>Crear</button>
        </div>
        <p className="note mt-2">El sistema genera una contraseña temporal segura; la persona crea la suya al entrar por primera vez.</p>
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
