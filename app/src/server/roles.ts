import { ALL_PERMS } from "@/lib/perms";

export const DEFAULT_ROLES: Record<string, { name: string; locked?: boolean; perms: string[] }> = {
  dev: { name: "Desarrollador", locked: true, perms: ALL_PERMS.filter((p) => p !== "approve") },
  owner: { name: "Propietario/a", perms: ALL_PERMS.filter((p) => p !== "dev") },
  employee: { name: "Empleado/a de tienda", perms: ["inv_view", "sell", "credit", "tradein", "clients", "workshop"] },
};
