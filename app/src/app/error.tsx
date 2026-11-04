"use client";
import { useEffect } from "react";

/** Si una página falla por un error pasajero, se reintenta sola una vez y se ofrece recargar. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    let tried = false;
    try { tried = sessionStorage.getItem("retried:" + location.pathname) === "1"; sessionStorage.setItem("retried:" + location.pathname, "1"); } catch {}
    if (!tried) { const t = setTimeout(reset, 800); return () => clearTimeout(t); }
  }, [error, reset]);
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <h1 className="text-lg font-semibold">No se pudo cargar la página</h1>
      <p className="note mt-2">Fue un error pasajero. Intenta de nuevo; tus datos no se perdieron.</p>
      <div className="mt-4 flex justify-center gap-2"><button className="btn primary" onClick={() => location.reload()}>Recargar</button><a className="btn" href="/ventas">Ir a Ventas</a></div>
    </div>
  );
}
