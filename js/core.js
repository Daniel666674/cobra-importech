/* =====================================================
   CORE · ayudantes, permisos, UI base, alertas, marca
   ===================================================== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(n<0?'-$':'$')+Math.abs(Math.round(n||0)).toLocaleString('es-CO');
const fmtM=n=>Math.abs(n)>=1e6?(n<0?'-':'')+'$'+(Math.abs(n)/1e6).toFixed(1).replace('.',',')+' M':fmt(n);
const fdate=t=>new Date(t).toLocaleDateString('es-CO',{day:'2-digit',month:'short'});
const fdatey=t=>new Date(t).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
const ftime=t=>new Date(t).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',hour12:false});
const fdt=t=>fdate(t)+' · '+ftime(t);
const daysAgo=t=>Math.max(0,Math.floor((Date.now()-t)/DAY));
const num=id=>{const e=$('#'+id);return e?(+e.value||0):0};
const val=id=>{const e=$('#'+id);return e?e.value.trim():''};
const initials=s=>String(s).split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();

/* ---------- Estado de UI y sesión ---------- */
const S={view:'dashboard',inv:{q:'',cat:'',cond:'',br:'',st:''},sales:{q:'',from:'',by:''},pos:null,ti:null,v:null,rep:{days:30},cfgTab:'negocio',usrTab:'usuarios',feedType:'',warrF:'',cliQ:''};
let ME=null;
const userById=id=>DB.users.find(u=>u.id===id);
const clientById=id=>DB.clients.find(c=>c.id===id);
const itemById=id=>DB.items.find(i=>i.id===id);
const saleById=id=>DB.sales.find(s=>s.id===id);
const planById=id=>DB.plans.find(p=>p.id===id);
const roleOf=u=>DB.roles[u.role]||{name:u.role,perms:[]};
function can(p){if(!ME)return false;const r=DB.roles[ME.role];if(!r)return false;return r.locked||r.perms.includes(p)}
function nextId(key,prefix,pad){DB.seq[key]=(DB.seq[key]||0)+1;return prefix+String(DB.seq[key]).padStart(pad||3,'0')}
async function sha(s){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('imp:'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return 'x:'+btoa(s)}}

/* ---------- Productos ---------- */
const uname=it=>it.name+(it.spec?' · '+it.spec:'');
const isQty=it=>it.track==='qty';
const stockQty=it=>isQty(it)?it.qty:(it.status==='Vendido'?0:1);
const inStock=it=>stockQty(it)>0;
const isAvail=it=>isQty(it)?it.qty>0:it.status==='En vitrina';
const daysIn=it=>daysAgo(it.acq);
const itemState=it=>isQty(it)?(it.qty<=0?'Agotado':'En vitrina'):it.status;
const stChip=s=>({'En vitrina':'ok','Apartado':'info','Vendido':'gray','En taller':'warn','En revisión':'pur','En tránsito':'info','Agotado':'bad'}[s]||'gray');
const chip=(t,c)=>`<span class="chip ${c}">${t}</span>`;
const condChip=c=>chip(c,COND_CHIP[c]||'gray');
const margin=it=>it.price-it.cost-(it.repairs||0);
const marginPct=it=>it.price?Math.round(margin(it)/it.price*100):0;
function addEv(it,title,detail,tone){it.tl.push({t:Date.now(),title,detail:detail||'',tone:tone||'',by:ME?ME.name.split(' ')[0]:'Sistema'})}
function logAct(type,ic,x){DB.feed.unshift({id:(DB.seq.feed=(DB.seq.feed||0)+1),t:Date.now(),type,ic,x,by:ME?ME.name:'Sistema'});if(DB.feed.length>400)DB.feed.length=400}
function listPrice(name,spec,cond){
  const c=CAT_BY_NAME[name];let base=c?c.retail:0;
  if(c&&c.cat==='iPhone'){const m=/(\d+)\s*(TB|GB)/i.exec(spec||'');if(m){const gb=m[2].toUpperCase()==='TB'?+m[1]*1024:+m[1];if(STOR[gb]!=null)base+=STOR[gb]}}
  return Math.round(base*(COND_F[cond]||1)/10000)*10000;
}
function stockValue(kind){return DB.items.filter(inStock).reduce((a,it)=>a+(kind==='price'?it.price:it.cost+(it.repairs||0)/Math.max(1,stockQty(it)))*stockQty(it),0)}

/* ---------- Ventas, planes, garantías ---------- */
const lineNet=l=>l.qty-(l.ret||0);
const saleNet=s=>Math.round(s.lines.reduce((a,l)=>a+lineNet(l)*l.price,0)*(1-(s.disc||0)/100));
const saleCost=s=>s.lines.reduce((a,l)=>a+lineNet(l)*l.cost,0);
const saleMargin=s=>saleNet(s)-saleCost(s);
const saleVoid=s=>s.lines.every(l=>lineNet(l)<=0);
const warrEnd=(s,l)=>s.t+l.warr*30.4*DAY;
const warrLeft=(s,l)=>Math.ceil((warrEnd(s,l)-Date.now())/DAY);
function planInfo(p){
  const cov=Math.min(p.n,Math.floor(p.paidAmt/p.cuota+1e-9)),bal=Math.max(0,p.total-p.abono-p.paidAmt);
  const next=p.start+(Math.min(cov+1,p.n))*30*DAY;
  let st='aldia';
  if(bal<=0)st='pagado';else if(next<Date.now())st='mora';else if(next-Date.now()<=5*DAY)st='porvencer';
  return{cov,bal,next,st,moraDays:st==='mora'?Math.floor((Date.now()-next)/DAY):0,nextAmt:Math.max(0,Math.min(bal,p.cuota*(cov+1)-p.paidAmt))};
}
const PLAN_ST={pagado:['Pagado','ok'],mora:['En mora','bad'],porvencer:['Vence pronto','warn'],aldia:['Al día','ok']};

/* ---------- UI: toast, modal, drawer ---------- */
function toast(m){const t=document.createElement('div');t.className='toast';t.innerHTML=m;$('#toast').appendChild(t);setTimeout(()=>t.remove(),4200)}
function openModal(html,wide){const m=$('#modal');m.innerHTML=html;m.classList.toggle('wide',!!wide);m.classList.add('on');$('#scrim').classList.add('on')}
function closeModal(){$('#modal').classList.remove('on');if(!$('#drawer').classList.contains('on'))$('#scrim').classList.remove('on')}
function closeDrawer(){$('#drawer').classList.remove('on');if(!$('#modal').classList.contains('on'))$('#scrim').classList.remove('on')}
function closeAll(){$('#modal').classList.remove('on');$('#drawer').classList.remove('on');$('#scrim').classList.remove('on')}
const modalHead=t=>`<div class="modal-h"><h2>${t}</h2><button class="x" data-a="closeModal" aria-label="Cerrar">×</button></div>`;
let CONFIRM_CB=null;
function confirmBox(title,msg,okLabel,cb,danger){
  CONFIRM_CB=cb;
  openModal(`${modalHead(title)}<div class="modal-b"><p style="font-size:14px;color:var(--t2)">${msg}</p></div><div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn ${danger?'danger':'primary'}" data-a="confirmOk">${okLabel||'Confirmar'}</button></div>`);
}
function need(p,msg){if(can(p))return true;toast('🔒 '+(msg||'Tu rol no tiene permiso para esta acción'));return false}

/* ---------- Descargas ---------- */
function download(name,text,type){const b=new Blob([text],{type:type||'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function downloadCSV(name,rows){
  const q=v=>{v=String(v??'');return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  download(name,'﻿'+rows.map(r=>r.map(q).join(';')).join('\n'),'text/csv;charset=utf-8');
}

/* ---------- Marca: logo, color, título ---------- */
function hexRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255]}
function shade(h,f){const [r,g,b]=hexRgb(h);const m=c=>Math.max(0,Math.min(255,Math.round(c*f)));return '#'+[m(r),m(g),m(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function applyBrand(){
  const s=DB.settings,root=document.documentElement,[r,g,b]=hexRgb(s.brand||'#4F46E5');
  root.style.setProperty('--brand',s.brand);root.style.setProperty('--brand-hover',shade(s.brand,.85));
  root.style.setProperty('--brand-light',`rgba(${r},${g},${b},.10)`);root.style.setProperty('--brand-border',`rgba(${r},${g},${b},.24)`);
  root.style.setProperty('--brand-glow',`rgba(${r},${g},${b},.35)`);root.style.setProperty('--sb-active-bg',`rgba(${r},${g},${b},.18)`);
  document.title=s.name+' · Control de inventario';
  let ic=document.querySelector('link[rel=icon]');if(!ic){ic=document.createElement('link');ic.rel='icon';document.head.appendChild(ic)}
  ic.href=s.logo||('data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${s.brand}"/><text x="32" y="43" font-size="30" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">${esc(initials(s.name)||'I')}</text></svg>`));
}
const logoHtml=(cls)=>DB.settings.logo?`<img class="${cls||'logo-img'}" src="${DB.settings.logo}" alt="Logo de ${esc(DB.settings.name)}">`:`<div class="logo-mark">${esc(initials(DB.settings.name)||'I')}</div>`;
/* Procesa el archivo del logo: redimensiona a máx. 320 px y devuelve una imagen PNG en base64 */
function processLogo(file){
  return new Promise((res,rej)=>{
    if(!file)return rej(new Error('Sin archivo'));
    if(!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type))return rej(new Error('Usa una imagen PNG, JPG, WEBP o SVG'));
    if(file.size>4*1024*1024)return rej(new Error('La imagen pesa más de 4 MB'));
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('No se pudo leer el archivo'));
    fr.onload=()=>{
      if(file.type==='image/svg+xml'){if(fr.result.length>400000)return rej(new Error('El SVG es muy pesado (máx. ~300 KB)'));return res(fr.result)}
      const img=new Image();
      img.onerror=()=>rej(new Error('La imagen está dañada'));
      img.onload=()=>{
        const k=Math.min(1,320/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*k)),h=Math.max(1,Math.round(img.height*k));
        const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
        res(c.toDataURL('image/png'));
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- Verificación de IMEI (SIMULADA) ---------- */
function verifyImei(imei,ignoreId){
  const steps=[];let verdict='clean',model=null,existing=null,reason=null;
  const L=['Formato del IMEI','Modelo (TAC)','Duplicado en tu inventario','Base negativa (hurto / extravío)','Bloqueo iCloud / Buscar mi iPhone','Bloqueo de operador'];
  const P=(l,s,d)=>steps.push({l,s,d});
  if(!luhnOk(imei)){
    P(L[0],'fail',imei.length!==15?'Debe tener 15 dígitos ('+imei.length+' ingresados)':'El dígito verificador no coincide: IMEI inválido o mal digitado');
    for(let i=1;i<6;i++)P(L[i],'skip','No se ejecuta');
    return{steps,verdict:'blocked',model,existing,reason:'invalid'};
  }
  P(L[0],'ok','15 dígitos · dígito verificador correcto');
  model=CATALOG.find(m=>m.tac===imei.slice(0,8))||null;
  if(model)P(L[1],'ok','Identificado: '+model.name);else{P(L[1],'warn','TAC '+imei.slice(0,8)+' no reconocido · selecciona el modelo manualmente');verdict='review'}
  existing=DB.items.find(u=>u.serial===imei&&u.id!==ignoreId)||null;
  if(existing){P(L[2],'fail','Ya existe: '+uname(existing)+' · '+existing.id+' · estado '+existing.status);verdict='blocked';reason='dup'}
  else P(L[2],'ok','No está registrado en ninguna sede');
  const r=REG[imei]||{};
  if(r.neg){P(L[3],'fail',r.neg);verdict='blocked';reason='neg'}else P(L[3],'ok','No aparece en la base negativa');
  if(r.icloud){P(L[4],'warn','Activation Lock ACTIVO · el equipo sigue ligado a un Apple ID');if(verdict==='clean')verdict='review'}else P(L[4],'ok','Sin bloqueo de activación');
  if(r.carrier){P(L[5],'warn',r.carrier);if(verdict==='clean')verdict='review'}else P(L[5],'ok','Liberado de operador');
  return{steps,verdict,model,existing,reason};
}

/* ---------- Alertas calculadas con datos reales ---------- */
function computeAlerts(){
  const A=[],now=Date.now(),aged=DB.settings.agedDays;
  const stock=DB.items.filter(inStock);
  const agedI=stock.filter(i=>i.status!=='En tránsito'&&daysIn(i)>aged).sort((a,b)=>daysIn(b)-daysIn(a));
  if(agedI.length)A.push({type:'aged',ic:'⏳',sev:'warn',n:agedI.length,title:'Productos con más de '+aged+' días en inventario',detail:agedI.slice(0,3).map(i=>uname(i)+' ('+daysIn(i)+' d)').join(', '),view:'inventario',go:{inv:{q:'',cat:'',cond:'',br:'',st:'age'}},items:agedI});
  const low=DB.items.filter(i=>isQty(i)&&i.min>0&&i.qty<=i.min);
  if(low.length)A.push({type:'reorder',ic:'📈',sev:'warn',n:low.length,title:'Productos con stock bajo',detail:low.slice(0,3).map(i=>i.name+' ('+i.qty+')').join(', '),view:'inventario',go:{inv:{q:'',cat:'',cond:'',br:'',st:'low'}},items:low});
  const pl=DB.plans.map(p=>({p,i:planInfo(p)}));
  const mora=pl.filter(x=>x.i.st==='mora'),pv=pl.filter(x=>x.i.st==='porvencer');
  if(mora.length)A.push({type:'cuotas',ic:'💳',sev:'bad',n:mora.length,title:'Planes de cuotas en mora',detail:mora.map(x=>clientById(x.p.client).name.split(' ')[0]+' ('+x.i.moraDays+' d)').join(', '),view:'cuotas'});
  if(pv.length)A.push({type:'cuotas',ic:'💬',sev:'warn',n:pv.length,title:'Cuotas que vencen en 5 días o menos',detail:pv.map(x=>clientById(x.p.client).name.split(' ')[0]).join(', '),view:'cuotas'});
  const ws=[];DB.sales.forEach(s=>s.lines.forEach((l,i)=>{if(lineNet(l)>0&&l.warr>0){const d=warrLeft(s,l);if(d>0&&d<=30)ws.push({s,l,d})}}));
  if(ws.length)A.push({type:'post',ic:'🛡️',sev:'warn',n:ws.length,title:'Garantías que vencen en 30 días',detail:ws.slice(0,3).map(x=>x.l.name+' ('+x.d+' d)').join(', '),view:'garantias'});
  const cl=DB.claims.filter(c=>c.status==='Abierto');
  if(cl.length)A.push({type:'owner',ic:'🛠️',sev:'warn',n:cl.length,title:'Reclamos de garantía abiertos',detail:'Pendientes de revisión técnica',view:'garantias'});
  const holds=DB.items.filter(i=>i.status==='Apartado'&&i.hold&&i.hold.expires-now<=2*DAY);
  if(holds.length)A.push({type:'apartado',ic:'🔒',sev:'warn',n:holds.length,title:'Apartados que vencen en 2 días',detail:holds.map(i=>uname(i)).join(', '),view:'cuotas'});
  const tr=DB.transfers.filter(t=>t.st==='En tránsito');
  if(tr.length)A.push({type:'owner',ic:'🚚',sev:'info',n:tr.length,title:'Transferencias en tránsito',detail:tr.map(t=>t.id+' → '+t.to).join(', '),view:'sedes'});
  const ready=DB.orders.filter(o=>o.st==='Listo');
  if(ready.length)A.push({type:'owner',ic:'🔧',sev:'info',n:ready.length,title:'Reparaciones listas para volver a vitrina',detail:ready.map(o=>uname(itemById(o.item))).join(', '),view:'taller'});
  const lowMg=DB.items.filter(i=>inStock(i)&&i.price&&marginPct(i)<DB.settings.minMargin);
  if(lowMg.length)A.push({type:'reprice',ic:'🏷️',sev:'warn',n:lowMg.length,title:'Productos por debajo del margen mínimo ('+DB.settings.minMargin+'%)',detail:lowMg.slice(0,3).map(i=>uname(i)+' ('+marginPct(i)+'%)').join(', '),view:'inventario',go:{inv:{q:'',cat:'',cond:'',br:'',st:'lowmg'}},items:lowMg});
  return A;
}
/* Motor: libera apartados vencidos y deja un resumen diario en el registro */
function runEngine(force){
  let changed=false;const now=Date.now();
  if(DB.autos.apartado){
    DB.items.filter(i=>i.status==='Apartado'&&i.hold&&i.hold.expires<now).forEach(i=>{
      const c=clientById(i.hold.client);i.status='En vitrina';addEv(i,'Apartado vencido · liberado automáticamente','El cliente no completó el pago a tiempo','warn');
      logAct('apartado','🔒','Apartado vencido de <b>'+esc(c?c.name:'cliente')+'</b>: <b>'+esc(uname(i))+'</b> volvió a vitrina');i.hold=null;changed=true});
  }
  const day=new Date().toISOString().slice(0,10);
  if(force||DB.engineDay!==day){
    computeAlerts().forEach(a=>{if(DB.autos[a.type]&&['aged','reorder','cuotas','reprice','post'].includes(a.type))logAct(a.type,a.ic,'<b>'+a.n+'</b> · '+esc(a.title));});
    DB.engineDay=day;changed=true;
  }
  if(changed)saveDB();
}
/* Cuenta las acciones de una automatización en los últimos 7 días (datos reales del registro) */
const autoCount=id=>DB.feed.filter(f=>f.type===id&&Date.now()-f.t<7*DAY).length;
