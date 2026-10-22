/* Lectura de códigos de barras con cámaras de computador (webcam de 720p, código pequeño, desenfocado y rodeado de
   la caja oscura): se ubica la zona de barras, se promedian sus filas para quitar ruido y se arma una tira limpia sobre
   blanco con su zona de silencio. El lector (ZXing) valida con el dígito de control, así que probar varias versiones es seguro. */
export type Box = { x: number; y: number; w: number; h: number };

/** Busca dónde están las barras (zona con muchos cambios claro/oscuro en horizontal) y devuelve recortes con margen blanco. */
export function barBoxes(src: HTMLCanvasElement): Box[] {
  const W = src.width, H = src.height, cs = 8, gw = Math.floor(W / cs), gh = Math.floor(H / cs);
  const d = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const L = (x: number, y: number) => { const i = (y * W + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
  const e = new Float32Array(gw * gh); let max = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let sx = 0, sy = 0;
    for (let y = gy * cs; y < gy * cs + cs; y += 2) for (let x = gx * cs; x < gx * cs + cs - 1; x++) { sx += Math.abs(L(x + 1, y) - L(x, y)); }
    for (let x = gx * cs; x < gx * cs + cs; x += 2) for (let y = gy * cs; y < gy * cs + cs - 1; y++) { sy += Math.abs(L(x, y + 1) - L(x, y)); }
    const v = Math.max(sx, sy) > 0 ? Math.abs(sx - sy) : 0; e[gy * gw + gx] = v; if (v > max) max = v;
  }
  if (!max) return [];
  const on = new Uint8Array(gw * gh); for (let i = 0; i < on.length; i++) on[i] = e[i] > max * 0.2 ? 1 : 0;
  // cierre horizontal/vertical de 1 celda para unir las barras
  const seen = new Uint8Array(gw * gh), boxes: (Box & { n: number })[] = [];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || seen[s]) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0; const st: number[] = [s]; seen[s] = 1;
    while (st.length) { const k = st.pop()!, x = k % gw, y = (k / gw) | 0; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (on[j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
    if (n >= 4) boxes.push({ x: x0 * cs, y: y0 * cs, w: (x1 - x0 + 1) * cs, h: (y1 - y0 + 1) * cs, n });
  }
  return boxes.sort((a, z) => z.n - a.n).slice(0, 3);
}
/** Dentro de la caja: promedia las filas centrales (quita ruido), ubica el inicio y fin exacto de las barras y arma
    una imagen limpia sobre blanco (con su zona de silencio), ampliada. Sirve para códigos 1D (IMEI de la caja). */
export function stripOf(src: HTMLCanvasElement, b: Box, scale: number): HTMLCanvasElement[] | null {
  const W = src.width, x0 = Math.max(0, b.x - 16), x1 = Math.min(W, b.x + b.w + 16), w = x1 - x0;
  // Filas que son solo barras: las de más cambios horizontales y parecidas entre sí (sin los números de abajo).
  const by0 = Math.max(0, b.y - 8), bh = Math.min(src.height - by0, b.h + 16);
  const D = src.getContext("2d", { willReadFrequently: true })!.getImageData(x0, by0, w, bh).data;
  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return D[i] * 0.299 + D[i + 1] * 0.587 + D[i + 2] * 0.114; };
  const en: number[] = []; for (let y = 0; y < bh; y++) { let e = 0; for (let x = 1; x < w; x++) e += Math.abs(lum(x, y) - lum(x - 1, y)); en.push(e); }
  const emax = Math.max(...en), peak = en.indexOf(emax);
  let ya = peak, yb = peak; while (ya > 0 && en[ya - 1] > emax * 0.6) ya--; while (yb < bh - 1 && en[yb + 1] > emax * 0.6) yb++;
  const cut = Math.floor((yb - ya) * 0.15); ya += cut; yb -= cut;
  const y0 = by0 + ya, hh = Math.max(1, yb - ya + 1);
  const d = src.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, w, hh).data;
  const row = new Float32Array(w);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; row[x] += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / hh; }
  let lo = 255, hi = 0; for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 40) return null;
  const t = (lo + hi) / 2, cr: number[] = [];
  for (let x = 1; x < w; x++) if ((row[x - 1] < t) !== (row[x] < t)) cr.push(x);
  if (cr.length < 20) return null;
  const gaps = cr.slice(1).map((v, i) => v - cr[i]).sort((a, z) => a - z), med = gaps[gaps.length >> 1];
  let best = [0, 0], s0 = 0;
  for (let i = 1; i <= cr.length; i++) if (i === cr.length || cr[i] - cr[i - 1] > med * 6) { if (i - s0 > best[1] - best[0]) best = [s0, i]; s0 = i; }
  const a = cr[best[0]], z = cr[best[1] - 1];
  if (best[1] - best[0] < 20) return null;
  const locMean = (R: number) => { const o = new Float32Array(w); for (let x = 0; x < w; x++) { let sum = 0, n = 0; for (let k = Math.max(0, x - R); k <= Math.min(w - 1, x + R); k++) { sum += row[k]; n++; } o[x] = sum / n; } return o; };
  const at = (arr: Float32Array, fx: number) => { const i = Math.max(0, Math.min(w - 2, Math.floor(fx))), f = fx - i; return arr[i] * (1 - f) + arr[i + 1] * f; };
  const locs = [1, 2, 3].map((k) => locMean(Math.max(2, Math.round(med * k))));
  const bw = z - a + 2, q = Math.round(bw * 0.12) + 10, outs: HTMLCanvasElement[] = [];
  // Varias versiones (contraste directo y umbral local con 3 vecindades): el lector valida con su dígito de control.
  for (const mode of [-1, 0, 1, 2]) {
    const out = document.createElement("canvas");
    out.width = Math.round((bw + 2 * q) * scale); out.height = 24;
    const g = out.getContext("2d")!; const id = g.createImageData(out.width, out.height);
    for (let X = 0; X < out.width; X++) {
      const fx = X / scale - q + a - 1; let v = 255;
      if (fx >= a - 1 && fx <= z + 1) v = mode < 0 ? Math.max(0, Math.min(255, ((at(row, fx) - lo) / (hi - lo)) * 255)) : at(row, fx) < at(locs[mode], fx) ? 0 : 255;
      for (let Y = 0; Y < out.height; Y++) { const kk = (Y * out.width + X) * 4; id.data[kk] = id.data[kk + 1] = id.data[kk + 2] = v; id.data[kk + 3] = 255; }
    }
    g.putImageData(id, 0, 0); outs.push(out);
  }
  return outs;
}
