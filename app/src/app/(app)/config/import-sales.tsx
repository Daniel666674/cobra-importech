"use client";
import { useMemo, useState } from "react";
import { importSalesAction } from "@/app/actions/admin";
import { guessDateOrder, parseCsv, type DateOrder } from "@/lib/csv";
import { fdatey, fmt } from "@/lib/format";
import { IMPORT_FIELDS, buildSales, impliedDisc, guessMapping, type FieldKey, type Mapping } from "@/lib/sales-import";

const BATCH = 200;
const TEMPLATE = [
  "Factura;Fecha;Cliente;Cédula;Teléfono;Correo;Producto;IMEI;Cantidad;Precio unitario;Costo unitario;Total factura;Forma de pago;Vendedor;Condición;Garantía meses;Observaciones",
  "A-1001;15/03/2025 10:30;José Pérez;71234567;3001112233;jose@correo.com;iPhone 14 Pro 128 GB;356111111111119;1;3.200.000;2.700.000;3.250.000;Transferencia;Angelica;Usado;3;",
  "A-1001;15/03/2025 10:30;José Pérez;71234567;3001112233;jose@correo.com;Funda MagSafe;;1;150.000;60.000;3.250.000;Transferencia;Angelica;Nuevo;;",
  "A-1002;16/03/2025;;;;;AirPods Pro 2;;1;950.000;780.000;950.000;Efectivo;Angelica;Nuevo;12;",
].join("\r\n");
const downloadTemplate = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
  a.download = "plantilla-ventas.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};

/** Lee el archivo como UTF-8 y, si trae caracteres dañados (típico de Excel en Windows), como Windows-1252. */
async function readText(f: File) {
  const buf = await f.arrayBuffer();
  const utf = new TextDecoder("utf-8").decode(buf);
  return utf.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf;
}

type Result = { created: number; skipped: number; newClients: number; amount: number };

export function ImportSales({ warr, onDone }: { warr: Record<string, number>; onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState("");

  const headers = file?.rows[0] ?? [];
  const body = useMemo(() => file?.rows.slice(1) ?? [], [file]);
  const built = useMemo(() => (file && map.date !== undefined && map.product !== undefined ? buildSales(body, map, { dateOrder: order, warr }) : null), [file, body, map, order, warr]);
  const summary = useMemo(() => {
    if (!built) return null;
    const s = built.sales;
    const lines = s.reduce((a, x) => a + x.lines.length, 0);
    return {
      n: s.length, lines, total: s.reduce((a, x) => a + x.total, 0),
      from: s.length ? Math.min(...s.map((x) => x.t)) : 0, to: s.length ? Math.max(...s.map((x) => x.t)) : 0,
      noCost: s.reduce((a, x) => a + x.lines.filter((l) => !l.cost).length, 0),
      withSerial: s.reduce((a, x) => a + x.lines.filter((l) => l.serial).length, 0),
      clients: new Set(s.map((x) => x.client?.doc || x.client?.name).filter(Boolean)).size,
      disc: s.filter((x) => impliedDisc(x) > 0).length,
    };
  }, [built]);

  async function pick(f: File) {
    setErr(""); setResult(null); setFailed("");
    if (f.size > 15_000_000) return setErr("El archivo pesa más de 15 MB. Divídelo por años.");
    const rows = parseCsv(await readText(f));
    if (rows.length < 2) return setErr("El archivo está vacío o no tiene filas de datos.");
    setFile({ name: f.name, rows });
    const m = guessMapping(rows[0]);
    setMap(m);
    setOrder(m.date !== undefined ? guessDateOrder(rows.slice(1, 300).map((r) => r[m.date!] ?? "")) : "dmy");
  }

  async function doImport() {
    if (!built || !file) return;
    const list = built.sales;
    const total: Result = { created: 0, skipped: 0, newClients: 0, amount: 0 };
    setProgress({ done: 0, total: list.length }); setFailed("");
    for (let i = 0; i < list.length; i += BATCH) {
      const r = await importSalesAction({ source: file.name, sales: list.slice(i, i + BATCH) });
      if (!r.ok) { setFailed(`Se detuvo en la venta ${i + 1}: ${r.error}. Lo ya importado quedó guardado; si vuelves a importar el mismo archivo, se salta lo que ya entró.`); break; }
      for (const k of Object.keys(total) as (keyof Result)[]) total[k] += r.data[k];
      setProgress({ done: Math.min(list.length, i + BATCH), total: list.length });
    }
    setResult(total); setProgress(null); onDone();
  }

  const sel = (k: FieldKey) => (
    <select aria-label={`Columna para ${k}`} value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
      <option value="">— No está en el archivo —</option>
      {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`} · ej. «{(body[0]?.[i] ?? "").slice(0, 24)}»</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <h2 className="font-semibold mb-1">Importar historial de ventas</h2>
        <p className="note mb-3">
          Sube el CSV exportado del sistema anterior o de Excel («Guardar como → CSV»). Cada fila es un producto vendido;
          las filas con el mismo número de factura se agrupan en una venta. No cambia el inventario actual: sirve para reportes,
          clientes y para consultar garantías por IMEI. Puedes subir el mismo archivo otra vez sin duplicar.
          Si los datos están en cuadernos o en un Excel suelto, descarga la plantilla, llénala y súbela.
        </p>
        <label className="btn primary cursor-pointer">📄 Elegir archivo CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} /></label>
        <button type="button" className="btn ml-2" onClick={downloadTemplate}>⬇️ Descargar plantilla</button>
        {file && <span className="note ml-3">{file.name} · {body.length} filas · {headers.length} columnas</span>}
        {err && <p role="alert" className="chip bad !rounded-md mt-3">{err}</p>}
      </div>

      {file && (
        <div className="card p-4">
          <h2 className="font-semibold mb-1">1. ¿Qué columna es cada dato?</h2>
          <p className="note mb-3">Ya propusimos una asignación según los encabezados. Revísala; lo marcado con * es obligatorio.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="lb">{f.label}{"required" in f && f.required ? " *" : ""}</label>
                {sel(f.key)}
                {"hint" in f && f.hint && <p className="note mt-1">{f.hint}</p>}
              </div>
            ))}
            <div>
              <label className="lb" htmlFor="imp-order">Formato de las fechas</label>
              <select id="imp-order" value={order} onChange={(e) => setOrder(e.target.value as DateOrder)}>
                <option value="dmy">Día/mes/año (31/12/2025)</option><option value="mdy">Mes/día/año (12/31/2025)</option><option value="ymd">Año-mes-día (2025-12-31)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {file && !built && <p className="chip warn !rounded-md">Asigna al menos «Fecha» y «Producto» para ver la vista previa.</p>}

      {built && summary && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">2. Revisa antes de importar</h2>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 text-[13px]">
            <div className="rounded-lg border border-line p-2"><span className="note block">Ventas</span><b className="text-lg">{summary.n}</b> <span className="note">({summary.lines} productos)</span></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Total</span><b className="text-lg tabular-nums">{fmt(summary.total)}</b></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Periodo</span><b>{summary.n ? `${fdatey(summary.from)} – ${fdatey(summary.to)}` : "—"}</b></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Clientes distintos</span><b className="text-lg">{summary.clients}</b></div>
          </div>
          {summary.noCost > 0 && <p className="chip warn !rounded-md !whitespace-normal">{summary.noCost} producto(s) sin costo: esas ventas no tendrán margen en los reportes. Si el archivo tiene costo, asígnalo arriba.</p>}
          {map.serial === undefined && <p className="chip warn !rounded-md !whitespace-normal">Sin columna de IMEI/serial no se podrá buscar la garantía de esos equipos por IMEI.</p>}
          {map.no === undefined && <p className="chip warn !rounded-md !whitespace-normal">Sin número de factura, cada fila se importa como una venta aparte.</p>}
          {summary.disc > 0 && <p className="note">{summary.disc} venta(s) tienen un total menor que la suma de sus productos: la diferencia se registra como descuento.</p>}
          {built.issues.length > 0 && (
            <details className="rounded-lg border border-red-300 p-2 text-[13px]" open={built.issues.length <= 10}>
              <summary className="cursor-pointer font-semibold text-red-700">{built.issues.length} fila(s) no se importarán</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">{built.issues.slice(0, 200).map((x) => <li key={x.row}>Fila {x.row}: {x.msg}</li>)}</ul>
            </details>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left note border-b border-line"><th className="py-1">Factura</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Pago</th><th className="text-right">Total</th></tr></thead>
              <tbody>{built.sales.slice(0, 8).map((s) => (
                <tr key={s.key} className="border-b border-line align-top">
                  <td className="py-1.5">{s.no || <i className="note">nuevo</i>}</td><td>{fdatey(s.t)}</td><td>{s.client?.name ?? <i className="note">Mostrador</i>}</td>
                  <td>{s.lines.map((l, i) => <div key={i}>{l.qty}× {l.name}{l.serial && <span className="note font-mono"> · {l.serial}</span>} <span className="note">{fmt(l.price)}</span></div>)}</td>
                  <td>{s.method || <i className="note">Sin dato</i>}</td><td className="text-right tabular-nums font-semibold">{fmt(s.total)}</td>
                </tr>
              ))}</tbody>
            </table>
            {built.sales.length > 8 && <p className="note mt-1">… y {built.sales.length - 8} ventas más.</p>}
          </div>
          {progress ? (
            <div aria-live="polite"><div className="h-2 rounded bg-gray-200"><div className="h-2 rounded bg-accent" style={{ width: `${(progress.done / progress.total) * 100}%`, background: "var(--accent, #2563eb)" }} /></div><p className="note mt-1">Importando {progress.done} de {progress.total}…</p></div>
          ) : (
            <button className="btn primary" disabled={!built.sales.length} onClick={doImport}>📥 Importar {summary.n} ventas</button>
          )}
          {failed && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{failed}</p>}
          {result && <p role="status" className="chip ok !rounded-md !whitespace-normal">Listo: {result.created} ventas importadas ({fmt(result.amount)}), {result.newClients} clientes nuevos{result.skipped ? `, ${result.skipped} ya existían y se saltaron` : ""}.</p>}
        </div>
      )}
    </div>
  );
}
