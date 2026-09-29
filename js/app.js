/* =====================================================
   APP · navegación, sesión, eventos y arranque
   ===================================================== */
const NAV=[
 {g:'Operación'},{id:'dashboard',ic:'📊',l:'Dashboard'},{id:'pos',ic:'🛒',l:'Nueva venta',p:'sell'},{id:'ventas',ic:'🧾',l:'Ventas',p:'sell'},
 {id:'inventario',ic:'📱',l:'Inventario',p:'inv_view'},{id:'ingreso',ic:'➕',l:'Ingresar producto',p:'inv_edit',b:'IMEI'},
 {id:'tradein',ic:'🔁',l:'Trade-in',p:'tradein'},{id:'taller',ic:'🔧',l:'Taller',p:'workshop'},
 {g:'Clientes',p:['sell','credit','clients']},{id:'cuotas',ic:'💳',l:'Apartados y cuotas',p:'credit',bd:()=>DB.plans.filter(p=>planInfo(p).st==='mora').length},
 {id:'garantias',ic:'🛡️',l:'Garantías',p:['sell','workshop']},{id:'clientes',ic:'👥',l:'Clientes',p:'clients'},
 {g:'Abastecimiento',p:['purchase','transfer','inv_view']},{id:'compras',ic:'🌎',l:'Compras e importación',p:'purchase'},{id:'sedes',ic:'🏬',l:'Sedes y transferencias',p:['transfer','inv_view']},
 {g:'Control',p:['reports','users','settings']},{id:'auto',ic:'⚡',l:'Alertas y automatizaciones',p:'reports',bd:()=>computeAlerts().filter(a=>a.sev!=='info').length,bc:'b'},{id:'reportes',ic:'📈',l:'Reportes',p:'reports'},
 {id:'usuarios',ic:'👤',l:'Usuarios y permisos',p:'users'},{id:'config',ic:'⚙️',l:'Configuración',p:'settings'}];
const allowed=n=>!n.p||(Array.isArray(n.p)?n.p.some(can):can(n.p));

function paintNav(){
  if(!ME)return;let out='',pend='';
  NAV.forEach(n=>{
    if(n.g){pend=n.g;n._show=allowed(n);if(!n.p)n._show=true;return}
    if(!allowed(n))return;
    if(pend){out+=`<div class="nav-group">${pend}</div>`;pend=''}
    const bd=n.bd?n.bd():0;
    out+=`<button class="nav-item ${S.view===n.id?'active':''}" data-a="nav" data-v="${n.id}"><span class="ic">${n.ic}</span>${n.l}${n.b?`<span class="badge b">${n.b}</span>`:''}${bd?`<span class="badge ${n.bc||''}">${bd}</span>`:''}</button>`;
  });
  $('#nav').innerHTML=out;
}
function paintBrand(){
  const s=DB.settings;
  $('#sb-head').innerHTML=`<div class="logo">${logoHtml('logo-img')}<div class="sb-name"><div class="logo-name">${esc(s.name)}</div><div class="logo-tag">Control de inventario</div></div></div>`;
  if(ME){
    const r=roleOf(ME);
    $('#sb-user').innerHTML=`<div class="avatar">${esc(initials(ME.name))}</div><div class="who"><b>${esc(ME.name)}</b><span>${esc(r.name)}</span></div><button data-a="logout" title="Cerrar sesión">Salir</button>`;
    $('#top-av').textContent=initials(ME.name);
  }
}
function go(v){S.view=v;$('#sb').classList.remove('open');paintNav();render();$('#main').scrollTop=0}
function render(){
  const n=NAV.find(x=>x.id===S.view);if(n&&!allowed(n)){S.view='dashboard'}
  const f=VIEWS[S.view];$('#main').innerHTML=f.html();f.after&&f.after();
}
function keepFocus(id){const el=$('#'+id);if(el){el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch(e){}}}

/* ---------- Sesión ---------- */
function showLogin(){
  const s=DB.settings,users=DB.users.filter(u=>u.active);
  $('#login').innerHTML=`<div class="login-box"><div class="logo">${logoHtml('logo-img')}<div><div class="logo-name">${esc(s.name)}</div><div class="logo-tag">Control de inventario</div></div></div>
   <p style="text-align:center;color:var(--t3);font-size:13.5px;margin:6px 0 14px">Elige tu usuario para entrar</p><div id="login-list">${users.map(u=>`<button class="ucard" data-a="loginAs" data-id="${u.id}"><div class="avatar" style="width:36px;height:36px">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><span>${esc(roleOf(u).name)}${u.pin?' · 🔒 con PIN':''}</span></div></button>`).join('')}</div>
   <div class="note" style="text-align:center">Demo: cada usuario ve solo lo que su rol permite. Prueba con <b>Andrés (Vendedor)</b> para ver cómo se ocultan costos y márgenes.</div></div>`;
  $('#login').classList.add('on');$('.app').style.display='none';
}
function startApp(){
  $('#login').classList.remove('on');$('.app').style.display='';
  paintBrand();S.view='dashboard';runEngine(false);paintNav();render();
}
async function loginAs(id,pin){
  const u=userById(id);if(!u||!u.active)return;
  if(u.pin&&(pin==null||await sha(pin)!==u.pin)){return false}
  ME=u;try{localStorage.setItem(SESSION_KEY,u.id)}catch(e){}
  logAct('owner','🔑','Inicio de sesión: <b>'+esc(u.name)+'</b>');saveDB();startApp();return true;
}
function logout(){ME=null;try{localStorage.removeItem(SESSION_KEY)}catch(e){}closeAll();S.pos=null;showLogin()}

/* ---------- Acciones globales ---------- */
Object.assign(ACT,{
  nav:d=>go(d.v),menu:()=>$('#sb').classList.toggle('open'),closeAll,closeModal,closeDrawer,logout,
  confirmOk:()=>{const cb=CONFIRM_CB;CONFIRM_CB=null;closeModal();cb&&cb()},
  loginAs:d=>{const u=userById(d.id);
    if(u.pin){$('#login-list').innerHTML=`<div class="f" style="margin-top:8px"><label>PIN de ${esc(u.name)}</label><div style="display:flex;gap:8px"><input id="login-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" style="flex:1;height:40px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font-size:18px;letter-spacing:4px"><button class="btn primary" data-a="loginPin" data-id="${u.id}" style="height:40px">Entrar</button></div><div id="login-err" style="color:var(--red-t);font-size:12.5px;margin-top:6px"></div><button class="btn sm" style="margin-top:10px" data-a="loginBack">← Volver</button></div>`;$('#login-pin').focus();
      $('#login-pin').addEventListener('keydown',e=>{if(e.key==='Enter')ACT.loginPin({id:u.id})})}
    else loginAs(d.id)},
  loginPin:async d=>{const ok=await loginAs(d.id,$('#login-pin').value);if(ok===false){$('#login-err').textContent='PIN incorrecto';$('#login-pin').value='';$('#login-pin').focus()}},
  loginBack:()=>showLogin()});

document.addEventListener('click',e=>{
  const a=e.target.closest('[data-a]');if(!a)return;
  if(a.dataset.a==='closeAll'&&e.target!==$('#scrim'))return;
  const f=ACT[a.dataset.a];if(f)f(a.dataset,e);
});
function tiRefresh(){const o=$('#ti-out');if(o)o.innerHTML=tiOut()}
document.addEventListener('input',e=>{
  const t=e.target,id=t.id||'';
  if(id==='f-q'){S.inv.q=t.value;$('#inv-t').innerHTML=invTable()}
  else if(id==='gsearch'){if(!ME)return;if(t.value.length>=2){S.inv={q:t.value,cat:'',cond:'',br:'',st:'stock'};if(S.view!=='inventario')go('inventario');else{$('#inv-t').innerHTML=invTable();const q=$('#f-q');if(q)q.value=t.value}}}
  else if(id==='sv-q'){S.sales.q=t.value;render();keepFocus('sv-q')}
  else if(id==='cl-q'){S.cliQ=t.value;render();keepFocus('cl-q')}
  else if(id==='pos-q'){S.pos.q=t.value;$('#pos-list').innerHTML=posList()}
  else if(t.dataset&&t.dataset.lc){LC[t.dataset.lc]=+t.value||0;$('#lc-out').innerHTML=calcOut()}
  else if(['po-usd','po-qty','po-trm','po-fr','po-ar','po-iva'].includes(id))poPreview();
  else if(['i-cost','i-price'].includes(id)){t.dataset.touched=1;itemMgHint()}
  else if(id==='i-warr'){t.dataset.touched=1}
  else if(['i-name','i-spec','i-cond'].includes(id)){itemAutofill(false)}
  else if(id==='tr-q'){$('#tr-list').innerHTML=trListHtml()}
  else if(id==='ti-imei'){t.value=t.value.replace(/\D/g,'');S.ti.imei=t.value;tiRefresh()}
  else if(id==='ti-batt'){S.ti.batt=+t.value||0;tiRefresh()}
});
document.addEventListener('change',e=>{
  const t=e.target,id=t.id||'';
  if(id==='f-cd'){S.inv.cond=t.value;$('#inv-t').innerHTML=invTable()}
  else if(id==='f-br'){S.inv.br=t.value;$('#inv-t').innerHTML=invTable()}
  else if(id==='f-st'){S.inv.st=t.value;$('#inv-t').innerHTML=invTable()}
  else if(id==='sv-from'){S.sales.from=t.value;render()}
  else if(id==='sv-by'){S.sales.by=t.value;render()}
  else if(id==='wr-f'){S.warrF=t.value;render()}
  else if(id==='rep-d'){S.rep.days=+t.value;render()}
  else if(id==='feed-f'){S.feedType=t.value;render()}
  else if(['pos-cli','pos-mode','pos-method','pos-disc','pos-nn','pos-np','pos-abono'].includes(id)){posReadInputs();posPaint()}
  else if(id==='tr-from'){$('#tr-list').innerHTML=trListHtml()}
  else if(id==='i-ok'){$('#i-save').disabled=!t.checked}
  else if(t.classList&&t.classList.contains('perm')){const r=DB.roles[t.dataset.r],p=t.dataset.p;if(!r||r.locked)return;
    r.perms=t.checked?[...new Set([...r.perms,p])]:r.perms.filter(x=>x!==p);saveDB();paintNav();toast('Permiso actualizado')}
  else if(id==='logo-file'){const f=t.files&&t.files[0];t.value='';if(f)setLogoFile(f)}
  else if(id==='json-file'){const f=t.files&&t.files[0];t.value='';if(f)importJsonFile(f)}
  else{
    const map={'ti-model':'model','ti-gb':'gb','ti-scr':'scr','ti-body':'body'};
    if(map[id]){S.ti[map[id]]=id==='ti-model'?t.value:+t.value;tiRefresh()}
    else if(['ti-fid','ti-cam','ti-btn','ti-icl'].includes(id)){S.ti[id.slice(3)]=t.checked;tiRefresh()}
    else if(id==='ti-cli'){S.ti.cli=t.value}
  }
});
/* Arrastrar y soltar el logo */
document.addEventListener('dragover',e=>{const z=e.target.closest('#logo-drop');if(z){e.preventDefault();z.classList.add('over')}});
document.addEventListener('dragleave',e=>{const z=e.target.closest('#logo-drop');if(z)z.classList.remove('over')});
document.addEventListener('drop',e=>{const z=e.target.closest('#logo-drop');if(z){e.preventDefault();z.classList.remove('over');const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)setLogoFile(f)}});
/* Tooltips de gráficos */
const tip=$('#tip');
document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(t){tip.textContent=t.dataset.tip;tip.classList.add('on')}});
document.addEventListener('mousemove',e=>{if(tip.classList.contains('on')){tip.style.left=Math.min(e.clientX+14,innerWidth-270)+'px';tip.style.top=(e.clientY+16)+'px'}});
document.addEventListener('mouseout',e=>{if(e.target.closest('[data-tip]'))tip.classList.remove('on')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});


/* ---------- PWA: instalación, actualización y modo sin conexión ---------- */
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let deferredInstall=null,swReg=null;
function paintInstall(){const b=$('#install-btn');if(!b)return;b.hidden=isStandalone()||!(deferredInstall||isIOS())}
function paintNet(){const n=$('#net-pill');if(n)n.hidden=navigator.onLine}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;paintInstall()});
window.addEventListener('appinstalled',()=>{deferredInstall=null;paintInstall();toast('✅ App instalada. Ábrela desde tu pantalla de inicio.')});
window.addEventListener('online',()=>{paintNet();toast('🌐 Conexión restablecida')});
window.addEventListener('offline',()=>{paintNet();toast('📴 Sin conexión: el demo sigue funcionando y guarda tus cambios')});
ACT.install=async()=>{
  if(deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice}catch(e){}deferredInstall=null;paintInstall();return}
  openModal(`${modalHead('Instalar '+esc(DB.settings.name))}<div class="modal-b"><p style="font-size:13.5px;color:var(--t2);margin-bottom:10px">${isIOS()?'En iPhone y iPad se instala desde Safari:':'Para instalarla:'}</p>
   <ol style="margin:0 0 0 18px;font-size:13.5px;color:var(--t2);display:flex;flex-direction:column;gap:8px">${isIOS()?'<li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Agregar a pantalla de inicio</b>.</li><li>Toca <b>Agregar</b>. Se abrirá como una app, sin barra del navegador.</li>':'<li>En Chrome o Edge, abre el menú del navegador (⋮).</li><li>Elige <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</li>'}</ol>
   <div class="note">Una vez instalada abre sin internet y guarda tus datos en este dispositivo.</div></div><div class="modal-f"><button class="btn primary" data-a="closeModal">Entendido</button></div>`)};
ACT.applyUpdate=()=>{if(swReg&&swReg.waiting)swReg.waiting.postMessage('SKIP_WAITING');else location.reload()};
function showUpdate(){const u=$('#upd');if(u)u.hidden=false}
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  const hadController=!!navigator.serviceWorker.controller;let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController||reloading)return;reloading=true;location.reload()});
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      swReg=reg;if(reg.waiting&&navigator.serviceWorker.controller)showUpdate();
      reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showUpdate()})});
      setInterval(()=>reg.update().catch(()=>{}),60*60*1000);
    }).catch(()=>{});
  });
}
paintInstall();paintNet();

/* ---------- Arranque ---------- */
(function boot(){
  initDB();applyBrand();
  let sid=null;try{sid=localStorage.getItem(SESSION_KEY)}catch(e){}
  ME=DB.users.find(u=>u.id===sid&&u.active)||null;
  if(ME){startApp();const g=new URLSearchParams(location.search).get('go');const n=NAV.find(x=>x.id===g);if(n&&VIEWS[g]&&allowed(n))go(g)}else showLogin();
})();
