/* =====================================================
   ESCÁNER · cámara para leer IMEI, serial, modelo, capacidad, color y batería
   - Códigos de barras: de la caja (IMEI y serial) o la pantalla *#06#. Usa el lector nativo del navegador si existe (Chrome/Android)
     y ZXing en el resto (iPhone/Safari, escritorio).
   - Texto (OCR): pantalla Ajustes → General → Información, o la etiqueta de la caja. Tesseract.js, todo dentro del proyecto.
   - Nada sale del dispositivo: las fotos no se envían a ningún servidor.
   ===================================================== */
const SC={stream:null,mode:'fill',cat:'iPhone',found:new Map(),R:{},busy:false,timer:null,onDone:null,det:null,torch:false,ocrBusy:false,lastBeep:0};
const absUrl=p=>new URL(p,location.href).href;
const _loaded={};
function loadScript(src){return _loaded[src]||(_loaded[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('No se pudo cargar '+src));document.head.appendChild(s)}))}

/* ---------- Clasificación de lo que se lee ---------- */
function classifyCode(raw){
  const v=String(raw).trim().toUpperCase().replace(/\s+/g,'');
  if(/^\d{15}$/.test(v))return luhnOk(v)?{k:'imei',v}:{k:'other',v};
  if(/^\d{14}$/.test(v))return{k:'meid',v};
  if(/^[A-Z0-9]{5}[A-Z]{1,2}\/[A-Z]$/.test(v))return{k:'part',v};
  if(/^A\d{4}$/.test(v))return{k:'modelno',v};
  let s=v;if(/^S[A-Z0-9]{10,12}$/.test(v))s=v.slice(1);            /* las cajas de Apple anteponen una "S" al serial */
  if(/^[A-Z0-9]{8,14}$/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return{k:'serial',v:s};
  return{k:'other',v};
}
const COLORS=[['titanio natural',/natural\s*titanium|titanio\s*natural/i],['titanio negro',/black\s*titanium|titanio\s*negro/i],['titanio blanco',/white\s*titanium|titanio\s*blanco/i],['titanio desierto',/desert\s*titanium|titanio\s*desierto/i],
 ['titanio azul',/blue\s*titanium|titanio\s*azul/i],['titanio naranja',/cosmic\s*orange|titanio\s*naranja|naranja\s*c[oó]smico/i],['azul profundo',/deep\s*blue|azul\s*profundo/i],['ultramarino',/ultramarine|ultramarino/i],
 ['gris espacial',/space\s*gr[ae]y|gris\s*espacial/i],['negro espacial',/space\s*black|negro\s*espacial/i],['blanco estelar',/starlight|blanco\s*estelar/i],['medianoche',/midnight|medianoche/i],
 ['azul cielo',/sky\s*blue|azul\s*cielo/i],['verde azulado',/teal|verde\s*azulado/i],['rosado',/\bpink\b|\brosa(do)?\b/i],['morado',/\bpurple\b|\bmorado\b|\blila\b/i],['amarillo',/yellow|amarillo/i],
 ['verde',/\bgreen\b|\bverde\b/i],['azul',/\bblue\b|\bazul\b/i],['rojo',/\bred\b|\brojo\b|product\)?\s*red/i],['plata',/\bsilver\b|\bplata\b/i],['oro',/\bgold\b|\boro\b/i],['blanco',/\bwhite\b|\bblanco\b/i],['negro',/\bblack\b|\bnegro\b/i]];
const capWords=s=>s.charAt(0).toUpperCase()+s.slice(1);
const normName=s=>String(s).toLowerCase().replace(/[“”"″]/g,'').replace(/[^a-z0-9]+/g,'');
const catOfName=n=>{const c=CAT_BY_NAME[n];if(c)return c.cat;if(/^iphone/i.test(n))return'iPhone';if(/ipad/i.test(n))return'iPad';if(/macbook|imac|mac\s?mini|mac\s?studio/i.test(n))return'Mac';if(/watch/i.test(n))return'Apple Watch';if(/airpods/i.test(n))return'AirPods';return null};

/* Extrae los datos de un texto leído por OCR (español o inglés) */
function parseLabelText(raw,cat){
  const flat=String(raw||'').replace(/[|]/g,'I').replace(/\s+/g,' ');const out={};
  /* IMEI: cualquier secuencia de 15 dígitos (con espacios o guiones) que pase la validación */
  for(const m of flat.matchAll(/(?:\d[\s\-\/]?){15,19}/g)){const d=m[0].replace(/\D/g,'');for(let i=0;i+15<=d.length;i++){const c=d.slice(i,i+15);if(luhnOk(c)){out.imei=c;break}}if(out.imei)break}
  /* Serial */
  let m=/(?:serial(?:\s*(?:number|no\.?|#))?|n\S{0,3}mero\s*de\s*serie|(?:no|n\S{0,2}m)\.?\s*de\s*serie|\bserie|s\/n)\s*[:#.]?\s*([A-Z0-9]{9,13})\b/i.exec(flat);   /* tolera errores típicos del OCR ("NiUmero") */
  if(m&&/[A-Za-z]/.test(m[1])&&/\d/.test(m[1]))out.serial=m[1].toUpperCase();
  /* Modelo: primero contra el catálogo, luego por patrón */
  const nf=normName(flat),pool=CATALOG.filter(c=>!cat||c.cat===cat||!cat);
  let best=null;CATALOG.forEach(c=>{const n=normName(c.name.replace(/\s+\d+\s*(gb|tb)\b.*$/i,'').replace(/\s+\d+\/\d+$/,''));if(n.length>5&&nf.includes(n)&&(!best||n.length>best.n.length))best={c,n}});
  if(best)out.name=best.c.name;
  if(!out.name){
    const ip=/iphone\s?(se\s?\(?[^)\d]*\d?[^)]*\)?|xs max|xs|xr|x|\d{1,2}(?:\s?(?:pro max|pro|plus|mini))?)/i.exec(flat);
    if(ip){const cand='iPhone '+ip[1].replace(/\s+/g,' ').trim().replace(/\b(pro max|pro|plus|mini)\b/gi,w=>capWords(w.toLowerCase()).replace('Max','Max'));out.name=CAT_BY_NAME[cand]?cand:cand.replace(/\s{2,}/g,' ')}
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
  const info=[];
  m=/(?:versi[oó]n\s*de\s*(?:ios|ipados)|(?:ios|ipados)\s*version|software\s*version)\s*[:]?\s*(\d{1,2}(?:\.\d+){0,2})/i.exec(flat);if(m)info.push('iOS '+m[1]);
  m=/(?:cantidad\s*de\s*ciclos|cycle\s*count|\bciclos)\D{0,10}(\d{1,4})\b/i.exec(flat);if(m)info.push(m[1]+' ciclos de batería');
  if(/sin\s*restricciones\s*de\s*sim|no\s*sim\s*restrictions/i.test(flat))info.push('Operador: sin restricciones de SIM');
  else if(/bloqueo\s*de(?:l)?\s*operador|carrier\s*lock|sim\s*lock/i.test(flat))info.push('Revisar bloqueo de operador');
  if(info.length)out.info=info;
  return out;
}
/* Une lo leído sin pisar lo que ya está confirmado */
function mergeRead(into,from){Object.keys(from).forEach(k=>{const v=from[k];if(v==null||v==='')return;if(Array.isArray(v)){into[k]=[...new Set([...(into[k]||[]),...v])];return}if(into[k]==null||into[k]==='')into[k]=v});return into}

/* ---------- Lectura de códigos de barras ---------- */
let _zx=null;
function zxReader(){
  if(_zx)return _zx;const H=new Map(),F=ZXing.BarcodeFormat;
  H.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[F.CODE_128,F.CODE_39,F.ITF,F.EAN_13,F.QR_CODE,F.DATA_MATRIX,F.PDF_417]);H.set(ZXing.DecodeHintType.TRY_HARDER,true);
  _zx=new ZXing.MultiFormatReader();_zx.setHints(H);return _zx;
}
function zxRegion(src,x,y,w,h){
  const c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);
  try{const bmp=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c)));return zxReader().decodeWithState(bmp).getText()}catch(e){return null}
}
async function decodeCodes(canvas,thorough){
  const found=new Set();
  if('BarcodeDetector' in window){
    try{if(!SC.det)SC.det=new BarcodeDetector();(await SC.det.detect(canvas)).forEach(b=>b.rawValue&&found.add(b.rawValue));if(found.size&&!thorough)return[...found]}catch(e){}
  }
  if(typeof ZXing==='undefined')return[...found];
  const W=canvas.width,H=canvas.height;
  const t=zxRegion(canvas,0,0,W,H);if(t)found.add(t);
  /* la etiqueta tiene varios códigos apilados: se lee por franjas */
  const bands=thorough?7:4,bh=H/(bands*.55);
  for(let i=0;i<bands;i++){const y=Math.min(H-bh,i*(H-bh)/(bands-1||1));const r=zxRegion(canvas,0,y,W,bh);if(r)found.add(r)}
  return[...found];
}

/* ---------- Lectura de texto (OCR) ---------- */
let _worker=null;
const OCR_TXT={'loading tesseract core':'Preparando el lector de texto…','initializing tesseract':'Preparando el lector de texto…','loading language traineddata':'Cargando idioma (solo la primera vez)…','initializing api':'Preparando…','recognizing text':'Leyendo texto…'};
async function ocrCanvas(canvas,onStatus){
  await loadScript('assets/vendor/tesseract/tesseract.min.js');
  if(!_worker){
    _worker=await Tesseract.createWorker('eng',1,{workerPath:absUrl('assets/vendor/tesseract/worker.min.js'),corePath:absUrl('assets/vendor/tesseract'),langPath:absUrl('assets/vendor/tesseract/lang'),gzip:true,
      logger:m=>{if(onStatus)onStatus((OCR_TXT[m.status]||'Procesando…')+(m.progress&&m.status==='recognizing text'?' '+Math.round(m.progress*100)+'%':''))}});
  }
  /* preprocesado: escala de grises y contraste */
  const k=Math.min(1,2200/Math.max(canvas.width,canvas.height)),w=Math.round(canvas.width*k),h=Math.round(canvas.height*k);
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(canvas,0,0,w,h);
  const id=x.getImageData(0,0,w,h),d=id.data,hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=4){const g=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)|0;d[i]=g;hist[g]++}
  let lo=0,hi=255,acc=0;const tot=w*h;for(let i=0;i<256;i++){acc+=hist[i];if(acc>tot*.02){lo=i;break}}acc=0;for(let i=255;i>=0;i--){acc+=hist[i];if(acc>tot*.02){hi=i;break}}
  let mean=0;for(let i=0;i<256;i++)mean+=i*hist[i];mean/=tot;const dark=mean<115;    /* modo oscuro de iPhone: texto claro sobre fondo negro */
  const gam=new Uint8Array(256);for(let i=0;i<256;i++)gam[i]=Math.round(255*Math.pow(i/255,1.9));   /* oscurece los grises del texto secundario (p. ej. el valor de "Ciclos") */
  const sc=255/Math.max(1,hi-lo);for(let i=0;i<d.length;i+=4){let v=dark?255-d[i]:Math.max(0,Math.min(255,((d[i]-lo)*sc)|0));v=gam[v];d[i]=d[i+1]=d[i+2]=v}   /* oscuro: solo invertir (estirar el contraste borraría el texto) */
  x.putImageData(id,0,0);
  const r=await _worker.recognize(c);return r.data.text||'';
}

/* ---------- Interfaz del escáner ---------- */
function scanHint(){
  if(SC.mode==='multi')return 'Apunta a cada código de barras. Cada IMEI o serial nuevo se agrega solo.';
  if(SC.mode==='pick')return 'Apunta al código de barras del equipo.';
  if(SC.tab==='screen')return `<b>Equipo usado o sin caja.</b> Muestra en el equipo:<ol class="scan-steps"><li><b>Ajustes → General → Información</b> y toca <b>📸 Leer pantalla</b>: modelo, capacidad, serial, IMEI y versión de iOS.</li><li><b>Ajustes → Batería → Salud de la batería</b> y toca de nuevo: capacidad máxima y ciclos.</li><li>Para el IMEI también sirve marcar <b>*#06#</b>.</li></ol>Las lecturas se combinan. Sube el brillo y evita reflejos; funciona con modo oscuro.${SC.caps?` <b>Capturas: ${SC.caps}</b>`:''}`;
  return 'Apunta a los códigos de barras de la caja (IMEI y serial). Para leer también el modelo, capacidad y color de la etiqueta, toca <b>📸 Leer texto</b>.';
}
function scanChromeHtml(){
  const tabs=SC.mode==='fill'?`<div class="scan-tabs"><button class="${SC.tab==='box'?'on':''}" data-a="scanTab" data-t="box">📦 Caja o etiqueta</button><button class="${SC.tab==='screen'?'on':''}" data-a="scanTab" data-t="screen">📱 Pantalla del equipo (usado)</button></div>`:'';
  return tabs;
}
function paintScanChrome(){
  const t=$('#scan-tabs');if(t)t.innerHTML=scanChromeHtml();const h=$('#scan-hint');if(h)h.innerHTML=scanHint();
  const b=$('#sc-ocr');if(b)b.textContent=SC.tab==='screen'?'📸 Leer pantalla':'📸 Leer texto';
}
ACT.scanTab=d=>{SC.tab=d.t;S.scanTab=d.t;paintScanChrome()};
function openScanner(opts){
  Object.assign(SC,{mode:opts.mode||'fill',cat:opts.cat||'iPhone',onDone:opts.onDone,found:new Map(),R:{},busy:false,ocrBusy:false,torch:false,list:[],caps:0,tab:opts.tab||S.scanTab||'box'});
  let el=$('#scanner');if(!el){el=document.createElement('div');el.id='scanner';document.body.appendChild(el)}
  el.className='scan on';
  el.innerHTML=`<div class="scan-box"><div class="scan-head"><b>📷 ${SC.mode==='multi'?'Escanear varios':SC.mode==='pick'?'Escanear para vender':'Escanear producto'}</b><button class="x" data-a="scanClose" aria-label="Cerrar">×</button></div>
   <div id="scan-tabs">${scanChromeHtml()}</div>
   <div class="scan-view"><video id="scan-video" playsinline muted autoplay></video><div class="scan-frame"></div><div class="scan-msg" id="scan-msg">Iniciando cámara…</div></div>
   <div class="scan-tools"><button class="btn primary" data-a="scanOcr" id="sc-ocr">${SC.tab==='screen'?'📸 Leer pantalla':'📸 Leer texto'}</button>
    <label class="btn" style="cursor:pointer">🖼️ Tomar o subir foto<input type="file" id="scan-file" accept="image/*" capture="environment" hidden></label>
    <button class="btn" data-a="scanTorch" id="sc-torch" hidden>🔦 Luz</button></div>
   <div class="scan-hint" id="scan-hint">${scanHint()}</div><div id="scan-res"></div></div>`;
  $('body').style.overflow='hidden';
  startCamera();paintScanRes();
  loadScript('assets/vendor/zxing.min.js').catch(()=>{});
}
async function startCamera(){
  const msg=$('#scan-msg');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||(!window.isSecureContext&&location.hostname!=='localhost')){msg.textContent='Este navegador no permite abrir la cámara aquí. Usa “Tomar o subir foto”.';return}
  try{
    SC.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    const v=$('#scan-video');if(!v){stopCamera();return}v.srcObject=SC.stream;await v.play().catch(()=>{});
    const tr=SC.stream.getVideoTracks()[0],cap=tr.getCapabilities?tr.getCapabilities():{};
    if(cap.torch)$('#sc-torch').hidden=false;
    try{if(cap.focusMode&&cap.focusMode.includes('continuous'))await tr.applyConstraints({advanced:[{focusMode:'continuous'}]})}catch(e){}
    msg.textContent='Buscando códigos…';scanLoop();
  }catch(e){
    msg.textContent=(e&&e.name==='NotAllowedError')?'Permiso de cámara denegado. Actívalo en el navegador o usa “Tomar o subir foto”.':'No se pudo abrir la cámara. Usa “Tomar o subir foto”.';
  }
}
function stopCamera(){clearInterval(SC.timer);SC.timer=null;if(SC.stream){SC.stream.getTracks().forEach(t=>t.stop());SC.stream=null}}
function closeScanner(){stopCamera();const el=$('#scanner');if(el)el.remove();$('body').style.overflow=''}
function scanLoop(){
  const v=$('#scan-video');if(!v)return;
  SC.timer=setInterval(async()=>{
    if(SC.busy||SC.ocrBusy||!v.videoWidth||!$('#scanner'))return;SC.busy=true;
    try{
      const k=Math.min(1,1280/v.videoWidth),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*k);c.height=Math.round(v.videoHeight*k);
      c.getContext('2d',{willReadFrequently:true}).drawImage(v,0,0,c.width,c.height);
      (await decodeCodes(c,false)).forEach(handleCode);
    }catch(e){}finally{SC.busy=false}
  },220);
}
function beep(){const n=Date.now();if(n-SC.lastBeep<400)return;SC.lastBeep=n;try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}
  try{const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.frequency.value=1200;g.gain.value=.05;o.connect(g);g.connect(a.destination);o.start();setTimeout(()=>{o.stop();a.close()},90)}catch(e){}}
function handleCode(raw){
  const c=classifyCode(raw);if(c.k==='meid'||c.k==='other'&&SC.mode!=='pick')return;
  const key=c.k+':'+c.v;if(SC.found.has(key))return;SC.found.set(key,c);beep();
  if(SC.mode==='pick'){const cb=SC.onDone;closeScanner();cb&&cb(c.v);return}
  if(SC.mode==='multi'){if(c.k==='imei'||c.k==='serial'){SC.list.push(c.v);paintScanRes()}return}
  if(c.k==='imei'&&!SC.R.imei)SC.R.imei=c.v;
  else if(c.k==='serial'&&!SC.R.serial)SC.R.serial=c.v;
  else if(c.k==='part'&&!SC.R.part)SC.R.part=c.v;
  else if(c.k==='modelno'&&!SC.R.modelno)SC.R.modelno=c.v;
  paintScanRes();
}
ACT.scanClose=()=>closeScanner();
ACT.scanTorch=async()=>{try{const tr=SC.stream.getVideoTracks()[0];SC.torch=!SC.torch;await tr.applyConstraints({advanced:[{torch:SC.torch}]})}catch(e){toast('Este dispositivo no permite encender la luz')}};
ACT.scanOcr=async()=>{
  const v=$('#scan-video');if(!v||!v.videoWidth){toast('La cámara aún no está lista');return}
  const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
  await runOcr(c);
};
async function runOcr(canvas){
  if(SC.ocrBusy)return;SC.ocrBusy=true;const st=$('#scan-msg');paintScanRes();
  try{
    const t0=await ocrCanvas(canvas,m=>{const e=$('#scan-msg');if(e)e.textContent=m});
    const got=parseLabelText(t0,SC.cat);SC.lastText=t0;
    const n=Object.keys(got).length;
    mergeRead(SC.R,got);if(n)SC.caps++;
    if(SC.R.batt&&!SC.R.cond&&SC.tab==='screen')SC.R.cond=SC.R.batt>=88?'Pre-owned':'Usado';
    paintScanChrome();
    if(SC.R.imei)SC.found.set('imei:'+SC.R.imei,{k:'imei',v:SC.R.imei});
    if($('#scan-msg'))$('#scan-msg').textContent=n?'Listo: revisa los datos leídos abajo.':'No se reconoció texto útil. Acerca la cámara y evita reflejos.';
  }catch(e){if($('#scan-msg'))$('#scan-msg').textContent='No se pudo leer el texto: '+(e&&e.message?e.message:'error')+'. Si tu navegador es antiguo, actualízalo.'}
  finally{SC.ocrBusy=false;paintScanRes()}
}
/* Foto (cámara del celular o archivo): lee códigos de barras y luego el texto */
async function scanFromFile(file){
  if(!file)return;const msg=$('#scan-msg');if(msg)msg.textContent='Leyendo la foto…';
  try{
    const url=URL.createObjectURL(file),img=await new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>j(new Error('imagen dañada'));i.src=url});
    const k=Math.min(1,2000/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
    await loadScript('assets/vendor/zxing.min.js').catch(()=>{});
    (await decodeCodes(c,true)).forEach(handleCode);paintScanRes();
    if(SC.mode==='fill')await runOcr(c);else if(msg)msg.textContent=SC.found.size?'Listo.':'No se encontraron códigos en la foto.';
  }catch(e){if($('#scan-msg'))$('#scan-msg').textContent='No se pudo leer la foto: '+(e&&e.message?e.message:'error')}
}
function paintScanRes(){
  const el=$('#scan-res');if(!el)return;
  if(SC.mode==='multi'){
    el.innerHTML=`<div class="scan-list"><b>${SC.list.length}</b> código(s) leído(s)${SC.list.length?`<div class="scan-chips">${SC.list.slice(-12).map(c=>`<span class="chip ok">${esc(c)}</span>`).join('')}</div>`:''}</div>
     <button class="btn primary" style="width:100%;justify-content:center;margin-top:10px" data-a="scanDone" ${SC.list.length?'':'disabled'}>Agregar ${SC.list.length||''} a la lista</button>`;return;
  }
  if(SC.mode==='pick'){el.innerHTML='';return}
  const R=SC.R,cat=SC.cat,names=CATALOG.filter(c=>!cat||c.cat===cat);
  const has=Object.keys(R).some(k=>['imei','serial','name'].includes(k)&&R[k]);
  el.innerHTML=`<div class="scan-form f"><datalist id="dl-scan">${CATALOG.map(n=>`<option value="${esc(n.name)}">`).join('')}</datalist>
   <div class="row"><div><label>IMEI ${R.imei?'✅':''}</label><input id="sc-imei" class="mono" value="${esc(R.imei||'')}" placeholder="Sin leer"></div><div><label>Serial ${R.serial?'✅':''}</label><input id="sc-serial" class="mono" value="${esc(R.serial||'')}" placeholder="Sin leer"></div></div>
   <div class="row"><div style="grid-column:span 2"><label>Modelo ${R.name?'✅':''}</label><input id="sc-name" list="dl-scan" value="${esc(R.name||'')}" placeholder="Sin leer"></div><div><label>Capacidad ${R.spec?'✅':''}</label><input id="sc-spec" value="${esc(R.spec||'')}" placeholder="Sin leer"></div></div>
   <div class="row"><div><label>Color ${R.color?'✅':''}</label><input id="sc-color" value="${esc(R.color||'')}" placeholder="Sin leer"></div><div><label>Batería % ${R.batt?'✅':''}</label><input id="sc-batt" type="number" min="1" max="100" value="${R.batt||''}" placeholder="Sin leer"></div>
    <div><label>Condición ${R.cond?'✅':''}</label><select id="sc-cond"><option value="">— Elegir —</option>${CONDS.map(c=>`<option ${R.cond===c?'selected':''}>${c}</option>`).join('')}</select></div></div>
   <div class="row"><div style="grid-column:span 3"><label>Notas del equipo ${R.info&&R.info.length?'✅':''}</label><input id="sc-notes" value="${esc([R.part,R.modelno,...(R.info||[])].filter(Boolean).join(' · '))}" placeholder="Versión de iOS, ciclos, número de parte… (opcional)"></div></div>
   ${SC.ocrBusy?'<div class="note">⏳ Leyendo texto…</div>':''}
   <button class="btn primary" style="width:100%;justify-content:center;height:42px" data-a="scanDone" ${has&&!SC.ocrBusy?'':'disabled'}>✅ Usar estos datos</button>
   <div class="note">Revisa y corrige antes de usar. Las fotos se procesan en tu dispositivo y no se envían a ningún servidor.</div></div>`;
}
ACT.scanDone=()=>{
  const cb=SC.onDone;let data;
  if(SC.mode==='multi')data=SC.list.slice();
  else data={cat:SC.cat,imei:val('sc-imei').replace(/\D/g,''),serial:val('sc-serial').toUpperCase(),name:val('sc-name'),spec:val('sc-spec'),color:val('sc-color'),batt:num('sc-batt')||null,cond:val('sc-cond'),extra:val('sc-notes')};
  closeScanner();cb&&cb(data);
};

/* ---------- Conexión con las pantallas ---------- */
function fillFromScan(d,cat){                       /* llena el formulario de productos que no son iPhone */
  const set=(id,v)=>{const e=$('#'+id);if(e&&v!=null&&v!=='')e.value=v};
  set('i-name',d.name);set('i-spec',d.spec);set('i-color',d.color);set('i-serial',d.serial||'');set('i-batt',d.batt);
  const notes=[d.imei?'IMEI: '+d.imei:'',d.extra].filter(Boolean).join(' · ');if(notes)set('i-notes',notes);
  set('i-cond',d.cond);itemAutofill(true);
}
function applyScanFill(){                            /* iPhone: se aplica cuando el IMEI ya fue verificado */
  const d=S.scanFill;if(!d||!$('#i-name'))return;
  const set=(id,v)=>{const e=$('#'+id);if(e&&v!=null&&v!=='')e.value=v};
  set('i-name',d.name);set('i-spec',d.spec);set('i-color',d.color);set('i-batt',d.batt);set('i-cond',d.cond);
  const notes=[d.serial?'Serial Apple: '+d.serial:'',d.extra].filter(Boolean).join(' · ');if(notes)set('i-notes',notes);
  if(S.v&&S.v.res.model&&d.name&&S.v.res.model.name!==d.name)toast('⚠️ El modelo leído ('+esc(d.name)+') no coincide con el del IMEI ('+esc(S.v.res.model.name)+'). Revísalo.');
  itemAutofill(true);S.scanFill=null;toast('📷 Datos completados con la cámara. Revisa antes de guardar.');
}
ACT.scanAdd=()=>{
  if(!need('inv_edit'))return;
  openScanner({mode:'fill',cat:S.addCat||'iPhone',onDone:d=>{
    const guess=catOfName(d.name||'')||S.addCat||'iPhone';S.addCat=guess;S.scanFill=d;
    if(S.view!=='ingreso')go('ingreso');else render();
    if(guess==='iPhone'){if(d.imei&&d.imei.length===15){$('#imei').value=d.imei;doVerify()}else toast('No se leyó el IMEI: escríbelo o escanea su código de barras para verificarlo.')}
    else{fillFromScan(d,guess);S.scanFill=null;toast('📷 Datos completados con la cámara. Revisa antes de guardar.')}
  }});
};
ACT.scanTi=()=>openScanner({mode:'fill',cat:'iPhone',tab:'screen',onDone:d=>{
  tiInit();if(d.imei)S.ti.imei=d.imei;const m=CATALOG.find(c=>c.cat==='iPhone'&&c.name===d.name);if(m)S.ti.model=m.name;
  const gb=/(\d+)\s*(GB|TB)/i.exec(d.spec||'');if(gb){const n=+gb[1]*(/TB/i.test(gb[2])?1024:1);if([128,256,512,1024].includes(n))S.ti.gb=n}
  if(d.batt)S.ti.batt=d.batt;render();toast('📷 Datos leídos. Revisa el estado del equipo.')}});
ACT.scanLot=()=>openScanner({mode:'multi',cat:$('#rc-cat')?$('#rc-cat').value:'iPhone',onDone:list=>{
  const t=$('#rc-ser');if(!t)return;t.value=(t.value.trim()?t.value.trim()+'\n':'')+list.join('\n');toast('📷 '+list.length+' código(s) agregados a la lista')}});
ACT.scanPos=()=>openScanner({mode:'pick',onDone:code=>{
  const it=DB.items.find(i=>isAvail(i)&&(i.serial===code||i.sku===code));
  if(!it){toast('No encontré «'+esc(code)+'» entre los productos disponibles');return}
  posAddItem(it.id);posPaint();toast('✅ '+esc(uname(it))+' agregado a la venta')}});
