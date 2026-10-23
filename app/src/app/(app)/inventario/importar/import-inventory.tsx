"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { existingSerialsAction, importInventoryAction, undoInventoryImportAction } from "@/app/actions/inventory";
import { fmt } from "@/lib/format";
import { CONDS } from "@/lib/catalog";
import { INV_FIELDS, buildItems, guessByContent, guessInvMapping, hasHeaderRow, type InvKey, type InvMapping } from "@/lib/inventory-import";
import { readTable } from "@/lib/read-file";
import { MoneyInput } from "@/components/money-input";

const BATCH = 200;
const TEMPLATE = [
  "Categoría;Producto;Capacidad;Color;Condición;IMEI / Serial;Cantidad;Costo;Precio de venta;Garantía meses;Batería;Notas",
  "iPhone;iPhone 15 Pro;256 GB;Titanio natural;Nuevo;356789123456789;1;4.300.000;5.200.000;12;100;",
  "iPhone;iPhone 13;128 GB;Azul;Usado;356111111111119;1;1.500.000;2.100.000;3;87;Pantalla cambiada",
  "AirPods;AirPods Pro 2;;Blanco;Nuevo;;4;780.000;950.000;12;;",
  "Accesorios;Cargador USB-C 20 W;;Blanco;Nuevo;;15;45.000;89.000;3;;",
].join("\r\n");
const downloadTemplate = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
  a.download = "plantilla-inventario.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};

type Result = { created: number; units: number; review: number; value: number; skipped: { name: string; why: string }[] };

/** Lee las filas y propone el mapeo (con o sin fila de encabezados). */
export function analyzeInventory(rows: string[][]) {
  const data = rows.filter((r) => r.some((c) => c && c.trim()));
  const header = hasHeaderRow(data);
  return { header, map: header ? guessInvMapping(data[0] ?? []) : guessByContent(data) };
}

export function ImportInventory({ warr, sources, canUndo, initial }: {
  warr: Record<string, number>; sources: { source: string; n: number; units: number }[]; canUndo: boolean;
  /** Archivo ya leído en otra pantalla (p. ej. si lo subieron en el importador de ventas). */
  initial?: { name: string; rows: string[][] };
}) {
  const first = initial ? analyzeInventory(initial.rows) : null;
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(initial ?? null);
  const [map, setMap] = useState<InvMapping>(first?.map ?? {});
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [header, setHeader] = useState(first?.header ?? true);
  const [defaultCond, setDefaultCond] = useState("Usado");
  const [gain, setGain] = useState("");

  // Se saltan las filas vacías del comienzo (muchos libros de Excel empiezan en la fila 2 o 3).
  const start = useMemo(() => Math.max(0, file?.rows.findIndex((r) => r.some((c) => c && c.trim())) ?? 0), [file]);
  const width = useMemo(() => Math.max(0, ...(file?.rows.map((r) => r.length) ?? [0])), [file]);
  const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(39 + i));
  const headers = useMemo(() => Array.from({ length: width }, (_, i) => (header ? file?.rows[start]?.[i] || `Columna ${letter(i)}` : `Columna ${letter(i)}`)), [file, start, width, header]);
  const body = useMemo(() => file?.rows.slice(header ? start + 1 : start) ?? [], [file, start, header]);
  const firstRow = start + (header ? 2 : 1);
  const opts = useMemo(() => ({ warr, firstRow, defaultCond, gain: +gain > 0 ? +gain : null }), [warr, firstRow, defaultCond, gain]);
  const parsed = useMemo(() => (file && map.name !== undefined ? buildItems(body, map, opts) : null), [file, body, map, opts]);
  // IMEI/seriales que ya están en el sistema: se muestran y no se importan (no hay duplicados).
  const [dupes, setDupes] = useState<{ key: string; list: { serial: string; id: string; status: string; name: string }[] }>({ key: "", list: [] });
  const serialKey = parsed ? parsed.items.map((i) => i.serial).filter(Boolean).join(",") : "";
  if (parsed && dupes.key !== serialKey) {
    setDupes({ key: serialKey, list: [] });
    if (serialKey) existingSerialsAction(serialKey.split(",")).then((r) => r.ok && setDupes({ key: serialKey, list: r.data }));
  }
  const dupSet = useMemo(() => new Set(dupes.list.map((d) => d.serial)), [dupes]);
  const built = useMemo(() => (parsed ? { items: parsed.items.filter((i) => !i.serial || !dupSet.has(i.serial)), issues: parsed.issues } : null), [parsed, dupSet]);
  const sum = useMemo(() => {
    if (!built) return null;
    const its = built.items;
    const u = (i: (typeof its)[number]) => i.qty;
    const byCat = new Map<string, number>();
    for (const i of its) byCat.set(i.cat, (byCat.get(i.cat) ?? 0) + u(i));
    return {
      n: its.length, units: its.reduce((a, i) => a + u(i), 0), cost: its.reduce((a, i) => a + i.cost * u(i), 0), price: its.reduce((a, i) => a + i.price * u(i), 0),
      noCost: its.filter((i) => !i.cost).length, noPrice: its.filter((i) => !i.price).length, iphones: its.filter((i) => i.cat === "iPhone").length, byCat: [...byCat.entries()],
    };
  }, [built]);

  async function pick(f: File) {
    setErr(""); setResult(null); setFailed("");
    if (f.size > 15_000_000) return setErr("El archivo pesa más de 15 MB.");
    let rows: string[][];
    try { rows = await readTable(f); } catch (e) { return setErr((e as Error).message); }
    const data = rows.filter((r) => r.some((c) => c && c.trim()));
    if (data.length < 1) return setErr("El archivo está vacío.");
    setFile({ name: f.name, rows });
    const h = hasHeaderRow(data);
    setHeader(h);
    setMap(h ? guessInvMapping(data[0]) : guessByContent(data));
  }

  async function doImport() {
    if (!built || !file) return;
    const list = built.items;
    const total: Result = { created: 0, units: 0, review: 0, value: 0, skipped: [] };
    setProgress({ done: 0, total: list.length }); setFailed("");
    for (let i = 0; i < list.length; i += BATCH) {
      const r = await importInventoryAction({ source: file.name, items: list.slice(i, i + BATCH) });
      if (!r.ok) { setFailed(`Se detuvo en el producto ${i + 1}: ${r.error}. Lo ya importado quedó guardado; si vuelves a subir el archivo, se salta lo que ya entró.`); break; }
      total.created += r.data.created; total.units += r.data.units; total.review += r.data.review; total.value += r.data.value; total.skipped.push(...r.data.skipped);
      setProgress({ done: Math.min(list.length, i + BATCH), total: list.length });
    }
    setResult(total); setProgress(null); router.refresh();
  }

  const sel = (k: InvKey) => (
    <select aria-label={`Columna para ${k}`} value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
      <option value="">— No está en el archivo —</option>
      {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`} · ej. «{(body[0]?.[i] ?? "").slice(0, 24)}»</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <h2 className="font-semibold mb-1">Cargar inventario desde un archivo</h2>
        <p className="note mb-3">
          Sube el Excel (.xlsx) o CSV con los productos que hay hoy en la tienda: una fila por producto. Los equipos con IMEI o serie
          van uno por fila; los accesorios pueden llevar cantidad. <b>Los iPhone entran «En revisión»</b>: se ven en el inventario pero no se pueden
          vender hasta registrar la consulta oficial (CRC y Apple) en su ficha.
        </p>
        <label className="btn primary cursor-pointer">📄 Elegir archivo (Excel o CSV)<input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} /></label>
        <button type="button" className="btn ml-2" onClick={downloadTemplate}>⬇️ Descargar plantilla</button>
        {file && <span className="note ml-3">{file.name} · {body.length} filas · {headers.length} columnas</span>}
        {err && <p role="alert" className="chip bad !rounded-md mt-3 !whitespace-normal">{err}</p>}
      </div>

      {file && (
        <details className="card p-4" open={!parsed?.items.length}>
          <summary className="cursor-pointer font-semibold">{parsed?.items.length ? "✓ Columnas reconocidas automáticamente (toca para revisarlas o ajustarlas)" : "1. ¿Qué columna es cada dato?"}</summary>
          <p className="note mb-3 mt-2">{header ? "Ya propusimos una asignación según los encabezados." : "El archivo no trae encabezados: propusimos cada columna según su contenido (IMEI, modelo, capacidad, color…)."} Revísala; lo marcado con * es obligatorio.</p>
          <label className="mb-3 flex items-center gap-2 text-[13px]"><input type="checkbox" className="!w-auto" checked={header} onChange={(e) => {
            const h = e.target.checked; setHeader(h);
            const data = file.rows.filter((r) => r.some((c) => c && c.trim()));
            setMap(h ? guessInvMapping(data[0]) : guessByContent(data));
          }} /> La primera fila tiene los nombres de las columnas</label>
          <div className="grid gap-3 md:grid-cols-2">
            {INV_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="lb">{f.label}{"required" in f && f.required ? " *" : ""}</label>
                {sel(f.key)}
                {"hint" in f && f.hint && <p className="note mt-1">{f.hint}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
      {file && (
        <div className="card p-4 grid gap-3 md:grid-cols-2">
            <div><label className="lb" htmlFor="inv-cond">Condición cuando el archivo no la dice</label>
              <select id="inv-cond" value={defaultCond} onChange={(e) => setDefaultCond(e.target.value)}>{CONDS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="lb" htmlFor="inv-gain">Ganancia por equipo sobre el costo (COP)</label>
              <MoneyInput id="inv-gain" value={gain} onChange={(x) => setGain(x)} placeholder="Ej. 300000 · vacío = sin precio" />
              <p className="note mt-1">El valor del archivo es el <b>costo</b>. Precio de venta = costo + esta ganancia. Si lo dejas vacío, ponle precio a cada uno en «Editar» (sin precio no se puede vender).</p></div>
        </div>
      )}
      {file && !built && <p className="chip warn !rounded-md !whitespace-normal">Asigna al menos la columna «Producto / modelo» para ver la vista previa.</p>}

      {built && sum && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">2. Revisa antes de importar</h2>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 text-[13px]">
            <div className="rounded-lg border border-line p-2"><span className="note block">Productos</span><b className="text-lg">{sum.n}</b> <span className="note">({sum.units} unidades)</span></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Valor a precio de venta</span><b className="text-lg tabular-nums">{fmt(sum.price)}</b></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Valor al costo</span><b className="text-lg tabular-nums">{fmt(sum.cost)}</b></div>
            <div className="rounded-lg border border-line p-2"><span className="note block">Por categoría</span><span className="text-[12.5px]">{sum.byCat.map(([c, n]) => `${c} ${n}`).join(" · ")}</span></div>
          </div>
          {dupes.list.length > 0 && (
            <details className="rounded-lg border border-line p-2 text-[13px]">
              <summary className="cursor-pointer font-semibold">✓ {dupes.list.length} ya están en el inventario y no se vuelven a importar (sin duplicados)</summary>
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5">{dupes.list.map((d) => <li key={d.serial}><span className="mono">{d.serial}</span> · {d.name} · {d.id} · {d.status}</li>)}</ul>
            </details>
          )}
          {built.items.length === 0 && <p className="chip ok !rounded-md !whitespace-normal">No hay productos nuevos en este archivo: todo ya está en el inventario.</p>}
          {sum.iphones > 0 && <p className="chip info !rounded-md !whitespace-normal">{sum.iphones} iPhone entrarán «En revisión»: en la ficha de cada uno, «Verificar IMEI de nuevo» registra la consulta oficial y lo pasa a vitrina.</p>}
          {sum.noCost > 0 && <p className="chip warn !rounded-md !whitespace-normal">{sum.noCost} producto(s) sin costo: no tendrán margen en los reportes. Si el archivo tiene costo, asígnalo arriba.</p>}
          {sum.noPrice > 0 && <p className="chip warn !rounded-md !whitespace-normal">{sum.noPrice} producto(s) quedarán <b>sin precio de venta</b> : escribe la ganancia arriba o pónselo en su ficha antes de venderlos.</p>}
          {built.issues.length > 0 && (
            <details className="rounded-lg border border-red-300 p-2 text-[13px]" open={built.issues.length <= 10}>
              <summary className="cursor-pointer font-semibold text-red-700">{built.issues.length} fila(s) no se importarán</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">{built.issues.slice(0, 300).map((x, i) => <li key={i}>Fila {x.row}: {x.msg}</li>)}</ul>
            </details>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left note border-b border-line"><th className="py-1">Categoría</th><th>Producto</th><th>Condición</th><th>IMEI / serie</th><th className="text-right">Cant.</th><th className="text-right">Batería</th><th className="text-right">Costo</th><th className="text-right">Precio</th><th>Notas</th></tr></thead>
              <tbody>{built.items.slice(0, 10).map((i) => (
                <tr key={i.key} className="border-b border-line">
                  <td className="py-1.5">{i.cat}</td><td><b>{i.name}</b>{i.spec && ` · ${i.spec}`}{i.color && <span className="note"> · {i.color}</span>}</td>
                  <td>{i.cond}</td><td className="mono text-[11.5px]">{i.serial || "—"}</td><td className="text-right">{i.qty}</td>
                  <td className="text-right">{i.batt != null ? `${i.batt}%` : "—"}</td>
                  <td className="text-right tabular-nums">{i.cost ? fmt(i.cost) : <span className="note">—</span>}</td><td className="text-right tabular-nums font-semibold">{i.price ? fmt(i.price) : <span className="chip warn">Sin precio</span>}</td>
                  <td className="note max-w-[220px] truncate">{i.notes}</td>
                </tr>
              ))}</tbody>
            </table>
            {built.items.length > 10 && <p className="note mt-1">… y {built.items.length - 10} productos más.</p>}
          </div>
          {progress ? (
            <div aria-live="polite"><div className="h-2 rounded bg-gray-200"><div className="h-2 rounded" style={{ width: `${(progress.done / progress.total) * 100}%`, background: "var(--accent)" }} /></div><p className="note mt-1">Importando {progress.done} de {progress.total}…</p></div>
          ) : (
            <button className="btn primary" disabled={!built.items.length} onClick={doImport}>📥 Importar {sum.n} productos</button>
          )}
          {failed && <p role="alert" className="chip bad !rounded-md !whitespace-normal">{failed}</p>}
          {result && (
            <div role="status" className="chip ok !rounded-md !whitespace-normal block">
              Listo: {result.created} productos importados ({result.units} unidades, {fmt(result.value)}){result.review ? ` · ${result.review} iPhone en revisión` : ""}.
              {result.skipped.length > 0 && <> {result.skipped.length} se saltaron: {result.skipped.slice(0, 5).map((s) => `${s.name} (${s.why})`).join("; ")}{result.skipped.length > 5 ? "…" : ""}</>}
              {" "}<Link className="underline" href="/inventario">Ver inventario →</Link>
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Importaciones hechas</h2>
          <table className="w-full text-[13px]"><thead><tr className="text-left note"><th className="py-1">Archivo</th><th>Productos</th><th>Unidades</th><th /></tr></thead>
            <tbody>{sources.map((s) => (
              <tr key={s.source} className="border-t border-line">
                <td className="py-2">{s.source.replace(/^Importado: /, "")}</td><td>{s.n}</td><td>{s.units}</td>
                <td className="text-right">{canUndo && <button className="btn sm" disabled={busy} onClick={async () => {
                  const name = s.source.replace(/^Importado: /, "");
                  if (!confirm(`¿Borrar los productos importados de «${name}» que todavía no se han vendido ni apartado?`)) return;
                  setBusy(true); const r = await undoInventoryImportAction(name); setBusy(false);
                  setErr(r.ok ? "" : r.error); if (r.ok) { setResult(null); alert(`${r.data} productos eliminados`); router.refresh(); }
                }}>Deshacer</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
