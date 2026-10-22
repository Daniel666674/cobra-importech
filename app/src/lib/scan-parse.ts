import { CATALOG, catalogEntry } from "./catalog";
import { luhnOk } from "./imei";

export type ScanRead = { imei?: string; imei2?: string; serial?: string; name?: string; spec?: string; batt?: number; color?: string; part?: string; modelno?: string; info?: string[] };

const capWords = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const normName = (s: string) => String(s).toLowerCase().replace(/[“”"″]/g, "").replace(/[^a-z0-9]+/g, "");
const COLORS: [string, RegExp][] = [['titanio natural',/natural\s*titanium|titanio\s*natural/i],['titanio negro',/black\s*titanium|titanio\s*negro/i],['titanio blanco',/white\s*titanium|titanio\s*blanco/i],['titanio desierto',/desert\s*titanium|titanio\s*desierto/i],
 ['titanio azul',/blue\s*titanium|titanio\s*azul/i],['titanio naranja',/cosmic\s*orange|titanio\s*naranja|naranja\s*c[oó]smico/i],['azul profundo',/deep\s*blue|azul\s*profundo/i],['ultramarino',/ultramarine|ultramarino/i],
 ['gris espacial',/space\s*gr[ae]y|gris\s*espacial/i],['negro espacial',/space\s*black|negro\s*espacial/i],['blanco estelar',/starlight|blanco\s*estelar/i],['medianoche',/midnight|medianoche/i],
 ['azul cielo',/sky\s*blue|azul\s*cielo/i],['verde azulado',/teal|verde\s*azulado/i],['rosado',/\bpink\b|\brosa(do)?\b/i],['morado',/\bpurple\b|\bmorado\b|\blila\b/i],['amarillo',/yellow|amarillo/i],
 ['verde',/\bgreen\b|\bverde\b/i],['azul',/\bblue\b|\bazul\b/i],['rojo',/\bred\b|\brojo\b|product\)?\s*red/i],['plata',/\bsilver\b|\bplata\b/i],['oro',/\bgold\b|\boro\b/i],['blanco',/\bwhite\b|\bblanco\b/i],['negro',/\bblack\b|\bnegro\b/i]];
export type CodeKind = { k: "imei" | "meid" | "part" | "modelno" | "serial" | "other"; v: string };
export function classifyCode(raw: string): CodeKind {
  const v=String(raw).trim().toUpperCase().replace(/\s+/g,'');
  if(/^\d{15}$/.test(v))return luhnOk(v)?{k:'imei',v}:{k:'other',v};
  if(/^\d{14}$/.test(v))return{k:'meid',v};
  if(/^[A-Z0-9]{5}[A-Z]{1,2}\/[A-Z]$/.test(v))return{k:'part',v};
  if(/^A\d{4}$/.test(v))return{k:'modelno',v};
  let s=v;if(/^S[A-Z0-9]{10,12}$/.test(v))s=v.slice(1);            /* las cajas de Apple anteponen una "S" al serial */
  if(/^[A-Z0-9]{8,14}$/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return{k:'serial',v:s};
  return{k:'other',v};
}

export function parseLabelText(raw: string, cat?: string): ScanRead {
  const flat=String(raw||'').replace(/[|]/g,'I').replace(/\s+/g,' ');const out: ScanRead = {};
  /* IMEI: cualquier secuencia de 15 dígitos (con espacios o guiones) que pase la validación */
  const imeis: string[] = [];
  for(const m of flat.matchAll(/(?:\d[\s\-\/]?){15,19}/g)){const d=m[0].replace(/\D/g,'');for(let i=0;i+15<=d.length;i++){const c=d.slice(i,i+15);if(luhnOk(c)){if(!imeis.includes(c))imeis.push(c);break}}}
  /* Doble SIM: el que viene después de «IMEI2» / «IMEI 2» es el segundo */
  const m2=/IMEI\s*2\s*[:#.]?\s*((?:\d[\s\-]?){15})/i.exec(flat);const i2=m2?m2[1].replace(/\D/g,''):'';
  if(i2&&luhnOk(i2)){out.imei2=i2;out.imei=imeis.find(x=>x!==i2)}else{out.imei=imeis[0];if(imeis[1])out.imei2=imeis[1]}
  if(!out.imei)delete out.imei;if(!out.imei2)delete out.imei2;
  /* Serial */
  let m=/(?:serial(?:\s*(?:number|no\.?|#))?|n\S{0,3}mero\s*de\s*serie|(?:no|n\S{0,2}m)\.?\s*de\s*serie|\bserie|s\/n)\s*[:#.]?\s*([A-Z0-9]{9,13})\b/i.exec(flat);   /* tolera errores típicos del OCR ("NiUmero") */
  if(m&&/[A-Za-z]/.test(m[1])&&/\d/.test(m[1]))out.serial=m[1].toUpperCase();
  /* Modelo: primero contra el catálogo, luego por patrón */
  const nf = normName(flat);
  void cat;
  let best: { c: (typeof CATALOG)[number]; n: string } | null = null;for (const c of CATALOG) {
    const n = normName(c.name.replace(/\s+\d+\s*(gb|tb)\b.*$/i, "").replace(/\s+\d+\/\d+$/, ""));
    if (n.length > 5 && nf.includes(n) && (!best || n.length > best.n.length)) best = { c, n };
  }
  if(best)out.name=best.c.name;
  if(!out.name){
    const ip=/iphone\s?(se\s?\(?[^)\d]*\d?[^)]*\)?|xs max|xs|xr|x|\d{1,2}(?:\s?(?:pro max|pro|plus|mini))?)/i.exec(flat);
    if(ip){const cand='iPhone '+ip[1].replace(/\s+/g,' ').trim().replace(/\b(pro max|pro|plus|mini)\b/gi,w=>capWords(w.toLowerCase()).replace('Max','Max'));out.name=catalogEntry(cand) ? cand : cand.replace(/\s{2,}/g, ' ')}
    const mc=/(macbook\s?(?:air|pro)|imac|mac\s?mini|mac\s?studio)/i.exec(flat);
    if(mc&&!out.name){const base=mc[1].replace(/\s+/g,' ').replace(/macbook\s?/i,'MacBook ').replace(/mac\s?mini/i,'Mac mini').replace(/mac\s?studio/i,'Mac Studio').replace(/imac/i,'iMac').replace(/(air|pro)$/i,w=>capWords(w.toLowerCase()));
      const chip=/\b(M[1-4])(?:\s?(Pro|Max|Ultra))?\b/.exec(flat),size=/\b(13|14|15|16|24)\b[- ]?(?:inch|pulgadas|")/i.exec(flat);
      const hit=CATALOG.find(c=>c.cat==='Mac'&&c.name.startsWith(base)&&(!chip||c.name.includes(chip[0].replace(/\s+/g,' ')))&&(!size||c.name.includes(size[1])));
      out.name=hit?hit.name:(base+(chip?' '+chip[0]:''))}
    const wt=/apple\s?watch\s?(series\s?\d+|ultra\s?\d?|se)/i.exec(flat);if(wt&&!out.name)out.name='Apple Watch '+capWords(wt[1].toLowerCase());
    const ap=/ipad\s?(pro|air|mini)?/i.exec(flat);if(ap&&!out.name)out.name=ap[0].replace(/\s+/g,' ').replace(/ipad/i,'iPad');
  }
  /* Capacidad (solo la escribimos si el producto la maneja aparte, como iPhone) */
  m=/(\d{2,4})\s?(GB|TB|G8)\b/i.exec(flat);if(m){const n=+m[1];out.spec=(/TB/i.test(m[2])?n+' TB':n+' GB')}
  /* Batería */
  m=/(?:capacidad\s*m[aá]xima|maximum\s*capacity|salud\s*de\s*la\s*bater[ií]a|battery\s*health)\D{0,20}(\d{2,3})\s?%/i.exec(flat);if(m&&+m[1]<=100)out.batt=+m[1];
  /* Color */
  for(const [name,re] of COLORS){if(re.test(flat)){out.color=capWords(name);break}}
  /* Números de parte y de modelo */
  m=/\b([A-Z0-9]{5}[A-Z]{1,2}\/[A-Z])\b/.exec(flat.toUpperCase());if(m)out.part=m[1];
  m=/\b(A\d{4})\b/.exec(flat.toUpperCase());if(m)out.modelno=m[1];
  /* Otros datos útiles de la pantalla Información y de Batería (equipos usados) */
  const info: string[] = [];
  m=/(?:versi[oó]n\s*de\s*(?:ios|ipados)|(?:ios|ipados)\s*version|software\s*version)\s*[:]?\s*(\d{1,2}(?:\.\d+){0,2})/i.exec(flat);if(m)info.push('iOS '+m[1]);
  m=/(?:cantidad\s*de\s*ciclos|cycle\s*count|\bciclos)\D{0,10}(\d{1,4})\b/i.exec(flat);if(m)info.push(m[1]+' ciclos de batería');
  if(/sin\s*restricciones\s*de\s*sim|no\s*sim\s*restrictions/i.test(flat))info.push('Operador: sin restricciones de SIM');
  else if(/bloqueo\s*de(?:l)?\s*operador|carrier\s*lock|sim\s*lock/i.test(flat))info.push('Revisar bloqueo de operador');
  if(info.length)out.info=info;
  return out;
}
/* Une lo leído sin pisar lo que ya está confirmado */

export function mergeRead(into: ScanRead, from: ScanRead): ScanRead {
  const a = into as Record<string, unknown>;
  const b = { ...from } as Record<string, unknown>;
  // Un segundo IMEI distinto (otro código de la caja u otra foto) va a IMEI 2.
  if (into.imei && from.imei && from.imei !== into.imei && from.imei !== into.imei2 && !into.imei2 && !from.imei2) { b.imei2 = from.imei; delete b.imei; }
  if (b.imei2 === into.imei) delete b.imei2;
  return mergeLoose(a, b) as ScanRead;
}
function mergeLoose(into: Record<string, unknown>, from: Record<string, unknown>) {Object.keys(from).forEach(k=>{const v=from[k];if(v==null||v==='')return;if(Array.isArray(v)){into[k]=[...new Set([...((into[k] as unknown[]) || []), ...v])];return}if(into[k]==null||into[k]==='')into[k]=v});return into}
