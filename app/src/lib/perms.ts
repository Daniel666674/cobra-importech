export const PERMS = [
  ["inv_view", "Ver inventario"],
  ["inv_edit", "Crear y editar productos"],
  ["inv_delete", "Eliminar productos"],
  ["cost_view", "Ver costos y márgenes"],
  ["sell", "Registrar ventas"],
  ["discount", "Dar descuentos sobre el límite"],
  ["refund", "Hacer devoluciones"],
  ["credit", "Gestionar apartados y abonos"],
  ["tradein", "Recibir trade-in"],
  ["workshop", "Gestionar taller"],
  ["purchase", "Gestionar compras"],
  ["clients", "Gestionar clientes"],
  ["reports", "Ver reportes"],
  ["users", "Gestionar usuarios y permisos"],
  ["settings", "Cambiar configuración y logo"],
  ["dev", "Herramientas de desarrollador"],
] as const;

export type Perm = (typeof PERMS)[number][0];
export const ALL_PERMS: Perm[] = PERMS.map((p) => p[0]);
