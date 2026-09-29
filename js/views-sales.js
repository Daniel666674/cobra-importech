/* =====================================================
   VISTAS · comercial: Nueva venta (POS), ventas, apartados, garantías, clientes
   ===================================================== */

/* ---------- Mensaje de WhatsApp (vista previa) ---------- */
function waModal(title,phone,text,type,onSend){
  window.__waSend=()=>{logAct(type,'💬','Mensaje enviado a <b>'+esc(title)+'</b> por WhatsApp (demo)');saveDB();closeModal();toast('💬 Mensaje enviado por WhatsApp (demo)');onSend&&onSend()};
  openModal(`${modalHead('WhatsApp · '+esc(title))}<div class="modal-b"><div style="color:var(--t3);font-size:12.5px;margin-bottom:8px">Para: ${esc(phone||'sin teléfono')}</div>
   <div class="wa-box"><div class="wa">${esc(text).replace(/\*(.+?)\*/g,'<b>$1</b>')}<small>${ftime(Date.now())} ✓✓</small></div></div>
   <div class="note">En el sistema real este mensaje se envía por la API de WhatsApp Business. En el demo solo se registra en la actividad.</div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cerrar</button><button class="btn primary" onclick="window.__waSend()">Enviar (demo)</button></div>`);
}

/* ---------- Nueva venta (POS) ---------- */
const PAY_IC={'Efectivo':'💵','Transferencia':'🏦','Tarjeta':'💳','Nequi':'📱','Daviplata':'📲','Enlace Bold':'🔗'};
const DISC_REASONS=['Promoción','Cliente frecuente','Negociación','Equipo de exhibición','Otro'];
const WARR_OPTS=[0,1,3,6,9,12,18,24];
const payLabel=s=>{const p=s.payments&&s.payments.length?s.payments:[{method:s.method||'—'}];return p.length>1?'Mixto ('+p.map(x=>x.method).join(' + ')+')':p[0].method};

function posNew(){return{lines:[],client:'',clientQ:'',newC:false,newName:'',newPhone:'',newDoc:'',newEmail:'',mode:'venta',discType:'pct',discVal:0,discReason:'',
  payments:[{method:'Efectivo',amount:null}],cash:0,notes:'',q:'',cat:'',limit:24,holdItem:null,prepaid:0,abono:0,abonoMethod:'Efectivo',holdDays:DB.settings.holdDays}}
function posInit(){if(!S.pos)S.pos=posNew()}
function posAddItem(id,qty){
  posInit();const it=itemById(id);if(!it)return;const l=S.pos.lines.find(x=>x.item===id);
  if(l){if(isQty(it))l.qty=Math.min(it.qty,l.qty+(qty||1))}else S.pos.lines.push({item:id,qty:qty||1,warr:it.warr});
}
function posStart(itemId,fromHold){
  if(fromHold){const it=itemById(itemId);S.pos=posNew();if(it&&it.hold){S.pos.client=it.hold.client;S.pos.prepaid=holdPaid(it);S.pos.holdItem=it.id}}
  posInit();posAddItem(itemId);go('pos');
}
function posTotals(){
  const P=S.pos,lines=P.lines.map(l=>({l,it:itemById(l.item)})).filter(x=>x.it);
  const sub=lines.reduce((a,x)=>a+x.it.price*x.l.qty,0),dv=Math.max(0,+P.discVal||0);
  const pct=P.discType==='pct'?Math.min(100,dv):(sub?Math.min(100,dv/sub*100):0);
  const total=Math.round(sub*(1-pct/100)),cost=lines.reduce((a,x)=>a+x.it.cost*x.l.qty,0),prepaid=Math.min(P.prepaid||0,total);
  return{lines,sub,pct,total,discAmt:sub-total,cost,prepaid,due:total-prepaid};
}
function posPays(T){
  const P=S.pos,fixed=P.payments.reduce((a,p)=>a+(p.amount==null?0:(+p.amount||0)),0),rest=T.due-fixed;
  return P.payments.map(p=>({method:p.method,amount:p.amount==null?Math.max(0,rest):(+p.amount||0),auto:p.amount==null}));
}
function posValid(T){
  const P=S.pos;
  if(!T.lines.length)return{ok:false,msg:'Agrega al menos un producto'};
  if(P.newC&&!P.newName.trim())return{ok:false,msg:'Escribe el nombre del cliente nuevo'};
  if(T.pct>DB.settings.maxDisc&&!can('discount'))return{ok:false,msg:'El descuento supera el límite del '+DB.settings.maxDisc+'%: pide autorización'};
  if(T.total<T.cost&&!can('discount'))return{ok:false,msg:'El total queda por debajo del costo: pide autorización'};
  if(T.pct>0&&!P.discReason)return{ok:false,msg:'Indica el motivo del descuento'};
  if(P.mode==='apartado'){
    if(T.lines.length!==1||isQty(T.lines[0].it))return{ok:false,msg:'El apartado es para un solo equipo (no accesorios por cantidad)'};
    if(!P.client&&!P.newC)return{ok:false,msg:'Elige o crea el cliente para apartar'};
    const min=Math.round(T.total*(DB.settings.apartadoMinPct||20)/100/1000)*1000;
    if(P.abono<=0)return{ok:false,msg:'Escribe el valor del abono'};
    if(P.abono<min)return{ok:false,msg:'El abono mínimo es '+fmt(min)+' ('+(DB.settings.apartadoMinPct||20)+'%)'};
    if(P.abono>=T.total)return{ok:false,msg:'El abono cubre el total: registra una venta normal'};
    return{ok:true};
  }
  const pays=posPays(T),sum=pays.reduce((a,p)=>a+p.amount,0);
  if(T.due>0){
    if(pays.some(p=>p.amount<=0))return{ok:false,msg:'Cada método de pago debe tener un valor'};
    if(sum<T.due)return{ok:false,msg:'Falta asignar '+fmt(T.due-sum)+' en los pagos'};
    if(sum>T.due)return{ok:false,msg:'Los pagos superan el total por '+fmt(sum-T.due)};
  }
  return{ok:true};
}

/* --- catálogo (izquierda) --- */
function posCatsHtml(){
  const P=S.pos;
  return `<button class="cat ${!P.cat?'on':''}" data-a="posCat" data-c="">Todo</button>${CATS.map(c=>`<button class="cat ${P.cat===c?'on':''}" data-a="posCat" data-c="${c}">${CAT_IC[c]} ${c}</button>`).join('')}`;
}
function posCardsHtml(){
  const P=S.pos,q=(P.q||'').toLowerCase(),inCart=new Set(P.lines.map(l=>l.item));
  let list=DB.items.filter(i=>isAvail(i)&&(!P.cat||i.cat===P.cat)&&(!q||(i.name+' '+i.spec+' '+i.color+' '+i.serial+' '+i.sku+' '+i.cond).toLowerCase().includes(q))).sort((a,b)=>b.acq-a.acq);
  const total=list.length;list=list.slice(0,P.limit);
  if(!total)return '<div class="empty"><div style="font-size:30px">🔎</div>Ningún producto disponible coincide con la búsqueda.</div>';
  return `<div class="pos-count">${total} producto${total!==1?'s':''} disponible${total!==1?'s':''}</div><div class="pos-cards">${list.map(i=>{const on=inCart.has(i.id);return `<button class="pcard ${on?'in':''}" data-a="posAdd" data-id="${i.id}">
   <div class="pc-top"><span class="pc-ic">${CAT_IC[i.cat]}</span>${condChip(i.cond)}</div><div class="pc-name">${esc(i.name)}</div><div class="pc-sub">${esc([i.spec,i.color].filter(Boolean).join(' · ')||'—')}</div>
   <div class="pc-foot"><b>${fmt(i.price)}</b><span>${isQty(i)?i.qty+' en stock':'•••'+esc(i.serial.slice(-5))}</span></div>${on?'<span class="pc-in">✓ En la venta</span>':'<span class="pc-add">+ Agregar</span>'}</button>`}).join('')}</div>
   ${total>list.length?`<button class="btn" style="margin:12px auto 4px;display:flex" data-a="posMore">Ver más (${total-list.length})</button>`:''}`;
}

/* --- panel de la venta (derecha) --- */
function posUpsell(T){
  const ids=new Set(S.pos.lines.map(l=>l.item)),out=[],add=i=>{if(i&&!ids.has(i.id)&&!out.includes(i)&&isAvail(i))out.push(i)};
  const acc=DB.items.filter(i=>i.cat==='Accesorios'&&isAvail(i));
  T.lines.forEach(({it})=>{
    const fam=it.name.split(' ').slice(0,2).join(' ');
    if(it.cat==='iPhone'){acc.filter(a=>new RegExp(fam.replace(/[()]/g,''),'i').test(a.name)).forEach(add);acc.filter(a=>/MagSafe|Adaptador de corriente|Cable USB-C a/i.test(a.name)).forEach(add)}
    else if(it.cat==='iPad'){acc.filter(a=>/iPad|Pencil/i.test(a.name)).forEach(add)}
    else if(it.cat==='Mac'){acc.filter(a=>/Mouse|multipuerto|Cable MagSafe 3/i.test(a.name)).forEach(add)}
    else if(it.cat==='AirPods'){acc.filter(a=>/AirPods/i.test(a.name)).forEach(add)}
  });
  if(!out.length)return '';
  return `<div class="pos-up"><div class="pos-up-t">💡 Suele acompañarse con</div><div class="pos-up-l">${out.slice(0,4).map(a=>`<button class="up-chip" data-a="posAdd" data-id="${a.id}" title="${esc(a.name)}"><span>+ ${esc(a.name.length>26?a.name.slice(0,25)+'…':a.name)}</span><b>${fmt(a.price)}</b></button>`).join('')}</div></div>`;
}
function posLinesHtml(){
  const T=posTotals(),cv=can('cost_view');
  if(!T.lines.length)return `<div class="pos-empty"><div style="font-size:34px">🛒</div><b>Tu venta está vacía</b><span>Toca un producto de la izquierda, busca por IMEI o usa <b>📷 Escanear</b>.</span></div>`;
  return T.lines.map(({l,it})=>`<div class="pl"><div class="pl-main"><div class="pl-name">${esc(uname(it))}</div>
    <div class="pl-sub">${esc(it.color||'')} ${condChip(it.cond)} ${it.serial?'<span class="mono">•••'+esc(it.serial.slice(-6))+'</span>':''}${cv?` <span style="color:${it.price>it.cost?'var(--green-t)':'var(--red-t)'}">· margen ${marginPct(it)}%</span>`:''}</div>
    <div class="pl-w"><span>🛡 Garantía</span><select data-pw="${it.id}">${[...new Set([...WARR_OPTS,l.warr])].sort((a,b)=>a-b).map(w=>`<option value="${w}" ${w===l.warr?'selected':''}>${w?w+' meses':'Sin garantía'}</option>`).join('')}</select></div></div>
    <div class="pl-r">${isQty(it)?`<div class="stepper"><button data-a="posQty" data-id="${it.id}" data-d="-1" aria-label="Menos">−</button><b>${l.qty}</b><button data-a="posQty" data-id="${it.id}" data-d="1" aria-label="Más">+</button></div>`:''}
    <div class="pl-price">${fmt(it.price*l.qty)}</div>${l.qty>1?`<div class="pl-unit">${fmt(it.price)} c/u</div>`:''}</div><button class="x" data-a="posDel" data-id="${it.id}" aria-label="Quitar">×</button></div>`).join('')+posUpsell(T);
}
function posClientResults(){
  const q=(S.pos.clientQ||'').toLowerCase().trim();
  const list=(q?DB.clients.filter(c=>(c.name+' '+c.phone+' '+c.doc+' '+c.email).toLowerCase().includes(q)):[...DB.clients].sort((a,b)=>cliStats(b).sales.length-cliStats(a).sales.length)).slice(0,5);
  return list.map(c=>`<button class="cres" data-a="posPickClient" data-id="${c.id}"><div class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(c.name))}</div><div><b>${esc(c.name)}</b><span>${esc(c.phone||'Sin teléfono')}${c.doc?' · '+esc(c.doc):''}</span></div></button>`).join('')
    +`<button class="cres new" data-a="posNewClient"><div class="cres-plus">＋</div><div><b>Crear cliente nuevo</b><span>${q?'“'+esc(S.pos.clientQ)+'”':'Nombre y teléfono'}</span></div></button>`;
}
function posClientHtml(){
  const P=S.pos;
  if(P.client){const c=clientById(P.client),st=cliStats(c);
    return `<div class="pos-sec"><div class="pos-st">Cliente</div><div class="ccard"><div class="avatar">${esc(initials(c.name))}</div><div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="s">${esc(c.phone||'Sin teléfono')}${c.doc?' · '+esc(c.doc):''}</div><div class="s">${st.sales.length} compra${st.sales.length!==1?'s':''} · ${fmtM(st.tot)}${st.hold?' · 🔒 tiene un apartado':''}</div></div><button class="btn sm" data-a="posChangeClient">Cambiar</button></div></div>`}
  if(P.newC)return `<div class="pos-sec"><div class="pos-st">Cliente nuevo <button class="link" data-a="posCancelNew">cancelar</button></div><div class="f"><div class="row"><div><label>Nombre *</label><input id="pos-nn" value="${esc(P.newName)}" placeholder="Nombre completo"></div><div><label>Teléfono</label><input id="pos-np" value="${esc(P.newPhone)}" placeholder="300 000 0000"></div></div>
    <div class="row"><div><label>Documento</label><input id="pos-nd" value="${esc(P.newDoc)}"></div><div><label>Correo</label><input id="pos-ne" value="${esc(P.newEmail)}"></div></div></div></div>`;
  return `<div class="pos-sec"><div class="pos-st">Cliente <span>${P.mode==='apartado'?'obligatorio':'opcional'}</span></div><div class="pos-cq"><span>🔍</span><input id="pos-cq" placeholder="Buscar por nombre, teléfono o documento" value="${esc(P.clientQ)}" autocomplete="off"></div>
   <div class="cres-list" id="pos-cres">${posClientResults()}</div>${P.mode==='venta'?'<div class="s" style="margin-top:6px;color:var(--t3);font-size:12px">Sin cliente se registra como venta de mostrador.</div>':''}</div>`;
}
function posPayHtml(){
  const P=S.pos,T=posTotals(),single=P.lines.length===1&&!isQty(itemById(P.lines[0].item)||{track:'qty'});
  const seg=`<div class="seg"><button class="${P.mode==='venta'?'on':''}" data-a="posMode" data-m="venta">💵 Venta</button><button class="${P.mode==='apartado'?'on':''}" data-a="posMode" data-m="apartado" ${single?'':'disabled title="El apartado es para un solo equipo"'}>🔒 Apartado</button></div>`;
  const disc=`<div class="pos-sec"><div class="pos-st">Descuento</div><div class="disc"><div class="seg sm"><button class="${P.discType==='pct'?'on':''}" data-a="posDiscType" data-t="pct">%</button><button class="${P.discType==='val'?'on':''}" data-a="posDiscType" data-t="val">$</button></div>
    <input id="pos-dv" type="number" min="0" step="${P.discType==='pct'?'0.5':'1000'}" value="${P.discVal||''}" placeholder="0">
    <select id="pos-dr"><option value="">Motivo…</option>${DISC_REASONS.map(r=>`<option ${P.discReason===r?'selected':''}>${r}</option>`).join('')}</select></div>
    ${T.pct>DB.settings.maxDisc?`<div class="pos-warn">⚠️ Supera el límite del ${DB.settings.maxDisc}%. ${can('discount')?'Tu rol puede autorizarlo y se avisará al propietario/a.':'Necesitas autorización del propietario/a.'}</div>`:''}</div>`;
  if(P.mode==='apartado'){
    const min=Math.round(T.total*(DB.settings.apartadoMinPct||20)/100/1000)*1000;
    return `<div class="pos-sec">${seg}</div>${disc}<div class="pos-sec"><div class="pos-st">Abono inicial <span>mínimo ${fmt(min)}</span></div>
     <div class="chips2">${[20,30,50].map(p=>`<button class="chip2" data-a="posAbonoQuick" data-p="${p}">${p}% · ${fmt(Math.round(T.total*p/100/1000)*1000)}</button>`).join('')}</div>
     <div class="f" style="margin-top:8px"><div class="row"><div><label>Abono (COP)</label><input id="pos-abono" type="number" step="10000" min="0" value="${P.abono||''}" placeholder="Ej. 500000"></div><div><label>Vence en (días)</label><input id="pos-days" type="number" min="1" max="30" value="${P.holdDays}"></div></div></div>
     <div class="pos-st" style="margin-top:6px">Método del abono</div><div class="mchips">${METHODS.map(m=>`<button class="mchip ${P.abonoMethod===m?'on':''}" data-a="posAbonoMethod" data-m="${m}"><span>${PAY_IC[m]}</span>${m}</button>`).join('')}</div>
     <div class="note">El equipo queda reservado y se libera solo si no completan el pago. Saldo por pagar: <b>${fmt(Math.max(0,T.total-(P.abono||0)))}</b></div></div>`;
  }
  const pays=posPays(T),multi=P.payments.length>1,one=pays[0];
  let payUi;
  if(T.due<=0)payUi=`<div class="note" style="background:var(--green-bg);color:var(--green-t)">✅ El abono del apartado cubre esta venta.</div>`;
  else if(!multi)payUi=`<div class="mchips">${METHODS.map(m=>`<button class="mchip ${one.method===m?'on':''}" data-a="posPayMethod" data-m="${m}"><span>${PAY_IC[m]}</span>${m}</button>`).join('')}</div>
     ${one.method==='Efectivo'?`<div class="cash"><div class="f"><label>Efectivo recibido</label><input id="pos-cash" type="number" step="1000" min="0" value="${P.cash||''}" placeholder="${T.due}"></div><div class="chips2">${cashQuick(T.due).map(v=>`<button class="chip2" data-a="posCashQuick" data-v="${v}">${v===T.due?'Exacto':fmt(v)}</button>`).join('')}</div><div class="change" id="pos-change">${changeHtml(T.due)}</div></div>`:''}`;
  else payUi=`<div class="prow-l">${P.payments.map((p,i)=>`<div class="prow"><select data-pm="${i}">${METHODS.map(m=>`<option ${p.method===m?'selected':''}>${m}</option>`).join('')}</select><input data-pa="${i}" type="number" step="1000" min="0" value="${p.amount==null?'':p.amount}" placeholder="${p.amount==null?pays[i].amount+' (resto)':'Valor'}"><button class="x" data-a="posDelPay" data-i="${i}" aria-label="Quitar">×</button></div>`).join('')}</div>`;
  return `<div class="pos-sec">${seg}</div>${disc}<div class="pos-sec"><div class="pos-st">Pago <span>${T.due>0?fmt(T.due):''}</span></div>${payUi}${T.due>0?`<button class="link" style="margin-top:8px" data-a="posAddPay">＋ ${multi?'Agregar otro método':'Dividir el pago en varios métodos'}</button>`:''}</div>
   <div class="pos-sec"><div class="pos-st">Notas <span>opcional</span></div><textarea id="pos-notes" rows="2" placeholder="Observaciones de la venta">${esc(P.notes)}</textarea></div>`;
}
const cashQuick=due=>{const s=new Set([due]);[10000,50000,100000].forEach(st=>{const v=Math.ceil(due/st)*st;if(v>due)s.add(v)});return[...s].slice(0,4)};
const changeHtml=due=>{const g=S.pos.cash||0;return g?(g>=due?`Cambio a devolver: <b>${fmt(g-due)}</b>`:`<span style="color:var(--red-t)">Faltan ${fmt(due-g)}</span>`):'<span style="color:var(--t3)">Escribe lo recibido para calcular el cambio</span>'};
function posTotalsHtml(){
  const P=S.pos,T=posTotals(),V=posValid(T),cv=can('cost_view'),hold=P.mode==='apartado';
  const cta=hold?'🔒 Crear apartado · abono '+fmt(P.abono||0):(T.due>0?'Cobrar '+fmt(T.due):'Emitir comprobante');
  return `<div class="pos-tot"><div class="l"><span>Subtotal (${T.lines.reduce((a,x)=>a+x.l.qty,0)} producto${T.lines.reduce((a,x)=>a+x.l.qty,0)!==1?'s':''})</span><span>${fmt(T.sub)}</span></div>
   ${T.discAmt?`<div class="l"><span>Descuento${P.discReason?' · '+esc(P.discReason):''} (${+T.pct.toFixed(1)}%)</span><span style="color:var(--red-t)">−${fmt(T.discAmt)}</span></div>`:''}
   ${T.prepaid?`<div class="l"><span>Abonos previos del apartado</span><span style="color:var(--green-t)">−${fmt(T.prepaid)}</span></div>`:''}
   <div class="big"><span>${hold?'Total del equipo':'Total a pagar'}</span><span>${fmt(hold?T.total:T.due)}</span></div>
   ${cv&&T.lines.length?`<div class="l sm"><span>Margen de la venta</span><span style="color:${T.total<T.cost?'var(--red-t)':'var(--green-t)'}">${fmt(T.total-T.cost)} · ${T.total?Math.round((T.total-T.cost)/T.total*100):0}%</span></div>`:''}
   <button class="btn primary cta" data-a="posConfirm" ${V.ok?'':'disabled'}>${cta}</button>
   ${!V.ok&&T.lines.length?`<div class="pos-why">${esc(V.msg)}</div>`:''}
   <div class="pos-keys">Atajos: <kbd>/</kbd> buscar · <kbd>Enter</kbd> agrega el primero</div></div>`;
}
function posBarHtml(){const T=posTotals(),n=T.lines.reduce((a,x)=>a+x.l.qty,0);return `<div><span>${n} producto${n!==1?'s':''}</span><b>${fmt(S.pos.mode==='apartado'?T.total:T.due)}</b></div><button class="btn primary" data-a="posGoPay">Ver venta ›</button>`}
function posPaint(){
  const set=(id,h)=>{const e=$('#'+id);if(e)e.innerHTML=h};
  set('pos-cats',posCatsHtml());set('pos-cards',posCardsHtml());set('pos-lines',posLinesHtml());set('pos-pay',posPayHtml());set('pos-totals',posTotalsHtml());set('pos-bar',posBarHtml());
}
function posPaintClient(){const e=$('#pos-client');if(e)e.innerHTML=posClientHtml()}
VIEWS.pos={html(){
  posInit();const P=S.pos;
  return `<div class="page-h"><div><h1>Nueva venta</h1><p>Arma la venta, elige el cliente y cobra. El comprobante se genera al confirmar.</p></div></div>
  <div class="pos-wrap"><section class="card pos-left"><div class="pos-search"><span>🔍</span><input id="pos-q" placeholder="Buscar producto, IMEI / serial o SKU…" value="${esc(P.q)}" autocomplete="off"><button class="btn" data-a="scanPos" title="Escanear el código de barras del equipo">📷 Escanear</button></div>
    <div class="cats" id="pos-cats"></div><div id="pos-cards" class="pos-cardsbox"></div></section>
   <aside class="card pos-panel" id="pos-panel"><div class="pos-ph"><div><h3>Venta</h3><div class="pos-meta"><span class="chip gray">Borrador</span> FV-${1000+(DB.seq.sale||0)+1} · ${esc(ME.name.split(' ')[0])} · ${fdate(Date.now())}</div></div><button class="link" data-a="posClear">Vaciar</button></div>
    <div id="pos-lines"></div><div id="pos-client"></div><div id="pos-pay"></div><div id="pos-totals"></div></aside></div><div class="pos-bar" id="pos-bar"></div>`;
},after(){posPaint();posPaintClient()}};

/* --- acciones --- */
ACT.posAdd=d=>{posAddItem(d.id);posPaint()};
ACT.posMore=()=>{S.pos.limit+=24;posPaint()};
ACT.posCat=d=>{S.pos.cat=d.c;S.pos.limit=24;posPaint()};
ACT.posDel=d=>{S.pos.lines=S.pos.lines.filter(l=>l.item!==d.id);if(S.pos.lines.length!==1)S.pos.mode='venta';posPaint()};
ACT.posQty=d=>{const l=S.pos.lines.find(x=>x.item===d.id),it=itemById(d.id);l.qty=Math.max(1,Math.min(it.qty,l.qty+(+d.d)));posPaint()};
ACT.posClear=()=>{S.pos=null;posInit();posPaint();posPaintClient()};
ACT.posGoPay=()=>{const e=$('#pos-panel');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})};
ACT.posMode=d=>{if(d.m==='apartado'&&!(S.pos.lines.length===1&&!isQty(itemById(S.pos.lines[0].item))))return;S.pos.mode=d.m;if(d.m==='apartado'&&!S.pos.abono){const T=posTotals();S.pos.abono=Math.round(T.total*(DB.settings.apartadoMinPct||20)/100/1000)*1000}posPaint();posPaintClient()};
ACT.posDiscType=d=>{S.pos.discType=d.t;S.pos.discVal=0;posPaint()};
ACT.posPayMethod=d=>{S.pos.payments[0].method=d.m;S.pos.cash=0;posPaint()};
ACT.posAddPay=()=>{const P=S.pos,T=posTotals(),pays=posPays(T);
  if(P.payments.length===1){P.payments[0].amount=Math.max(1000,Math.round(T.due/2/1000)*1000);P.payments.push({method:P.payments[0].method==='Efectivo'?'Transferencia':'Efectivo',amount:null})}
  else{const last=P.payments[P.payments.length-1];if(last.amount==null)last.amount=pays[pays.length-1].amount||0;P.payments.push({method:'Efectivo',amount:null})}
  posPaint()};
ACT.posDelPay=d=>{const P=S.pos;P.payments.splice(+d.i,1);if(!P.payments.length)P.payments=[{method:'Efectivo',amount:null}];P.payments[P.payments.length-1].amount=null;posPaint()};
ACT.posCashQuick=d=>{S.pos.cash=+d.v;const e=$('#pos-cash');if(e)e.value=d.v;const c=$('#pos-change');if(c)c.innerHTML=changeHtml(posTotals().due)};
ACT.posAbonoQuick=d=>{const T=posTotals();S.pos.abono=Math.round(T.total*(+d.p)/100/1000)*1000;posPaint()};
ACT.posAbonoMethod=d=>{S.pos.abonoMethod=d.m;posPaint()};
ACT.posPickClient=d=>{S.pos.client=d.id;S.pos.newC=false;posPaintClient();posPaintTotalsOnly()};
ACT.posNewClient=()=>{const P=S.pos;P.newC=true;P.newName=P.clientQ||'';posPaintClient();posPaintTotalsOnly()};
ACT.posCancelNew=()=>{S.pos.newC=false;posPaintClient();posPaintTotalsOnly()};
ACT.posChangeClient=()=>{S.pos.client='';S.pos.clientQ='';posPaintClient()};
function posPaintTotalsOnly(){const t=$('#pos-totals');if(t)t.innerHTML=posTotalsHtml();const b=$('#pos-bar');if(b)b.innerHTML=posBarHtml()}
function posInput(t){
  const P=S.pos,id=t.id||'';
  if(id==='pos-q'){P.q=t.value;P.limit=24;const c=$('#pos-cards');if(c)c.innerHTML=posCardsHtml()}
  else if(id==='pos-cq'){P.clientQ=t.value;const r=$('#pos-cres');if(r)r.innerHTML=posClientResults()}
  else if(id==='pos-cash'){P.cash=+t.value||0;const c=$('#pos-change');if(c)c.innerHTML=changeHtml(posTotals().due)}
  else if(id==='pos-notes')P.notes=t.value;
  else if(id==='pos-nn'){P.newName=t.value;posPaintTotalsOnly()}else if(id==='pos-np')P.newPhone=t.value;else if(id==='pos-nd')P.newDoc=t.value;else if(id==='pos-ne')P.newEmail=t.value;
  else if(id==='pos-abono'){P.abono=+t.value||0;posPaintTotalsOnly()}
}
function posChange(t){
  const P=S.pos,id=t.id||'';
  if(id==='pos-dv'){P.discVal=+t.value||0;posPaint()}
  else if(id==='pos-dr'){P.discReason=t.value;posPaint()}
  else if(id==='pos-days'){P.holdDays=Math.max(1,Math.min(30,+t.value||DB.settings.holdDays))}
  else if(t.dataset&&t.dataset.pw!=null){const l=P.lines.find(x=>x.item===t.dataset.pw);if(l)l.warr=+t.value}
  else if(t.dataset&&t.dataset.pm!=null){P.payments[+t.dataset.pm].method=t.value}
  else if(t.dataset&&t.dataset.pa!=null){const i=+t.dataset.pa;P.payments[i].amount=t.value===''?null:Math.max(0,+t.value||0);posPaint()}
}
function posEnter(){const c=document.querySelector('#pos-cards .pcard:not(.in)');if(c){ACT.posAdd({id:c.dataset.id});const q=$('#pos-q');if(q){q.value='';S.pos.q='';posPaint();q.focus()}}}

/* --- confirmar y emitir --- */
ACT.posConfirm=()=>{
  if(!need('sell'))return;const P=S.pos,T=posTotals(),V=posValid(T);if(!V.ok){toast('⚠️ '+V.msg);return}
  const c=P.client?clientById(P.client):(P.newC?{name:P.newName.trim(),phone:P.newPhone}:null),hold=P.mode==='apartado',pays=hold?[{method:P.abonoMethod,amount:P.abono}]:posPays(T).filter(p=>p.amount>0);
  const cashOne=!hold&&pays.length===1&&pays[0].method==='Efectivo'&&P.cash>=pays[0].amount&&P.cash>0;
  openModal(`${modalHead(hold?'Confirmar apartado':'Confirmar venta')}<div class="modal-b"><div class="sum">
    <div class="sum-r"><span>Cliente</span><b>${esc(c?c.name:'Venta de mostrador')}</b></div>
    <div class="sum-r"><span>Productos</span><b>${T.lines.map(x=>esc(x.it.name)+(x.l.qty>1?' ×'+x.l.qty:'')).join(', ')}</b></div>
    ${T.discAmt?`<div class="sum-r"><span>Descuento</span><b>−${fmt(T.discAmt)} (${esc(P.discReason)})</b></div>`:''}
    <div class="sum-r"><span>${hold?'Total del equipo':'Total'}</span><b>${fmt(T.total)}</b></div>
    ${T.prepaid?`<div class="sum-r"><span>Abonos previos</span><b>−${fmt(T.prepaid)}</b></div>`:''}
    ${pays.map(p=>`<div class="sum-r"><span>${PAY_IC[p.method]} ${hold?'Abono':'Pago'} · ${p.method}</span><b>${fmt(p.amount)}</b></div>`).join('')}
    ${cashOne&&P.cash>pays[0].amount?`<div class="sum-r"><span>Cambio a devolver</span><b>${fmt(P.cash-pays[0].amount)}</b></div>`:''}
    ${hold?`<div class="sum-r"><span>Vence</span><b>${fdatey(Date.now()+P.holdDays*DAY)}</b></div><div class="sum-r"><span>Saldo por pagar</span><b>${fmt(T.total-P.abono)}</b></div>`:''}</div>
    <div class="note">Se generará ${hold?'el recibo de apartado':'el comprobante'} y quedará registrado en el historial de cada producto.</div></div>
    <div class="modal-f"><button class="btn" data-a="closeModal">Volver</button><button class="btn primary" data-a="posDoSale">${hold?'🔒 Crear apartado':'✅ Confirmar y emitir'}</button></div>`);
};
ACT.posDoSale=()=>{
  if(!need('sell'))return;const P=S.pos,T=posTotals(),V=posValid(T);if(!V.ok){toast('⚠️ '+V.msg);return}
  for(const x of T.lines){if(!isAvail(x.it)&&x.it.id!==P.holdItem){toast('«'+uname(x.it)+'» ya no está disponible');closeModal();return}if(isQty(x.it)&&x.l.qty>x.it.qty){toast('Solo hay '+x.it.qty+' de «'+x.it.name+'»');closeModal();return}}
  let cid=P.client;
  if(!cid&&P.newC){const c={id:nextId('client','c',0),name:P.newName.trim(),phone:P.newPhone.trim(),email:P.newEmail.trim(),doc:P.newDoc.trim(),notes:''};DB.clients.push(c);cid=c.id}
  const now=Date.now(),cl=cid?clientById(cid):null;
  if(P.mode==='apartado'){
    const it=T.lines[0].it,days=P.holdDays;
    it.status='Apartado';
    it.hold={client:cid,abono:P.abono,expires:now+days*DAY,t:now,by:ME.id,no:'RA-'+(1000+(DB.seq.hold=(DB.seq.hold||0)+1)),pays:[{t:now,amount:P.abono,method:P.abonoMethod,by:ME.id,no:'RB-'+(1000+(DB.seq.pay=(DB.seq.pay||0)+1))}]};
    addEv(it,'Apartado',cl.name+' · abono '+fmt(P.abono)+' · vence en '+days+' días','warn');
    if(T.pct>0)it.hold.discNote=T.pct.toFixed(1)+'% '+P.discReason;
    logAct('apartado','🔒','Apartado de <b>'+esc(cl.name)+'</b>: <b>'+esc(uname(it))+'</b> con abono de '+fmt(P.abono));
    S.pos=null;saveDB();paintNav();closeModal();go('apartados');openHoldReceipt(it.id);toast('🔒 Apartado creado · vence en '+days+' días');return;
  }
  const pays=posPays(T).filter(p=>p.amount>0),id=nextId('sale','S-',4),no='FV-'+(1000+DB.seq.sale);
  const sale={id,no,t:now,client:cid||null,by:ME.id,method:pays.length>1?'Mixto':(pays[0]?pays[0].method:'Abono previo'),mode:'contado',payments:pays,disc:+T.pct.toFixed(4),discReason:P.discReason||'',notes:P.notes.trim(),prepaid:T.prepaid,
    lines:T.lines.map(x=>({item:x.it.id,name:uname(x.it),color:x.it.color,cond:x.it.cond,serial:x.it.serial,qty:x.l.qty,price:x.it.price,cost:x.it.cost+(isQty(x.it)?0:(x.it.repairs||0)),warr:x.l.warr,ret:0}))};
  sale.total=saleNet(sale);
  if(pays.length===1&&pays[0].method==='Efectivo'&&P.cash>=pays[0].amount&&P.cash>0)sale.cash={given:P.cash,change:P.cash-pays[0].amount};
  if(P.holdItem){const hi=itemById(P.holdItem);if(hi&&hi.hold){sale.holdPays=hi.hold.pays.map(y=>({t:y.t,amount:y.amount,method:y.method,no:y.no}));holdClose(hi,'Convertido en venta '+no)}}
  T.lines.forEach(x=>{const it=x.it;
    if(isQty(it)){it.qty-=x.l.qty;addEv(it,'Vendido ×'+x.l.qty,(cl?cl.name:'Mostrador')+' · '+no,'ok');
      if(it.min&&it.qty<=it.min)logAct('reorder','📈','Stock bajo: <b>'+esc(it.name)+'</b> quedó con '+it.qty+' unidades (mínimo '+it.min+')')}
    else{it.status='Vendido';it.hold=null;addEv(it,'Vendido',(cl?cl.name:'Mostrador')+' · '+payLabel(sale)+' · '+no,'ok');addEv(it,'Garantía activada',x.l.warr+' meses','ok')}});
  DB.sales.push(sale);
  logAct('fe','🧾','Comprobante <b>'+no+'</b> emitido · '+fmt(sale.total)+(cl?' · '+esc(cl.name):''));
  if(T.pct>DB.settings.maxDisc)logAct('owner','🚨','Alerta al dueño: descuento de <b>'+T.pct.toFixed(1)+'%</b> en '+no+' ('+esc(P.discReason)+') · '+esc(ME.name));
  if(T.total<T.cost)logAct('owner','🚨','Alerta al dueño: <b>venta bajo costo</b> en '+no+' ('+esc(ME.name)+')');
  S.pos=null;saveDB();paintNav();closeModal();render();openReceipt(id,{done:true});
  if(T.pct>DB.settings.maxDisc)toast('🚨 Alerta enviada al propietario/a: descuento del '+T.pct.toFixed(1)+'%');
};

/* ---------- Apartados y abonos ---------- */
VIEWS.apartados={html(){
  const ap=DB.items.filter(i=>i.status==='Apartado'&&i.hold).sort((a,b)=>a.hold.expires-b.hold.expires),tot=ap.reduce((a,i)=>a+holdPaid(i),0),soon=ap.filter(i=>holdLeft(i)<=2);
  return `<div class="page-h"><div><h1>Apartados</h1><p>Reserva un equipo con abono, recibe abonos parciales y complétalo cuando el cliente pague el saldo.</p></div>${can('sell')?'<button class="btn primary" data-a="nav" data-v="pos">🛒 Nueva venta / apartado</button>':''}</div>
  <div class="grid g3"><div class="card kpi"><div class="l">Apartados vigentes</div><div class="v">${ap.length}</div><div class="d">${fmtM(ap.reduce((a,i)=>a+i.price,0))} en equipos reservados</div></div>
   <div class="card kpi"><div class="l">Abonos recibidos</div><div class="v">${fmtM(tot)}</div><div class="d">${fmtM(ap.reduce((a,i)=>a+holdBal(i),0))} por cobrar en saldos</div></div>
   <div class="card kpi ${soon.length?'warn':''}"><div class="l">Vencen en 2 días o menos</div><div class="v">${soon.length}</div><div class="d">Se avisa al cliente y se liberan solos</div></div></div>
  <div class="card mt"><div class="card-h"><h3>Apartados vigentes</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Cliente</th><th>Equipo</th><th style="min-width:150px">Abonado</th><th class="num">Saldo</th><th>Vence</th><th></th></tr></thead><tbody>
   ${ap.map(i=>{const c=clientById(i.hold.client),left=holdLeft(i),pct=Math.min(100,holdPaid(i)/i.price*100);return `<tr><td><div class="m">${esc(c?c.name:'—')}</div><div class="s">${esc(c?c.phone:'')}</div></td>
    <td class="click" data-a="item" data-id="${i.id}" style="cursor:pointer"><div class="m">${esc(uname(i))}</div><div class="s">${esc(i.color)} · ${fmt(i.price)}</div></td>
    <td><div class="bar"><i style="width:${pct}%"></i></div><div class="s">${fmt(holdPaid(i))} · ${i.hold.pays.length} abono${i.hold.pays.length!==1?'s':''}</div></td><td class="num"><b>${fmt(holdBal(i))}</b></td>
    <td>${fdate(i.hold.expires)}<div class="s" style="color:${left<=2?'var(--red-t)':'var(--t3)'}">${left>0?'en '+left+' día'+(left!==1?'s':''):'vence hoy'}</div></td>
    <td style="white-space:nowrap">${can('credit')?`<button class="btn sm primary" data-a="abonoModal" data-id="${i.id}">＋ Abono</button> `:''}${can('sell')?`<button class="btn sm" data-a="finishHold" data-id="${i.id}">Completar venta</button> `:''}<button class="btn sm" data-a="holdReceipt" data-id="${i.id}">Recibo</button> <button class="btn sm" data-a="remindHold" data-id="${i.id}" title="Recordar por WhatsApp">💬</button>${can('credit')?` <button class="btn sm" data-a="extendHold" data-id="${i.id}">Extender</button> <button class="btn sm danger" data-a="releaseHold" data-id="${i.id}">Liberar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay apartados vigentes. Crea uno desde “Nueva venta” → Apartado.</td></tr>'}</tbody></table></div></div>
  <div class="card mt"><div class="card-h"><h3>Cómo funciona</h3></div><div class="card-p"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px">${chip('Abono inicial ≥ '+(DB.settings.apartadoMinPct||20)+'%','info')}<span>→</span>${chip('Abonos parciales con recibo','ok')}<span>→</span>${chip('Aviso de saldo 2 días antes','warn')}<span>→</span>${chip('Completar venta con comprobante','pur')}<span>·</span>${chip('Si vence, se libera solo','gray')}</div></div></div>
  <div class="card mt"><div class="card-h"><h3>Apartados cerrados</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Fecha</th><th>Equipo</th><th>Cliente</th><th class="num">Abonado</th><th>Resultado</th></tr></thead><tbody>
   ${DB.holdHist.slice(0,8).map(h=>`<tr><td>${fdate(h.t)}</td><td>${esc(h.item)}</td><td>${esc(h.client)}</td><td class="num">${fmt(h.abono)}</td><td>${chip(esc(h.outcome),/venta/i.test(h.outcome)?'ok':'gray')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Aún no hay apartados cerrados.</td></tr>'}</tbody></table></div></div>`;
}};
ACT.abonoModal=d=>{const it=itemById(d.id),bal=holdBal(it),c=clientById(it.hold.client);
  openModal(`${modalHead('Registrar abono · '+esc(c?c.name:''))}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px"><b>${esc(uname(it))}</b><br>Abonado ${fmt(holdPaid(it))} · Saldo <b>${fmt(bal)}</b></p>
   <div class="row"><div><label>Valor recibido (COP)</label><input id="ab-a" type="number" step="10000" min="1" max="${bal}" value="${Math.min(bal,Math.max(10000,Math.round(bal/2/10000)*10000))}"></div></div>
   <div class="pos-st" style="margin:6px 0">Método</div><div class="mchips" id="ab-m">${METHODS.map((m,i)=>`<button class="mchip ${i===0?'on':''}" type="button" data-a="abonoPick" data-m="${m}"><span>${PAY_IC[m]}</span>${m}</button>`).join('')}</div><input type="hidden" id="ab-mv" value="${METHODS[0]}">
   <div class="note">Si el abono cubre el saldo, usa <b>Completar venta</b> para emitir el comprobante y entregar el equipo.</div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doAbono" data-id="${it.id}">Registrar abono</button></div>`)};
ACT.abonoPick=d=>{$('#ab-mv').value=d.m;$$('#ab-m .mchip').forEach(b=>b.classList.toggle('on',b.dataset.m===d.m))};
ACT.doAbono=d=>{if(!need('credit'))return;const it=itemById(d.id),bal=holdBal(it),a=Math.round(num('ab-a'));
  if(a<=0||a>bal){toast('El abono debe ser mayor a 0 y no superar el saldo ('+fmt(bal)+')');return}
  const pay={t:Date.now(),amount:a,method:val('ab-mv')||'Efectivo',by:ME.id,no:'RB-'+(1000+(DB.seq.pay=(DB.seq.pay||0)+1))};
  it.hold.pays.push(pay);it.hold.abono+=a;it.hold.reminded=false;
  addEv(it,'Abono recibido',fmt(a)+' · '+pay.method+' · saldo '+fmt(holdBal(it)),'ok');logAct('apartado','💰','Abono de <b>'+fmt(a)+'</b> de '+esc((clientById(it.hold.client)||{name:'cliente'}).name)+' · '+esc(uname(it)));
  saveDB();closeModal();paintNav();render();openAbonoReceipt(it.id,it.hold.pays.length-1);toast('✅ Abono de '+fmt(a)+' registrado')};
ACT.extendHold=d=>{const it=itemById(d.id);openModal(`${modalHead('Extender apartado')}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px">${esc(uname(it))} · vence ${fdate(it.hold.expires)}</p>
  <label>Extender por</label><select id="ex-d"><option value="3">3 días</option><option value="5" selected>5 días</option><option value="7">7 días</option><option value="15">15 días</option></select></div>
  <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doExtend" data-id="${it.id}">Extender</button></div>`)};
ACT.doExtend=d=>{const it=itemById(d.id),n=+$('#ex-d').value;it.hold.expires+=n*DAY;it.hold.reminded=false;addEv(it,'Apartado extendido','+'+n+' días · vence '+fdate(it.hold.expires),'warn');logAct('apartado','🔒','Apartado extendido '+n+' días: <b>'+esc(uname(it))+'</b>');saveDB();closeModal();render();toast('Apartado extendido')};
ACT.releaseHold=d=>{const it=itemById(d.id);openModal(`${modalHead('Liberar apartado')}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px"><b>${esc(uname(it))}</b> volverá a la venta. Abonado: <b>${fmt(holdPaid(it))}</b>.</p>
  <label>¿Qué pasa con el abono?</label><select id="rl-o"><option value="Liberado · abono devuelto al cliente">Devolver el abono al cliente</option><option value="Liberado · abono retenido por la tienda">Retener el abono (política de la tienda)</option></select></div>
  <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn danger" data-a="doRelease" data-id="${it.id}">Liberar apartado</button></div>`)};
ACT.doRelease=d=>{const it=itemById(d.id),o=val('rl-o');holdClose(it,o);addEv(it,'Apartado liberado',o+' · '+fmt(holdPaid(it)),'warn');it.status='En vitrina';it.hold=null;logAct('apartado','🔒','Apartado liberado: <b>'+esc(uname(it))+'</b> ('+esc(o)+')');saveDB();closeModal();closeDrawer();paintNav();render();toast('Apartado liberado')};

ACT.refundModal=d=>{const s=saleById(d.id);
  openModal(`${modalHead('Devolución · '+s.no)}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px">Elige lo que el cliente devuelve. El producto vuelve al inventario.</p>
   ${s.lines.map((l,i)=>lineNet(l)>0?`<div class="row" style="align-items:end"><div style="grid-column:span 2"><label>${esc(l.name)}</label><div style="font-size:12px;color:var(--t3)">Vendido ×${l.qty} · ${fmt(l.price)}</div></div><div><label>Devolver</label><input id="rf-${i}" type="number" min="0" max="${lineNet(l)}" value="0"></div></div>`:'').join('')}
   <div class="row"><div><label>Motivo</label><select id="rf-r"><option>Falla del producto</option><option>Cliente se arrepintió</option><option>Error de facturación</option><option>Otro</option></select></div></div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn danger" data-a="doRefund" data-id="${s.id}">Confirmar devolución</button></div>`)};
ACT.doRefund=d=>{if(!need('refund'))return;const s=saleById(d.id);let tot=0,n=0;
  s.lines.forEach((l,i)=>{const q=Math.max(0,Math.min(lineNet(l),Math.round(num('rf-'+i))));if(!q)return;const it=itemById(l.item);l.ret=(l.ret||0)+q;tot+=Math.round(q*l.price*(1-s.disc/100));n+=q;
    if(it){if(isQty(it))it.qty+=q;else{it.status='En vitrina';it.branch=it.branch}addEv(it,'Devolución ×'+q,val('rf-r')+' · '+s.no,'warn')}});
  if(!n){toast('Indica cuántas unidades se devuelven');return}
  logAct('owner','↩︎','Devolución en <b>'+s.no+'</b>: '+n+' producto(s) por '+fmt(tot)+' · '+esc($('#rf-r').value)+' · '+esc(ME.name));saveDB();paintNav();closeModal();render();toast('↩︎ Devolución registrada · reembolso '+fmt(tot))};

/* ---------- Historial de ventas ---------- */
VIEWS.ventas={html(){
  const f=S.sales,cv=can('cost_view'),q=f.q.toLowerCase();
  const list=[...DB.sales].filter(s=>{if(f.from&&Date.now()-s.t>+f.from*DAY)return false;if(f.by&&s.by!==f.by)return false;
    if(q&&!(s.no+' '+(clientById(s.client)?.name||'')+' '+s.lines.map(l=>l.name+' '+l.serial).join(' ')).toLowerCase().includes(q))return false;return true}).sort((a,b)=>b.t-a.t);
  const tot=list.reduce((a,s)=>a+saleNet(s),0),mg=list.reduce((a,s)=>a+saleMargin(s),0);
  return `<div class="page-h"><div><h1>Ventas</h1><p>Historial de ventas con comprobante, garantía y devoluciones.</p></div><div style="display:flex;gap:8px"><button class="btn" data-a="exportSales">⬇️ Exportar CSV</button>${can('sell')?'<button class="btn primary" data-a="nav" data-v="pos">🛒 Nueva venta</button>':''}</div></div>
  <div class="card"><div class="filters"><input id="sv-q" placeholder="Buscar por número, cliente, producto o serial…" value="${esc(f.q)}">
   <select id="sv-from"><option value="">Todo el historial</option>${[7,30,90].map(d=>`<option value="${d}" ${f.from==d?'selected':''}>Últimos ${d} días</option>`).join('')}</select>
   <select id="sv-by"><option value="">Todas las personas</option>${DB.users.map(u=>`<option value="${u.id}" ${f.by===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
  <div class="tbl-wrap"><table><thead><tr><th>Venta</th><th>Cliente</th><th>Productos</th><th>Pago</th><th>Vendedor</th><th class="num">Total</th>${cv?'<th class="num">Margen</th>':''}<th>Estado</th></tr></thead><tbody>
  ${list.map(s=>{const c=clientById(s.client),v=saleVoid(s),part=s.lines.some(l=>l.ret)&&!v;return `<tr class="click" data-a="receipt" data-id="${s.id}"><td><div class="m">${s.no}</div><div class="s">${fdt(s.t)}</div></td><td>${esc(c?c.name:'Mostrador')}</td>
   <td>${esc(s.lines[0].name)}${s.lines.length>1?` <span style="color:var(--t3)">+${s.lines.length-1}</span>`:''}</td><td>${esc(payLabel(s))}</td><td>${esc((userById(s.by)||{name:'—'}).name.split(' ')[0])}</td>
   <td class="num">${fmt(saleNet(s))}</td>${cv?`<td class="num" style="color:var(--green-t);font-weight:600">${fmt(saleMargin(s))}</td>`:''}<td>${v?chip('Devuelta','bad'):part?chip('Devolución parcial','warn'):chip('Pagada','ok')}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">No hay ventas con esos filtros.</td></tr>'}</tbody></table></div>
  <div style="padding:12px 16px;font-size:13px;color:var(--t2);border-top:1px solid var(--border);display:flex;gap:18px"><span><b>${list.length}</b> ventas</span><span>Total <b>${fmt(tot)}</b></span>${cv?`<span>Margen <b>${fmt(mg)}</b></span>`:''}</div></div>`;
}};
ACT.exportSales=()=>{const cv=can('cost_view');downloadCSV('ventas-'+new Date().toISOString().slice(0,10)+'.csv',[['Venta','Fecha','Cliente','Producto','Serial','Cantidad','Valor unitario','Descuento %','Total venta','Pago',...(cv?['Margen venta']:[]),'Vendedor'],
  ...DB.sales.flatMap(s=>s.lines.map((l,i)=>[s.no,new Date(s.t).toISOString().slice(0,10),(clientById(s.client)||{name:'Mostrador'}).name,l.name,l.serial,lineNet(l),l.price,s.disc,i===0?saleNet(s):'',payLabel(s),...(cv?[i===0?saleMargin(s):'']:[]),(userById(s.by)||{name:''}).name]))]);toast('Ventas exportadas')};


/* ---------- Garantías ---------- */
function warrRows(){
  const out=[];DB.sales.forEach(s=>s.lines.forEach((l,i)=>{if(lineNet(l)>0&&l.warr>0){const left=warrLeft(s,l),cl=DB.claims.find(c=>c.sale===s.id&&c.line===i&&c.status==='Abierto');out.push({s,l,i,left,cl,st:cl?'reclamo':left<=0?'vencida':left<=30?'porvencer':'vigente'})}}));
  return out.sort((a,b)=>a.left-b.left);
}
VIEWS.garantias={html(){
  let rows=warrRows();const all=rows;if(S.warrF)rows=rows.filter(r=>r.st===S.warrF);
  const cnt=k=>all.filter(r=>r.st===k).length;
  return `<div class="page-h"><div><h1>Garantías</h1><p>Se activan solas al vender, con la vigencia de cada producto. Registra y resuelve reclamos.</p></div></div>
  <div class="grid g4"><div class="card kpi"><div class="l">Vigentes</div><div class="v">${cnt('vigente')}</div></div><div class="card kpi ${cnt('porvencer')?'warn':''}"><div class="l">Por vencer (30 d)</div><div class="v">${cnt('porvencer')}</div></div>
   <div class="card kpi ${cnt('reclamo')?'warn':''}"><div class="l">Con reclamo abierto</div><div class="v">${cnt('reclamo')}</div></div><div class="card kpi"><div class="l">Vencidas</div><div class="v">${cnt('vencida')}</div></div></div>
  <div class="card mt"><div class="filters"><select id="wr-f"><option value="">Todas las garantías</option>${[['vigente','Vigentes'],['porvencer','Por vencer'],['reclamo','Con reclamo'],['vencida','Vencidas']].map(([v,l])=>`<option value="${v}" ${S.warrF===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Serial</th><th>Cliente</th><th>Venta</th><th>Garantía</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>
  ${rows.map(r=>{const c=clientById(r.s.client);return `<tr><td><div class="m">${esc(r.l.name)}</div><div class="s">${esc(r.l.cond)}</div></td><td class="mono">${r.l.serial?'•••'+esc(r.l.serial.slice(-6)):'—'}</td><td>${esc(c?c.name:'Mostrador')}</td><td>${r.s.no}<div class="s">${fdate(r.s.t)}</div></td><td>${r.l.warr} meses</td>
   <td>${r.left>0?r.left+' días restantes':'Venció hace '+(-r.left)+' días'}<div class="s">hasta ${fdatey(warrEnd(r.s,r.l))}</div></td><td>${r.cl?chip('Reclamo abierto','pur'):r.st==='vencida'?chip('Vencida','gray'):r.st==='porvencer'?chip('Por vencer','warn'):chip('Vigente','ok')}</td>
   <td style="white-space:nowrap">${r.cl?`<button class="btn sm primary" data-a="resolveClaim" data-id="${r.cl.id}">Resolver</button>`:r.left>0&&can('sell')?`<button class="btn sm" data-a="claimModal" data-s="${r.s.id}" data-i="${r.i}">Abrir reclamo</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">No hay garantías con ese filtro.</td></tr>'}</tbody></table></div></div>`;
}};
ACT.claimModal=d=>{const s=saleById(d.s),l=s.lines[+d.i];openModal(`${modalHead('Reclamo de garantía')}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px"><b>${esc(l.name)}</b> · ${s.no}</p><label>¿Cuál es el problema?</label><input id="cl-note" placeholder="Ej. La pantalla parpadea"></div>
  <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doClaim" data-s="${s.id}" data-i="${d.i}">Abrir reclamo</button></div>`)};
ACT.doClaim=d=>{const s=saleById(d.s),l=s.lines[+d.i],note=val('cl-note');if(!note){toast('Describe el problema');return}
  DB.claims.push({id:nextId('claim','G-',3),sale:s.id,line:+d.i,t:Date.now(),note,status:'Abierto'});const it=itemById(l.item);if(it)addEv(it,'Reclamo de garantía abierto',note,'warn');
  logAct('owner','🛠️','Reclamo de garantía: <b>'+esc(l.name)+'</b> · '+esc(note));saveDB();closeModal();render();toast('Reclamo registrado en el historial del producto')};
ACT.resolveClaim=d=>{const c=DB.claims.find(x=>x.id===d.id),s=saleById(c.sale),l=s.lines[c.line];
  openModal(`${modalHead('Resolver reclamo '+c.id)}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px"><b>${esc(l.name)}</b><br>Problema: ${esc(c.note)}</p><label>Resolución</label><select id="cl-res"><option>Reparado en garantía</option><option>Cambio del producto</option><option>Reembolso</option><option>No aplica garantía</option></select></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doResolve" data-id="${c.id}">Cerrar reclamo</button></div>`)};
ACT.doResolve=d=>{const c=DB.claims.find(x=>x.id===d.id),s=saleById(c.sale),l=s.lines[c.line],it=itemById(l.item);c.status='Resuelto';c.res=val('cl-res');if(it)addEv(it,'Reclamo resuelto',c.res,'ok');logAct('owner','✅','Reclamo resuelto: <b>'+esc(l.name)+'</b> · '+esc(c.res));saveDB();closeModal();render();toast('Reclamo cerrado')};

/* ---------- Clientes ---------- */
function cliStats(c){
  const sales=DB.sales.filter(s=>s.client===c.id&&!saleVoid(s)),tot=sales.reduce((a,s)=>a+saleNet(s),0);
  const old=sales.find(s=>Date.now()-s.t>330*DAY),hold=DB.items.find(i=>i.hold&&i.hold.client===c.id&&i.status==='Apartado');
  return{sales,tot,old,hold};
}
VIEWS.clientes={html(){
  const q=S.cliQ.toLowerCase(),list=DB.clients.filter(c=>!q||(c.name+' '+c.phone+' '+c.email+' '+c.doc).toLowerCase().includes(q));
  return `<div class="page-h"><div><h1>Clientes</h1><p>Historial de compras y la siguiente oportunidad de venta.</p></div>${can('clients')?'<button class="btn primary" data-a="clientForm">➕ Nuevo cliente</button>':''}</div>
  <div class="card"><div class="filters"><input id="cl-q" placeholder="Buscar por nombre, teléfono, correo o documento…" value="${esc(S.cliQ)}"></div><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th class="num">Compras</th><th class="num">Total comprado</th><th class="num">Ticket promedio</th><th>Siguiente acción</th></tr></thead><tbody>
  ${list.map(c=>{const st=cliStats(c);const act=st.old?chip('🔁 Ofrecer recompra','pur'):st.hold?chip('Completar apartado','info'):st.sales.length?chip('Postventa en curso','gray'):chip('Sin compras','gray');
   return `<tr class="click" data-a="clientDetail" data-id="${c.id}"><td class="m">${esc(c.name)}<div class="s">${esc(c.doc||'')}</div></td><td>${esc(c.phone||'—')}<div class="s">${esc(c.email||'')}</div></td><td class="num">${st.sales.length}</td><td class="num">${fmt(st.tot)}</td><td class="num">${st.sales.length?fmt(st.tot/st.sales.length):'—'}</td><td>${act}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay clientes con esa búsqueda.</td></tr>'}</tbody></table></div></div>`;
}};
ACT.clientDetail=d=>{const c=clientById(d.id),st=cliStats(c);
  openModal(`${modalHead(esc(c.name))}<div class="modal-b"><div class="kv"><div><span>Teléfono</span><b>${esc(c.phone||'—')}</b></div><div><span>Correo</span><b style="font-size:13px">${esc(c.email||'—')}</b></div><div><span>Documento</span><b>${esc(c.doc||'—')}</b></div><div><span>Total comprado</span><b>${fmt(st.tot)}</b></div></div>
   ${c.notes?`<div class="note">📝 ${esc(c.notes)}</div>`:''}<h3 style="margin:14px 0 6px;font-size:14px">Compras</h3>${st.sales.length?st.sales.sort((a,b)=>b.t-a.t).map(s=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-lt);font-size:13px;cursor:pointer" data-a="receipt" data-id="${s.id}"><span>${s.no} · ${esc(s.lines[0].name)}${s.lines.length>1?' +'+(s.lines.length-1):''}<br><span style="color:var(--t3);font-size:12px">${fdatey(s.t)}</span></span><b>${fmt(saleNet(s))}</b></div>`).join(''):'<div style="color:var(--t3);font-size:13px">Sin compras todavía.</div>'}</div>
   <div class="modal-f" style="flex-wrap:wrap">${can('clients')?`<button class="btn danger" data-a="delClient" data-id="${c.id}">Eliminar</button><button class="btn" data-a="clientForm" data-id="${c.id}">✏️ Editar</button>`:''}${st.old&&c.phone?`<button class="btn" data-a="recompra" data-id="${c.id}">🔁 Ofrecer recompra</button>`:''}${can('sell')?`<button class="btn primary" data-a="sellTo" data-id="${c.id}">🛒 Nueva venta</button>`:''}</div>`)};
ACT.sellTo=d=>{closeModal();posInit();S.pos.client=d.id;go('pos')};
ACT.recompra=d=>{const c=clientById(d.id),s=cliStats(c).old;waModal(c.name,c.phone,`Hola ${c.name.split(' ')[0]} 👋 Hace casi un año compraste tu ${s.lines[0].name} con nosotros.\nHoy te recibimos el tuyo como parte de pago y estrenas uno nuevo pagando solo la diferencia. ¿Te cotizo? 🔁`,'recompra')};
ACT.clientForm=d=>{if(!need('clients'))return;const c=d.id?clientById(d.id):{name:'',phone:'',email:'',doc:'',notes:''};
  openModal(`${modalHead(d.id?'Editar cliente':'Nuevo cliente')}<div class="modal-b f"><div class="row"><div style="grid-column:span 2"><label>Nombre *</label><input id="c-name" value="${esc(c.name)}"></div></div>
   <div class="row"><div><label>Teléfono</label><input id="c-phone" value="${esc(c.phone)}"></div><div><label>Correo</label><input id="c-email" value="${esc(c.email)}"></div><div><label>Documento</label><input id="c-doc" value="${esc(c.doc)}"></div></div>
   <label>Notas</label><input id="c-notes" value="${esc(c.notes||'')}"></div><div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="saveClient" data-id="${d.id||''}">Guardar</button></div>`)};
ACT.saveClient=d=>{const name=val('c-name');if(!name){toast('Escribe el nombre del cliente');return}
  const o={name,phone:val('c-phone'),email:val('c-email'),doc:val('c-doc'),notes:val('c-notes')};
  if(d.id)Object.assign(clientById(d.id),o);else DB.clients.push(Object.assign({id:nextId('client','c',0)},o));saveDB();closeModal();render();toast('✅ Cliente guardado')};
ACT.delClient=d=>{const c=clientById(d.id);if(DB.sales.some(s=>s.client===c.id)||DB.items.some(i=>i.hold&&i.hold.client===c.id)){toast('No se puede eliminar: el cliente tiene ventas o apartados asociados');return}
  confirmBox('Eliminar cliente','¿Eliminar a <b>'+esc(c.name)+'</b>?','Eliminar',()=>{DB.clients=DB.clients.filter(x=>x.id!==c.id);saveDB();closeModal();render();toast('Cliente eliminado')},true)};
