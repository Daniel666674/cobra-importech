import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { roles, users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireMe } from "@/server/session";
import { UsersClient } from "./users-client";
import { PERMS } from "@/lib/perms";

export default async function Usuarios() {
  const me = await requireMe("users");
  const db = await getDb();
  const [us, rs] = await Promise.all([db.select().from(users).orderBy(asc(users.createdAt), asc(users.id)), db.select().from(roles)]);
  return (
    <>
      <PageHeader title="Usuarios y permisos" subtitle="Quién entra al sistema y qué puede hacer" />
      <UsersClient
        meId={me.id} meDev={me.locked}
        users={us.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, mustChange: u.mustChange }))}
        roles={rs.map((r) => ({ key: r.key, name: r.name, locked: r.locked, perms: r.perms }))}
        perms={PERMS.map(([k, l]) => ({ key: k, label: l }))}
      />
    </>
  );
}
