export const DAY = 864e5;

export const fmt = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString("es-CO");

export const fmtM = (n: number) =>
  Math.abs(n) >= 1e6
    ? (n < 0 ? "-" : "") + "$" + (Math.abs(n) / 1e6).toFixed(1).replace(".", ",") + " M"
    : fmt(n);

const TZ = "America/Bogota";
export const fdate = (t: number) =>
  new Date(t).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: TZ });
export const fdatey = (t: number) =>
  new Date(t).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
export const ftime = (t: number) =>
  new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
export const fdt = (t: number) => fdate(t) + " · " + ftime(t);
export const daysAgo = (t: number, now = Date.now()) => Math.max(0, Math.floor((now - t) / DAY));
export const initials = (s: string) =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
