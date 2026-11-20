/** Se muestra al instante al cambiar de pantalla, mientras el servidor prepara la nueva (la app se siente más ágil). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-md bg-line" />
      <div className="h-4 w-80 max-w-full rounded bg-line" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl border border-line bg-card" />)}</div>
      <div className="h-64 rounded-xl border border-line bg-card" />
    </div>
  );
}
