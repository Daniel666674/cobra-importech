"use client";
/* Escáner con cámara: códigos de barras (IMEI/serial de la caja) y lectura de texto (OCR) de la etiqueta o de la
   pantalla Ajustes → General → Información. Todo corre en el dispositivo: las fotos no se envían a ningún servidor. */
import { useCallback, useEffect, useRef, useState } from "react";
import { barBoxes, stripOf } from "@/lib/barcode-strip";
import { classifyCode, mergeRead, parseLabelText, type ScanRead } from "@/lib/scan-parse";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const ZXing: any;
declare const Tesseract: any;

const loaded: Record<string, Promise<void>> = {};
const loadScript = (src: string) =>
  (loaded[src] ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  }));

let worker: any = null;
const OCR_TXT: Record<string, string> = {
  "loading tesseract core": "Preparando el lector de texto…", "initializing tesseract": "Preparando el lector de texto…",
  "loading language traineddata": "Cargando idioma (solo la primera vez)…", "initializing api": "Preparando…", "recognizing text": "Leyendo texto…",
};

async function ocr(canvas: HTMLCanvasElement, onStatus: (s: string) => void): Promise<string> {
  await loadScript("/vendor/tesseract/tesseract.min.js");
  if (!worker) {
    const abs = (p: string) => new URL(p, location.origin).href;
    worker = await Tesseract.createWorker("eng", 1, {
      workerPath: abs("/vendor/tesseract/worker.min.js"), corePath: abs("/vendor/tesseract"), langPath: abs("/vendor/tesseract/lang"), gzip: true,
      logger: (m: any) => onStatus((OCR_TXT[m.status] ?? "Procesando…") + (m.progress && m.status === "recognizing text" ? " " + Math.round(m.progress * 100) + "%" : "")),
    });
  }
  const k = Math.min(1, 2200 / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(canvas, 0, 0, w, h);
  const id = x.getImageData(0, 0, w, h), d = id.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
  let lo = 0, hi = 255, acc = 0; const tot = w * h;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > tot * 0.02) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > tot * 0.02) { hi = i; break; } }
  let mean = 0; for (let i = 0; i < 256; i++) mean += i * hist[i]; mean /= tot;
  const dark = mean < 115; // modo oscuro del iPhone: texto claro sobre fondo negro
  const gam = new Uint8Array(256); for (let i = 0; i < 256; i++) gam[i] = Math.round(255 * Math.pow(i / 255, 1.9));
  const sc = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { let v = dark ? 255 - d[i] : Math.max(0, Math.min(255, ((d[i] - lo) * sc) | 0)); v = gam[v]; d[i] = d[i + 1] = d[i + 2] = v; }
  x.putImageData(id, 0, 0);
  const r = await worker.recognize(c);
  return r.data.text || "";
}

let zx: any = null;
function zxReader() {
  if (zx) return zx;
  const H = new Map(), F = ZXing.BarcodeFormat;
  H.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.CODE_128, F.CODE_39, F.ITF, F.EAN_13, F.QR_CODE, F.DATA_MATRIX, F.PDF_417]);
  H.set(ZXing.DecodeHintType.TRY_HARDER, true);
  zx = new ZXing.MultiFormatReader(); zx.setHints(H);
  return zx;
}
/** Lee un recorte; `scale` agranda (las cámaras de computador ven el código pequeño) y `rot` lo gira 90° (caja de lado). */
function zxRegion(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, scale = 1, rot = false): string | null {
  const c = document.createElement("canvas");
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  c.width = rot ? ch : cw; c.height = rot ? cw : ch;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (rot) { g.translate(c.width, 0); g.rotate(Math.PI / 2); }
  g.drawImage(src, x, y, w, h, 0, 0, cw, ch);
  try {
    const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)));
    return zxReader().decodeWithState(bmp).getText();
  } catch { return null; }
}
let detector: any = null;
/** Tira limpia → texto (umbral global: la tira ya viene en blanco y negro). */
function zxStrip(c: HTMLCanvasElement): string | null {
  try { return zxReader().decodeWithState(new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)))).getText(); } catch { return null; }
}
/** Zonas de barras del cuadro (también girado, por si la caja está de lado) → tiras limpias. */
function stripCodes(canvas: HTMLCanvasElement, rotate: boolean, scales: number[]): string[] {
  let src = canvas;
  if (rotate) { src = document.createElement("canvas"); src.width = canvas.height; src.height = canvas.width; const g = src.getContext("2d")!; g.translate(src.width, 0); g.rotate(Math.PI / 2); g.drawImage(canvas, 0, 0); }
  // Las cuentas se hacen sobre un cuadro de máximo 1280 px (rápido), pero el recorte sale del original.
  const k = Math.min(1, 1280 / Math.max(src.width, src.height));
  let small = src;
  if (k < 1) { small = document.createElement("canvas"); small.width = Math.round(src.width * k); small.height = Math.round(src.height * k); small.getContext("2d")!.drawImage(src, 0, 0, small.width, small.height); }
  const out: string[] = [];
  for (const b of barBoxes(small).slice(0, 2)) {
    const box = { x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k };
    for (const sc of scales) { const strips = stripOf(src, box, sc); if (!strips) break; for (const st of strips) { const t = zxStrip(st); if (t) { out.push(t); break; } } if (out.length) break; }
  }
  return out;
}

let tick = 0;
async function decodeCodes(canvas: HTMLCanvasElement, thorough: boolean): Promise<string[]> {
  const found = new Set<string>();
  if ("BarcodeDetector" in window) {
    try {
      detector ??= new (window as any).BarcodeDetector();
      (await detector.detect(canvas)).forEach((b: any) => b.rawValue && found.add(b.rawValue));
      if (found.size && !thorough) return [...found];
    } catch { /* sin lector nativo */ }
  }
  try { await loadScript("/vendor/zxing.min.js"); } catch { return [...found]; }
  const W = canvas.width, H = canvas.height;
  const add = (t: string | null) => { if (t) found.add(t); };
  // En vivo se alterna una estrategia por cuadro (para no trabar el computador); con «Leer texto» o foto se prueban todas.
  const step = thorough ? -1 : tick++ % 4;
  // Primero la tira limpia (lo que más ayuda con webcams); de lado, uno de cada cuatro cuadros.
  for (const t of stripCodes(canvas, false, [1, 2, 3])) found.add(t);
  if (step < 0 || step === 3) for (const t of stripCodes(canvas, true, thorough ? [1, 2, 3] : [1, 2])) found.add(t);
  if (found.size && !thorough) return [...found];
  if (step < 0 || step === 0) {
    add(zxRegion(canvas, 0, 0, W, H));
    const bands = thorough ? 7 : 4, bh = H / (bands * 0.55);
    for (let i = 0; i < bands; i++) { const y = Math.min(H - bh, (i * (H - bh)) / (bands - 1 || 1)); add(zxRegion(canvas, 0, y, W, bh)); }
  }
  // Centro ampliado ×2 y ×3: webcams de 720p con el código lejos o pequeño.
  if (step < 0 || step === 1) { add(zxRegion(canvas, W * 0.2, H * 0.25, W * 0.6, H * 0.5, 2)); }
  if (step < 0 || step === 2) { add(zxRegion(canvas, W * 0.3, H * 0.33, W * 0.4, H * 0.34, 3)); }
  // Caja o etiqueta de lado.
  if (step < 0 || step === 3) { add(zxRegion(canvas, 0, 0, W, H, 1, true)); add(zxRegion(canvas, W * 0.25, 0, W * 0.5, H, 1.6, true)); }
  return [...found];
}

const LABELS: Record<string, string> = { imei: "IMEI", serial: "Serie", name: "Modelo", spec: "Capacidad", color: "Color", batt: "Batería", part: "N.º de parte", modelno: "N.º de modelo" };

export function ScanDialog({ onClose, onUse, defaultTab = "box" }: { onClose: () => void; onUse: (r: ScanRead) => void; defaultTab?: "box" | "screen" }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [tab, setTab] = useState<"box" | "screen">(defaultTab);
  const [read, setRead] = useState<ScanRead>({});
  const [status, setStatus] = useState("Apunta la cámara al código de barras de la caja");
  const [camErr, setCamErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState("");
  const [pick, setPick] = useState("");
  const [mirror, setMirror] = useState(false);
  const readRef = useRef<ScanRead>({});
  const busyRef = useRef(false);

  const absorb = useCallback((patch: ScanRead) => { readRef.current = mergeRead({ ...readRef.current }, patch); setRead({ ...readRef.current }); }, []);
  const absorbCodes = useCallback((codes: string[]) => {
    const p: ScanRead = {};
    for (const raw of codes) { const c = classifyCode(raw); if (c.k === "imei" && !p.imei) p.imei = c.v; else if (c.k === "serial" && !p.serial) p.serial = c.v; else if (c.k === "part") p.part = c.v; else if (c.k === "modelno") p.modelno = c.v; }
    if (Object.keys(p).length) absorb(p);
  }, [absorb]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Resolución máxima: en computadores la cámara suele dar 720p si no se pide más, y el IMEI no se alcanza a leer.
        const s = await navigator.mediaDevices.getUserMedia({
          video: { ...(pick ? { deviceId: { exact: pick } } : { facingMode: { ideal: "environment" } }), width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false,
        });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as any;
        if (caps.focusMode?.includes?.("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
        // Cámara frontal (la del computador): se ve como espejo para que sea fácil apuntar.
        const fm = track.getSettings().facingMode;
        setMirror(fm !== "environment");
        setCams((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
        setCamId(track.getSettings().deviceId ?? "");
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      } catch { setCamErr("No se pudo abrir la cámara. Revisa el permiso del navegador o sube una foto."); }
    })();
    const timer = setInterval(async () => {
      const v = video.current;
      if (!v || !v.videoWidth || busyRef.current) return;
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      absorbCodes(await decodeCodes(c, false));
    }, 450);
    return () => { alive = false; clearInterval(timer); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [absorbCodes, pick]);

  async function fromCanvas(c: HTMLCanvasElement) {
    busyRef.current = true; setBusy(true);
    try {
      absorbCodes(await decodeCodes(c, true));
      const text = await ocr(c, setStatus);
      absorb(parseLabelText(text));
      setStatus("Listo. Revisa los datos y pulsa «Usar estos datos».");
    } catch { setStatus("No se pudo leer el texto. Intenta con más luz y la imagen quieta."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const capture = () => { const v = video.current; if (!v?.videoWidth) return; const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0); void fromCanvas(c); };
  async function onFile(f?: File) {
    if (!f) return;
    const bmp = await createImageBitmap(f); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d")!.drawImage(bmp, 0, 0); void fromCanvas(c);
  }

  const entries = (Object.keys(LABELS) as (keyof ScanRead)[]).filter((k) => read[k] != null && read[k] !== "");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Escanear con la cámara">
      <div className="card flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-3"><b>📷 Escanear con la cámara</b><button className="btn sm" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div className="flex gap-2 p-3 pb-0">
          {([["box", "Caja o etiqueta"], ["screen", "Pantalla del equipo (usado)"]] as const).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setStatus(k === "box" ? "Apunta la cámara al código de barras de la caja" : "En el equipo abre Ajustes → General → Información y enfoca la pantalla; luego pulsa «Leer texto»"); }} className={`btn sm ${tab === k ? "primary" : ""}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-y-auto p-3 space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={video} playsInline muted className="aspect-video w-full object-cover" style={mirror ? { transform: "scaleX(-1)" } : undefined} />
            <div className="pointer-events-none absolute inset-x-[20%] inset-y-[25%] rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" aria-hidden />
            {camErr && <p className="absolute inset-0 grid place-items-center p-4 text-center text-white">{camErr}</p>}
          </div>
          <p className="note" role="status">{status}</p>
          {mirror && <p className="note">💻 Cámara de computador: pon el código de barras <b>dentro del recuadro</b>, a unos 15–20 cm, quieto y con buena luz. Si no lo lee en unos segundos, pulsa «📸 Leer texto» (lee el IMEI escrito) o toma la foto con el celular y usa «🖼️ Subir foto».</p>}
          {cams.length > 1 && (
            <select aria-label="Cámara" value={camId} onChange={(e) => setPick(e.target.value)}>
              {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${i + 1}`}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn primary" disabled={busy || !!camErr} onClick={capture}>📸 Leer texto</button>
            <label className="btn cursor-pointer">🖼️ Subir foto<input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          </div>
          <div className="rounded-lg bg-gray-bg/60 p-3">
            <h3 className="font-semibold text-[13px] mb-2">Datos leídos</h3>
            {entries.length === 0 ? <p className="note">Todavía no se ha leído nada.</p> : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                {entries.map((k) => <div key={k}><dt className="note">{LABELS[k]}</dt><dd className="font-semibold break-all">{String(read[k])}{k === "batt" ? "%" : ""}</dd></div>)}
                {read.info?.length ? <div className="col-span-2"><dt className="note">Otros datos</dt><dd className="font-semibold">{read.info.join(" · ")}</dd></div> : null}
              </dl>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line p-3">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!entries.length} onClick={() => { onUse(read); onClose(); }}>Usar estos datos</button>
        </div>
      </div>
    </div>
  );
}
