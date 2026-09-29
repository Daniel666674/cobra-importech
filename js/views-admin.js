/* =====================================================
   VISTAS · administración: compras, sedes, automatizaciones, reportes, usuarios, configuración
   ===================================================== */

/* ---------- Compras e importación ---------- */
function landed(po){
  const base=po.usd*po.trm,fr=base*po.freight/100,ar=(base+fr)*po.arancel/100,iv=(base+fr+ar)*po.iva/100;
  return{base,fr,ar,iv,unit:base+fr+ar+iv,total:(base+fr+ar+iv)*po.qty};
}
const LC={usd:812,qty:5,trm:0,freight:1.5,arancel:0,iva:19,margin:16};
function calcOut(){LC.trm=LC.trm||DB.settings.trm;const L=landed(LC),price=Math.round(L.unit/(1-LC.margin/100)/1000)*1000;
  return `<div class="cost"><div class="r"><span>Compra en pesos (USD × TRM)</span><span>${fmt(L.base)}</span></div><div class="r"><span>Flete y seguro</span><span>${fmt(L.fr)}</span></div><div class="r"><span>Aranceles</span><span>${fmt(L.ar)}</span></div><div class="r"><span>IVA</span><span>${fmt(L.iv)}</span></div>
  <div class="r t"><span>Costo real por equipo</span><span>${fmt(L.unit)}</span></div><div class="r"><span>Costo total del lote (${LC.qty} uds)</span><span>${fmt(L.total)}</span></div></div>
  <div class="kv"><div><span>Precio sugerido con ${LC.margin}% de margen</span><b style="font-size:20px;color:var(--green-t)">${fmt(price)}</b></div></div>`}
VIEWS.compras={html(){
  return `<div class="page-h"><div><h1>Compras e importación</h1><p>Sabe cuánto te cuesta realmente cada equipo puesto en tu bodega y recíbelos con verificación automática de IMEI.</p></div>${can('purchase')?'<button class="btn primary" data-a="poForm">➕ Nueva compra</button>':''}</div>
  <div class="grid g21"><div class="card"><div class="card-h"><h3>Órdenes de compra</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Orden</th><th>Proveedor</th><th class="num">Uds</th><th class="num">USD c/u</th><th class="num">TRM</th><th class="num">Costo real c/u</th><th>Estado</th><th></th></tr></thead><tbody>
   ${DB.purchases.map(p=>{const L=landed(p);return `<tr><td><div class="m">${p.id}</div><div class="s">${fdate(p.t)} · ${esc(p.desc||'')}</div></td><td>${esc(p.sup)}</td><td class="num">${p.qty}</td><td class="num">$${p.usd.toLocaleString('es-CO')}</td><td class="num">${p.trm.toLocaleString('es-CO')}</td><td class="num"><b>${fmt(L.unit)}</b></td><td>${chip(p.st,p.st==='Recibido'?'ok':p.st==='En tránsito'?'info':'warn')}</td>
    <td style="white-space:nowrap">${can('purchase')?`${p.st==='Pedido'?`<button class="btn sm" data-a="poStatus" data-id="${p.id}" data-s="En tránsito">Despachado</button> `:''}${p.st!=='Recibido'?`<button class="btn sm primary" data-a="receiveModal" data-id="${p.id}">Recibir</button> `:''}<button class="btn sm" data-a="poForm" data-id="${p.id}">Editar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Sin órdenes de compra.</td></tr>'}</tbody></table></div></div>
  <div class="card card-p f"><h3 style="margin-bottom:10px">Calculadora de costo real</h3><div class="row"><div><label>USD por equipo</label><input type="number" data-lc="usd" value="${LC.usd}"></div><div><label>Cantidad</label><input type="number" min="1" data-lc="qty" value="${LC.qty}"></div></div>
   <div class="row"><div><label>TRM</label><input type="number" data-lc="trm" value="${LC.trm||DB.settings.trm}"></div><div><label>Flete %</label><input type="number" step="0.1" data-lc="freight" value="${LC.freight}"></div></div>
   <div class="row"><div><label>Arancel %</label><input type="number" step="0.1" data-lc="arancel" value="${LC.arancel}"></div><div><label>IVA %</label><input type="number" data-lc="iva" value="${LC.iva}"></div><div><label>Margen %</label><input type="number" data-lc="margin" value="${LC.margin}"></div></div>
   <div id="lc-out">${calcOut()}</div><div class="note">Porcentajes de ejemplo, ajustables según tu operación.</div></div></div>`;
}};
function poPreview(){const p={usd:num('po-usd'),qty:Math.max(1,num('po-qty')),trm:num('po-trm'),freight:num('po-fr'),arancel:num('po-ar'),iva:num('po-iva')},L=landed(p),e=$('#po-prev');
  if(e)e.innerHTML=`Costo real por unidad: <b>${fmt(L.unit)}</b> · total del lote <b>${fmt(L.total)}</b>`}
ACT.poForm=d=>{if(!need('purchase'))return;const p=d.id?DB.purchases.find(x=>x.id===d.id):{sup:'',desc:'',qty:1,usd:0,trm:DB.settings.trm,freight:1.5,arancel:0,iva:19,st:'Pedido'};
  openModal(`${modalHead(d.id?'Editar '+p.id:'Nueva compra')}<div class="modal-b f"><div class="row"><div><label>Proveedor *</label><input id="po-sup" value="${esc(p.sup)}" placeholder="Ej. Miami Tech"></div><div style="grid-column:span 2"><label>Descripción</label><input id="po-desc" value="${esc(p.desc||'')}" placeholder="Ej. Lote iPhone 17 Pro"></div></div>
   <div class="row"><div><label>Cantidad *</label><input id="po-qty" type="number" min="1" value="${p.qty}"></div><div><label>USD por unidad *</label><input id="po-usd" type="number" min="0" value="${p.usd||''}"></div><div><label>TRM</label><input id="po-trm" type="number" value="${p.trm}"></div></div>
   <div class="row"><div><label>Flete %</label><input id="po-fr" type="number" step="0.1" value="${p.freight}"></div><div><label>Arancel %</label><input id="po-ar" type="number" step="0.1" value="${p.arancel}"></div><div><label>IVA %</label><input id="po-iva" type="number" value="${p.iva}"></div></div>
   <div class="row"><div><label>Estado</label><select id="po-st">${['Pedido','En tránsito','Recibido'].map(s=>`<option ${p.st===s?'selected':''}>${s}</option>`).join('')}</select></div></div><div id="po-prev" class="note"></div></div>
   <div class="modal-f">${d.id?`<button class="btn danger" data-a="delPo" data-id="${d.id}">Eliminar</button>`:''}<button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="savePo" data-id="${d.id||''}">Guardar</button></div>`);poPreview()};
ACT.savePo=d=>{const o={sup:val('po-sup'),desc:val('po-desc'),qty:Math.max(1,Math.round(num('po-qty'))),usd:num('po-usd'),trm:num('po-trm'),freight:num('po-fr'),arancel:num('po-ar'),iva:num('po-iva'),st:val('po-st')};
  if(!o.sup||!o.usd){toast('Completa proveedor y precio en USD');return}
  if(d.id)Object.assign(DB.purchases.find(x=>x.id===d.id),o);else DB.purchases.unshift(Object.assign({id:nextId('po','L-',3),t:Date.now()},o));saveDB();closeModal();render();toast('✅ Compra guardada')};
ACT.delPo=d=>{DB.purchases=DB.purchases.filter(x=>x.id!==d.id);saveDB();closeModal();render();toast('Orden eliminada')};
ACT.poStatus=d=>{DB.purchases.find(x=>x.id===d.id).st=d.s;saveDB();render()};
ACT.receiveModal=d=>{const p=DB.purchases.find(x=>x.id===d.id),L=landed(p);
  openModal(`${modalHead('Recibir '+p.id+' · ingresar al inventario')}<div class="modal-b f"><datalist id="dl-names">${CATALOG.map(n=>`<option value="${esc(n.name)}">`).join('')}</datalist>
   <p style="font-size:13px;color:var(--t2);margin-bottom:10px">Costo real por unidad: <b>${fmt(L.unit)}</b>. Pega un IMEI/serial por línea: en iPhone <b>cada IMEI se verifica automáticamente</b> y los reportados no se ingresan.</p>
   <div class="row"><div><label>Categoría</label><select id="rc-cat">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></div><div style="grid-column:span 2"><label>Producto *</label><input id="rc-name" list="dl-names" placeholder="Ej. iPhone 17 Pro"></div></div>
   <div class="row"><div><label>Capacidad / detalle</label><input id="rc-spec" placeholder="256 GB"></div><div><label>Color</label><input id="rc-color"></div><div><label>Condición</label><select id="rc-cond">${CONDS.map(c=>`<option>${c}</option>`).join('')}</select></div></div>
   <div class="row"><div><label>Sede</label><select id="rc-br">${DB.settings.branches.map(b=>`<option>${esc(b)}</option>`).join('')}</select></div><div><label>Cantidad (accesorios / AirPods)</label><input id="rc-qty" type="number" min="1" value="${p.qty}"></div><div><label>Precio al cliente</label><input id="rc-price" type="number" step="1000"></div></div>
   <label>IMEI / seriales (uno por línea)</label><textarea id="rc-ser" rows="4" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:12.5px" placeholder="Solo para equipos con serial (iPhone, iPad, Mac, Watch)"></textarea>
   <div id="rc-res"></div></div><div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doReceive" data-id="${p.id}">Recibir e ingresar</button></div>`,true)};
ACT.doReceive=d=>{if(!need('inv_edit'))return;const p=DB.purchases.find(x=>x.id===d.id),L=landed(p),cat=val('rc-cat'),name=val('rc-name');if(!name){toast('Escribe el producto');return}
  const spec=val('rc-spec'),color=val('rc-color'),cond=val('rc-cond'),br=val('rc-br'),price=num('rc-price')||listPrice(name,spec,cond)||Math.round(L.unit*1.2/1000)*1000;
  const qtyTrack=cat==='AirPods'||cat==='Accesorios',ok=[],bad=[];
  if(qtyTrack){
    const q=Math.max(1,Math.round(num('rc-qty'))),ex=DB.items.find(i=>isQty(i)&&i.name===name&&i.spec===spec&&i.cond===cond&&i.branch===br);
    if(ex){ex.cost=Math.round((ex.cost*ex.qty+L.unit*q)/(ex.qty+q));ex.qty+=q;addEv(ex,'Ingreso ×'+q,p.id+' · costo promedio actualizado','ok');ok.push(ex.id)}
    else{const it=createItemQuiet(cat,{name,spec,color,cond,cost:Math.round(L.unit),price,qty:q,min:3,warr:DB.settings.warr[cond],branch:br,src:'Importación '+p.id});it.tl=[];addEv(it,'Ingreso ×'+q,p.id,'ok');addEv(it,'En vitrina',br);ok.push(it.id)}
  }else{
    const sers=[...new Set(($('#rc-ser').value||'').split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))];
    if(!sers.length){toast('Pega al menos un IMEI o serial');return}
    sers.forEach(sr=>{
      if(DB.items.some(x=>x.serial===sr)){bad.push([sr,'Ya existe en el inventario']);return}
      if(cat==='iPhone'){const v=verifyImei(sr);if(v.verdict==='blocked'){bad.push([sr,v.steps.find(s=>s.s==='fail').d]);if(v.reason==='neg')logAct('owner','🚨','Alerta al dueño: IMEI <b>••'+sr.slice(-6)+'</b> reportado en lote '+p.id);return}}
      const it=createItemQuiet(cat,{name,spec,color,cond,serial:sr,cost:Math.round(L.unit),price,warr:DB.settings.warr[cond],branch:br,src:'Importación '+p.id,batt:cond==='Nuevo'?100:null});
      it.tl=[];addEv(it,'Ingreso por compra',p.id+' · costo real '+fmt(L.unit));if(cat==='iPhone')addEv(it,'IMEI verificado','Base negativa: limpio · iCloud: libre · Operador: libre','ok');addEv(it,'En vitrina',br);ok.push(it.id)});
  }
  if(!ok.length){$('#rc-res').innerHTML='<div class="note" style="background:var(--red-bg);color:var(--red-t)">⛔ No se ingresó ningún equipo.<br>'+bad.map(b=>'••'+esc(b[0].slice(-6))+': '+esc(b[1])).join('<br>')+'</div>';return}
  p.st='Recibido';logAct('owner','📦','Lote <b>'+p.id+'</b> recibido: '+ok.length+' referencia(s) ingresadas'+(bad.length?' · '+bad.length+' bloqueadas':''));saveDB();paintNav();
  if(bad.length){$('#rc-res').innerHTML='<div class="note" style="background:var(--amber-bg);color:var(--amber-t)">✅ '+ok.length+' ingresados. ⛔ '+bad.length+' bloqueados:<br>'+bad.map(b=>'••'+esc(b[0].slice(-6))+': '+esc(b[1])).join('<br>')+'</div>';render();toast('Lote recibido con '+bad.length+' equipo(s) bloqueado(s)')}
  else{closeModal();render();toast('✅ Lote recibido · '+ok.length+' ingresados')}};

/* ---------- Sedes y transferencias ---------- */
function createTransfer(from,to,lines){
  const t={id:nextId('tr','TR-',3),from,to,lines,guia:'INT-'+(2200+DB.seq.tr),st:'En tránsito',t:Date.now(),by:ME.id};
  lines.forEach(l=>{const it=itemById(l.item);if(isQty(it)){it.qty-=l.qty;addEv(it,'Salió ×'+l.qty+' hacia '+to,t.id,'warn')}else{it.status='En tránsito';addEv(it,'En tránsito hacia '+to,t.id,'warn')}});
  DB.transfers.unshift(t);logAct('owner','🚚','Transferencia <b>'+t.id+'</b> creada: '+from+' → '+to+' ('+lines.length+' producto(s))');saveDB();paintNav();return t;
}
VIEWS.sedes={html(){
  const B=DB.settings.branches;
  return `<div class="page-h"><div><h1>Sedes y transferencias</h1><p>Stock por sede y movimientos entre bodega y vitrinas.</p></div>${can('transfer')?'<button class="btn primary" data-a="trForm">➕ Nueva transferencia</button>':''}</div>
  <div class="card"><div class="card-h"><h3>Unidades disponibles por categoría</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Categoría</th>${B.map(b=>`<th class="num">${esc(b)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
   ${CATS.map(c=>{const n=B.map(b=>DB.items.filter(i=>i.cat===c&&i.branch===b&&['En vitrina','Apartado'].includes(itemState(i))).reduce((a,i)=>a+stockQty(i),0));return `<tr><td class="m">${CAT_IC[c]} ${c}</td>${n.map(x=>`<td class="num" style="${x===0?'color:var(--t4)':''}">${x}</td>`).join('')}<td class="num"><b>${n.reduce((a,b)=>a+b,0)}</b></td></tr>`}).join('')}</tbody></table></div></div>
  <div class="card mt"><div class="card-h"><h3>Transferencias</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Guía</th><th>Ruta</th><th>Productos</th><th>Estado</th><th></th></tr></thead><tbody>
   ${DB.transfers.map(t=>`<tr><td class="m">${t.id}<div class="s">${t.guia} · ${fdate(t.t)}</div></td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${t.lines.map(l=>{const i=itemById(l.item);return i?esc(uname(i))+(l.qty>1?' ×'+l.qty:''):'—'}).join(', ')}</td><td>${chip(t.st,t.st==='Recibido'?'ok':'info')}</td>
    <td>${t.st!=='Recibido'&&can('transfer')?`<button class="btn sm primary" data-a="receive" data-id="${t.id}">Confirmar recibido</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sin transferencias.</td></tr>'}</tbody></table></div></div>`;
}};
ACT.receive=d=>{if(!need('transfer'))return;const t=DB.transfers.find(x=>x.id===d.id);
  t.lines.forEach(l=>{const it=itemById(l.item);if(!it)return;
    if(isQty(it)){const ex=DB.items.find(x=>isQty(x)&&x.id!==it.id&&x.name===it.name&&x.spec===it.spec&&x.cond===it.cond&&x.color===it.color&&x.branch===t.to);
      if(ex){ex.qty+=l.qty;addEv(ex,'Recibido ×'+l.qty+' desde '+t.from,t.id,'ok')}
      else if(it.branch===t.to){it.qty+=l.qty}
      else{const n=(DB.seq.item=(DB.seq.item||0)+1);const c=JSON.parse(JSON.stringify(it));c.id='I-'+String(n).padStart(4,'0');c.sku=CAT_SKU[c.cat]+'-'+String(n).padStart(4,'0');c.branch=t.to;c.qty=l.qty;c.tl=[];addEv(c,'Recibido ×'+l.qty+' desde '+t.from,t.id,'ok');DB.items.unshift(c)}}
    else{it.status='En vitrina';it.branch=t.to;addEv(it,'Recibido en '+t.to,'Guía '+t.guia+' · confirmado','ok');addEv(it,'En vitrina',t.to)}});
  t.st='Recibido';logAct('owner','🚚','Transferencia <b>'+t.id+'</b> recibida en '+esc(t.to));saveDB();paintNav();render();toast('✅ Transferencia recibida en '+t.to)};
function trItems(from,q){return DB.items.filter(i=>i.branch===from&&isAvail(i)&&(!q||(i.name+' '+i.spec+' '+i.color+' '+i.serial).toLowerCase().includes(q.toLowerCase()))).slice(0,40)}
function trListHtml(from,q){from=from||$('#tr-from').value;q=q==null?val('tr-q'):q;
  return trItems(from,q).map(i=>`<div class="pos-row"><label style="display:flex;gap:10px;align-items:center;flex:1;min-width:0;cursor:pointer"><input type="checkbox" class="tr-ck" data-id="${i.id}"><span style="min-width:0"><b style="font-size:13px">${esc(i.name)}</b><br><span style="font-size:12px;color:var(--t3)">${esc([i.spec,i.color].filter(Boolean).join(' · '))}${i.serial?' · •••'+esc(i.serial.slice(-5)):''}</span></span></label>
   ${isQty(i)?`<input class="tr-q" data-id="${i.id}" type="number" min="1" max="${i.qty}" value="1" style="width:66px;height:30px;border:1px solid var(--border);border-radius:6px;padding:0 6px" title="Máx. ${i.qty}">`:''}</div>`).join('')||'<div class="empty" style="padding:20px">No hay productos disponibles en esa sede.</div>'}
ACT.trForm=()=>{if(!need('transfer'))return;const B=DB.settings.branches;
  openModal(`${modalHead('Nueva transferencia')}<div class="modal-b f"><div class="row"><div><label>Desde</label><select id="tr-from">${B.map(b=>`<option>${esc(b)}</option>`).join('')}</select></div><div><label>Hacia</label><select id="tr-to">${B.map((b,i)=>`<option ${i===1?'selected':''}>${esc(b)}</option>`).join('')}</select></div></div>
   <input id="tr-q" placeholder="Filtrar productos…" style="width:100%;height:34px;border:1px solid var(--border);border-radius:8px;padding:0 10px;margin-bottom:8px"><div id="tr-list" class="pos-scroll" style="max-height:300px;border:1px solid var(--border);border-radius:10px">${trListHtml(B[0],'')}</div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doTrForm">Crear transferencia</button></div>`,true)};
ACT.doTrForm=()=>{const from=$('#tr-from').value,to=$('#tr-to').value;if(from===to){toast('Elige sedes distintas');return}
  const lines=$$('.tr-ck:checked').map(c=>{const it=itemById(c.dataset.id),qe=document.querySelector('.tr-q[data-id="'+it.id+'"]');return{item:it.id,qty:isQty(it)?Math.max(1,Math.min(it.qty,+qe.value||1)):1}});
  if(!lines.length){toast('Selecciona al menos un producto');return}createTransfer(from,to,lines);closeModal();render();toast('🚚 Transferencia creada')};

/* ---------- Automatizaciones y alertas ---------- */
VIEWS.auto={html(){
  ALERTS=computeAlerts();const on=AUTOS.filter(a=>DB.autos[a.id]).length,tot=AUTOS.reduce((a,x)=>a+(DB.autos[x.id]?autoCount(x.id):0),0);
  const f=S.feedType,feed=DB.feed.filter(x=>!f||x.type===f).slice(0,40);
  return `<div class="page-h"><div><h1>Alertas y automatizaciones</h1><p>Lo que el sistema detecta y hace solo, calculado con tus datos reales.</p></div><button class="btn primary" data-a="runNow">▶ Ejecutar revisión ahora</button></div>
  <div class="grid g3"><div class="card kpi"><div class="l">Automatizaciones activas</div><div class="v">${on} de ${AUTOS.length}</div></div><div class="card kpi"><div class="l">Acciones últimos 7 días</div><div class="v">${tot}</div><div class="d">≈ ${Math.round(tot*6/60)} h de trabajo ahorradas</div></div><div class="card kpi ${ALERTS.length?'warn':''}"><div class="l">Alertas abiertas ahora</div><div class="v">${ALERTS.length}</div></div></div>
  <div class="card mt"><div class="card-h"><h3>Alertas abiertas</h3></div><div class="card-p" style="padding-top:6px">${ALERTS.length?ALERTS.map((a,i)=>`<div class="alert-li" data-a="alert" data-i="${i}"><span style="font-size:18px">${a.ic}</span><span style="flex:1"><b>${a.n}</b> · ${a.title}<br><span style="font-size:12px;color:var(--t3)">${esc(a.detail)}</span></span><span style="color:var(--t4)">›</span></div>`).join(''):'<div class="empty" style="padding:20px">✅ Sin alertas: todo en orden.</div>'}</div></div>
  <div class="grid g3 mt">${AUTOS.map(a=>`<div class="card auto"><div class="auto-h"><div style="display:flex;gap:9px;align-items:center"><span style="font-size:20px">${a.ic}</span><h3>${a.n}</h3></div>${can('settings')?`<button class="sw ${DB.autos[a.id]?'on':''}" data-a="toggleAuto" data-id="${a.id}" aria-label="Activar o desactivar"></button>`:`<span class="chip ${DB.autos[a.id]?'ok':'gray'}">${DB.autos[a.id]?'Activa':'Pausada'}</span>`}</div>
   <div>${chip('Impacto '+a.imp.toLowerCase(),a.imp==='Alto'?'bad':'warn')}</div><p>${a.d}</p><div class="meta"><span class="cnt"><b>${autoCount(a.id)}</b> en 7 días</span><button class="btn sm" data-a="autoEx" data-id="${a.id}">Ver ejemplo real</button></div></div>`).join('')}</div>
  <div class="card mt"><div class="card-h"><h3>Registro de actividad</h3><select id="feed-f" style="height:32px;border:1px solid var(--border);border-radius:8px;padding:0 8px"><option value="">Todo</option>${AUTOS.map(a=>`<option value="${a.id}" ${f===a.id?'selected':''}>${a.n}</option>`).join('')}</select></div>
   <div class="card-p"><ul class="feed">${feed.map(x=>`<li><div class="fi">${x.ic}</div><div>${x.x}<time>${fdt(x.t)} · ${esc(x.by)}</time></div></li>`).join('')||'<li>Sin actividad.</li>'}</ul></div></div>`;
}};
ACT.toggleAuto=d=>{if(!need('settings'))return;DB.autos[d.id]=!DB.autos[d.id];saveDB();render()};
ACT.runNow=()=>{runEngine(true);render();toast('✅ Revisión ejecutada · resultados en el registro')};
ACT.autoEx=d=>{const a=AUTOS.find(x=>x.id===d.id);openModal(`${modalHead(a.ic+' '+a.n)}<div class="modal-b"><p style="font-size:13px;color:var(--t2);margin-bottom:12px">${a.d}</p><div style="font-size:11.5px;font-weight:700;color:var(--t3);text-transform:uppercase;margin-bottom:6px">Ejemplo con tus datos</div>${autoExample(a.id)}</div><div class="modal-f"><button class="btn primary" data-a="closeModal">Entendido</button></div>`)};
function autoExample(id){
  const bub=(t,cls)=>`<div class="wa ${cls||''}">${esc(t).replace(/\*(.+?)\*/g,'<b>$1</b>')}<small>${ftime(Date.now())}</small></div>`;
  const none='<div class="note">Todavía no hay datos para mostrar este ejemplo.</div>';
  const av=DB.items.filter(i=>isAvail(i)&&i.cat==='iPhone'&&i.cond==='Nuevo').sort((a,b)=>b.acq-a.acq)[0];
  switch(id){
   case 'cuotas':{const x=DB.plans.map(p=>({p,i:planInfo(p)})).find(x=>x.i.st==='porvencer'||x.i.st==='mora');if(!x)return none;const c=clientById(x.p.client),s=saleById(x.p.sale);
     return `<div class="wa-box">${bub(`Hola ${c.name.split(' ')[0]} 👋 Te recordamos que tu cuota ${x.i.cov+1} de ${x.p.n} de ${s.lines[0].name} por *${fmt(x.i.nextAmt)}* ${x.i.st==='mora'?'está vencida hace '+x.i.moraDays+' días':'vence el *'+fdate(x.i.next)+'*'}.\nPaga fácil aquí: [enlace de pago Bold]`)}</div><div class="note">Se envía 3 días antes. Si hay mora, el mensaje escala solo hasta llamada con IA y gestor humano.</div>`}
   case 'reprice':{const rows=DB.items.filter(i=>i.cat==='iPhone'&&i.cond==='Nuevo'&&inStock(i)).slice(0,4),trm=DB.settings.trm,nt=Math.round(trm*1.015);
     return `<div class="cost"><div class="r"><span>Simulación: TRM</span><span>$${trm.toLocaleString('es-CO')} → <b>$${nt.toLocaleString('es-CO')}</b> (+1,5%)</span></div>${rows.map(i=>`<div class="r"><span>${esc(uname(i))}</span><span>${fmt(i.price)} → <b>${fmt(Math.round(i.price*1.015/1000)*1000)}</b></span></div>`).join('')}</div><div class="note">Nunca baja del margen mínimo (${DB.settings.minMargin}%). El dueño aprueba con un clic o lo deja en automático.</div>`}
   case 'aged':{const r=DB.items.filter(i=>inStock(i)&&i.status!=='En tránsito'&&daysIn(i)>DB.settings.agedDays).sort((a,b)=>daysIn(b)-daysIn(a)).slice(0,4);if(!r.length)return '<div class="note">✅ No hay productos envejecidos ahora mismo.</div>';
     return `<div class="cost">${r.map(i=>{const pct=daysIn(i)>DB.settings.agedDays+15?8:5,np=Math.round(i.price*(1-pct/100)/1000)*1000;return `<div class="r"><span>${esc(uname(i))} (${daysIn(i)} d)</span><span><b>Rebajar ${pct}%</b> → ${fmt(np)}</span></div>`}).join('')}</div><div class="note">Propone rebaja o traslado de sede, con el margen que quedaría.</div>`}
   case 'wa':if(!av)return none;return `<div class="wa-box">${bub('Hola, ¿tienen '+av.name+'?','in')}${bub(`¡Hola! 👋 Sí, tenemos disponible en *${av.branch}*:\n📱 ${uname(av)} · ${av.color} · ${av.cond}\n💰 ${fmt(av.price)} (o 6 cuotas de ~${fmt(Math.round(av.price*.7/6/1000)*1000)})\n¿Te lo aparto con un abono? 🔒`)}${bub('Sí, apártalo','in')}${bub('Listo ✅ Aquí tu enlace de pago del abono: [Bold]. Lo reservamos por '+DB.settings.holdDays+' días.')}</div>`;
   case 'reorder':{const r=DB.items.filter(i=>isQty(i)&&i.min>0&&i.qty<=i.min).slice(0,5);if(!r.length)return '<div class="note">✅ Ningún accesorio bajo su stock mínimo.</div>';
     return `<div class="cost">${r.map(i=>`<div class="r"><span>${esc(i.name)} (hay ${i.qty}, mínimo ${i.min})</span><span><b>Comprar ${Math.max(1,i.min*2-i.qty)}</b></span></div>`).join('')}</div><div class="note">Arma la orden de compra al proveedor. Tú solo la apruebas.</div>`}
   case 'owner':{const r=DB.feed.filter(f=>f.type==='owner').slice(0,3);return `<div class="wa-box">${r.length?r.map(f=>bub(f.x.replace(/<[^>]+>/g,''))).join(''):bub('🚨 Alerta Importech: descuento fuera de rango en una venta.')}</div>`}
   case 'apartado':{const h=DB.items.find(i=>i.status==='Apartado'&&i.hold);if(!h)return none;const c=clientById(h.hold.client);return `<div class="wa-box">${bub(`Hola ${c.name.split(' ')[0]} 👋 Tu apartado del ${uname(h)} vence el ${fdate(h.hold.expires)}.\nCompleta tu compra y llévatelo hoy: [enlace de pago]`)}</div><div class="note">Si no completa, el equipo se libera solo y vuelve a vitrina.</div>`}
   case 'post':{const s=[...DB.sales].sort((a,b)=>b.t-a.t)[0];if(!s)return none;return `<ol class="tl"><li><time>Día 7</time><b>Reseña</b><br><span>“¿Cómo te está yendo con tu ${esc(s.lines[0].name)}? Cuéntanos en 1 minuto ⭐”</span></li><li><time>Día 30</time><b>Accesorios</b><br><span>Oferta de funda y vidrio para su modelo.</span></li><li><time>30 días antes de vencer</time><b>Fin de garantía</b><br><span>Aviso de vencimiento y opción de extender.</span></li></ol>`}
   case 'recompra':{const x=DB.sales.find(s=>Date.now()-s.t>330*DAY&&s.client);if(!x)return none;const c=clientById(x.client);return `<div class="wa-box">${bub(`Hola ${c.name.split(' ')[0]} 👋 Hace casi un año compraste tu ${x.lines[0].name} con nosotros.\nHoy te lo recibimos como parte de pago y estrenas uno nuevo pagando solo la diferencia. ¿Te cotizo? 🔁`)}</div>`}
   case 'fe':{const s=[...DB.sales].sort((a,b)=>b.t-a.t)[0];if(!s)return none;return `<div class="cost"><div class="r"><span>Comprobante</span><b>${s.no}</b></div><div class="r"><span>Detalle</span><span>${esc(s.lines[0].name)} · ${esc(s.lines[0].serial||'')}</span></div><div class="r"><span>Total</span><span>${fmt(saleNet(s))}</span></div><div class="r"><span>Enviado a</span><span>cliente por WhatsApp y correo</span></div></div><div class="note">Con el sistema real, aquí se emite la factura electrónica ante la DIAN.</div>`}
   case 'caja':{const t=DB.sales.filter(s=>Date.now()-s.t<DAY),by={};t.forEach(s=>by[s.method]=(by[s.method]||0)+saleNet(s));const r=Object.entries(by);return `<div class="cost">${r.length?r.map(([m,v])=>`<div class="r"><span>${m}</span><b>${fmt(v)}</b></div>`).join(''):'<div class="r"><span>Sin ventas en las últimas 24 horas</span><span>—</span></div>'}<div class="r t"><span>Total del día</span><span>${fmt(t.reduce((a,s)=>a+saleNet(s),0))}</span></div></div><div class="note">Si hay diferencia con el efectivo contado, avisa al dueño con el detalle.</div>`}
   case 'pub':if(!av)return none;return `<div class="wa-box">${bub(`📱 *${uname(av)}*\n${av.color} · ${av.cond} · ${av.warr} meses de garantía\n💰 ${fmt(av.price)}\n📍 ${av.branch}`)}</div><div class="note">Se publica solo en catálogo de WhatsApp Business y Marketplace cuando el equipo entra a vitrina.</div>`;
  }
  return none;
}

/* ---------- Reportes ---------- */
VIEWS.reportes={html(){
  const days=S.rep.days,cv=can('cost_view'),from=Date.now()-days*DAY;
  const ss=DB.sales.filter(s=>s.t>=from&&!saleVoid(s)),rev=ss.reduce((a,s)=>a+saleNet(s),0),mg=ss.reduce((a,s)=>a+saleMargin(s),0);
  const catOf=l=>(itemById(l.item)||{cat:'Otros'}).cat,byCat={},bySeller={},byProd={};
  ss.forEach(s=>{const tot=s.lines.reduce((a,l)=>a+lineNet(l)*l.price,0)||1;
    s.lines.forEach(l=>{const net=lineNet(l);if(net<=0)return;const r=Math.round(net*l.price*(1-s.disc/100)),m=r-net*l.cost,c=catOf(l);byCat[c]=byCat[c]||{n:0,r:0,m:0};byCat[c].n+=net;byCat[c].r+=r;byCat[c].m+=m;
      byProd[l.name]=byProd[l.name]||{n:0,r:0,m:0};byProd[l.name].n+=net;byProd[l.name].r+=r;byProd[l.name].m+=m});
    const u=(userById(s.by)||{name:'—'}).name;bySeller[u]=bySeller[u]||{n:0,r:0,m:0};bySeller[u].n++;bySeller[u].r+=saleNet(s);bySeller[u].m+=saleMargin(s)});
  const bars=(obj,key,fmtf)=>{const rows=Object.entries(obj).sort((a,b)=>b[1][key]-a[1][key]),mx=Math.max(...rows.map(r=>r[1][key]),1);return rows.map(([k,v])=>`<div class="hbar" data-tip="${esc(k)}: ${v.n} · ${fmt(v.r)}${cv?' · margen '+fmt(v.m):''}"><span>${esc(k)}</span><div class="tr"><i style="width:${v[key]/mx*100}%"></i></div><b>${fmtf(v[key])}</b></div>`).join('')||'<div class="empty" style="padding:16px">Sin ventas en el período.</div>'};
  const stock=DB.items.filter(i=>inStock(i)&&i.status!=='En tránsito'),bk=[['0–15 d',0,15],['16–30 d',16,30],['31–45 d',31,45],['46–60 d',46,60],['+60 d',61,9999]].map(([l,a,b])=>{const it=stock.filter(i=>daysIn(i)>=a&&daysIn(i)<=b);return{l,n:it.length,v:it.reduce((s,i)=>s+i.cost*stockQty(i),0)}}),mb=Math.max(...bk.map(b=>b.n),1);
  const B=DB.settings.branches;
  return `<div class="page-h"><div><h1>Reportes</h1><p>Rentabilidad y rotación con costos reales, no estimados.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="rep-d" style="height:34px;border:1px solid var(--border);border-radius:8px;padding:0 10px">${[7,30,90,365].map(d=>`<option value="${d}" ${days===d?'selected':''}>Últimos ${d} días</option>`).join('')}</select><button class="btn" data-a="exportSales">⬇️ Ventas CSV</button><button class="btn" data-a="exportInv">⬇️ Inventario CSV</button></div></div>
  <div class="grid g4"><div class="card kpi"><div class="l">Ventas</div><div class="v">${fmtM(rev)}</div><div class="d">${ss.length} ventas</div></div>${cv?`<div class="card kpi"><div class="l">Margen</div><div class="v">${fmtM(mg)}</div><div class="d">${rev?Math.round(mg/rev*100):0}% sobre ventas</div></div>`:''}
   <div class="card kpi"><div class="l">Ticket promedio</div><div class="v">${fmtM(ss.length?rev/ss.length:0)}</div></div><div class="card kpi"><div class="l">Unidades vendidas</div><div class="v">${ss.reduce((a,s)=>a+s.lines.reduce((x,l)=>x+lineNet(l),0),0)}</div></div></div>
  <div class="grid g2 mt"><div class="card"><div class="card-h"><div><h3>Ventas por categoría</h3><div class="sub">Ingresos en el período</div></div></div><div class="card-p">${bars(byCat,'r',fmtM)}</div></div>
   <div class="card"><div class="card-h"><div><h3>${cv?'Margen por categoría':'Unidades por categoría'}</h3></div></div><div class="card-p">${cv?bars(byCat,'m',fmtM):bars(byCat,'n',x=>x)}</div></div></div>
  <div class="grid g2 mt"><div class="card"><div class="card-h"><div><h3>Productos más vendidos</h3><div class="sub">Por ingresos</div></div></div><div class="card-p">${bars(Object.fromEntries(Object.entries(byProd).sort((a,b)=>b[1].r-a[1].r).slice(0,6)),'r',fmtM)}</div></div>
   <div class="card"><div class="card-h"><div><h3>Ventas por persona</h3></div></div><div class="card-p">${bars(bySeller,'r',fmtM)}</div></div></div>
  <div class="grid g2 mt"><div class="card"><div class="card-h"><div><h3>Antigüedad del inventario</h3><div class="sub">Referencias por días en inventario</div></div></div><div class="card-p">${bk.map(b=>`<div class="hbar" data-tip="${b.l}: ${b.n} referencias${cv?' · '+fmtM(b.v)+' en costo':''}"><span>${b.l}</span><div class="tr"><i style="width:${b.n/mb*100}%"></i></div><b>${b.n}</b></div>`).join('')}<div class="note">Cada día extra en vitrina es dinero inmovilizado.</div></div></div>
   <div class="card"><div class="card-h"><h3>Valor del inventario por sede</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Sede</th><th class="num">Unidades</th>${cv?'<th class="num">A costo</th>':''}<th class="num">A precio</th></tr></thead><tbody>${B.map(b=>{const it=DB.items.filter(i=>i.branch===b&&inStock(i));return `<tr><td class="m">${esc(b)}</td><td class="num">${it.reduce((a,i)=>a+stockQty(i),0)}</td>${cv?`<td class="num">${fmt(it.reduce((a,i)=>a+i.cost*stockQty(i),0))}</td>`:''}<td class="num">${fmt(it.reduce((a,i)=>a+i.price*stockQty(i),0))}</td></tr>`}).join('')}</tbody></table></div></div></div>`;
}};

/* ---------- Usuarios y permisos ---------- */
VIEWS.usuarios={html(){
  const tab=S.usrTab,roles=Object.entries(DB.roles);
  const head=`<div class="page-h"><div><h1>Usuarios y permisos</h1><p>Crea usuarios, asigna roles y decide qué puede hacer cada uno.</p></div>${tab==='usuarios'?'<button class="btn primary" data-a="userForm">➕ Nuevo usuario</button>':tab==='roles'?'<button class="btn primary" data-a="roleForm">➕ Nuevo rol</button>':''}</div>
   <div class="tabs">${[['usuarios','Usuarios'],['roles','Roles y permisos'],['audit','Auditoría']].map(([k,l])=>`<button class="tab ${tab===k?'on':''}" data-a="usrTab" data-t="${k}">${l}</button>`).join('')}</div>`;
  if(tab==='usuarios')return head+`<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>PIN</th><th>Estado</th><th></th></tr></thead><tbody>
   ${DB.users.map(u=>`<tr><td><div style="display:flex;gap:10px;align-items:center"><div class="avatar" style="width:30px;height:30px;font-size:11px">${initials(u.name)}</div><div class="m">${esc(u.name)}${u.id===ME.id?' <span class="chip info">Tú</span>':''}</div></div></td><td>${esc(u.email)}</td><td>${chip(esc(roleOf(u).name),u.role==='dev'?'pur':'gray')}</td><td>${u.pin?'🔒 Sí':'—'}</td><td>${u.active?chip('Activo','ok'):chip('Inactivo','gray')}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-a="userForm" data-id="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>
   <div class="note" style="margin-top:14px">Los usuarios y sus permisos se guardan en este navegador. Es un control de acceso de demostración: en el sistema real cada usuario inicia sesión con contraseña segura en el servidor.</div>`;
  if(tab==='roles')return head+`<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Permiso</th>${roles.map(([k,r])=>`<th class="num">${esc(r.name)}${!r.locked&&!DB.users.some(u=>u.role===k)?` <button class="x" style="font-size:14px" data-a="delRole" data-id="${k}" title="Eliminar rol">🗑</button>`:''}</th>`).join('')}</tr></thead><tbody>
   ${PERMS.map(([p,l])=>`<tr><td>${l}</td>${roles.map(([k,r])=>`<td class="num"><input type="checkbox" class="perm" data-r="${k}" data-p="${p}" ${r.locked||r.perms.includes(p)?'checked':''} ${r.locked?'disabled':''}></td>`).join('')}</tr>`).join('')}
   <tr><td><b>Usuarios con este rol</b></td>${roles.map(([k])=>`<td class="num"><b>${DB.users.filter(u=>u.role===k).length}</b></td>`).join('')}</tr></tbody></table></div></div><div class="note" style="margin-top:14px">Los cambios se aplican al instante. El rol Administrador siempre tiene todos los permisos.</div>`;
  return head+`<div class="card"><div class="card-p"><ul class="feed">${DB.feed.slice(0,60).map(x=>`<li><div class="fi">${x.ic}</div><div>${x.x}<time>${fdt(x.t)} · ${esc(x.by)}</time></div></li>`).join('')}</ul></div></div>`;
}};
ACT.usrTab=d=>{S.usrTab=d.t;render()};
ACT.userForm=d=>{if(!need('users'))return;const u=d.id?userById(d.id):{name:'',email:'',role:'employee',active:true,pin:null};
  openModal(`${modalHead(d.id?'Editar usuario':'Nuevo usuario')}<div class="modal-b f"><div class="row"><div><label>Nombre *</label><input id="u-name" value="${esc(u.name)}"></div><div><label>Correo *</label><input id="u-email" value="${esc(u.email)}"></div></div>
   <div class="row"><div><label>Rol</label><select id="u-role">${Object.entries(DB.roles).map(([k,r])=>`<option value="${k}" ${u.role===k?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div><div><label>PIN de acceso (4 a 6 dígitos)</label><input id="u-pin" inputmode="numeric" maxlength="6" placeholder="${u.pin?'•••• (dejar vacío para no cambiar)':'Opcional'}"></div></div>
   <label class="chk"><input type="checkbox" id="u-act" ${u.active?'checked':''} ${u.id===ME.id?'disabled':''}> Usuario activo</label>${u.pin?'<label class="chk"><input type="checkbox" id="u-nopin"> Quitar PIN</label>':''}</div>
   <div class="modal-f">${d.id&&d.id!==ME.id?`<button class="btn danger" data-a="delUser" data-id="${d.id}">Eliminar</button>`:''}<button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="saveUser" data-id="${d.id||''}">Guardar</button></div>`)};
ACT.saveUser=async d=>{const name=val('u-name'),email=val('u-email').toLowerCase(),role=val('u-role'),pin=val('u-pin');
  if(!name||!email){toast('Completa nombre y correo');return}if(!/^\S+@\S+\.\S+$/.test(email)){toast('El correo no es válido');return}
  if(pin&&!/^\d{4,6}$/.test(pin)){toast('El PIN debe tener de 4 a 6 números');return}
  if(DB.users.some(x=>x.email===email&&x.id!==d.id)){toast('Ya existe un usuario con ese correo');return}
  const act=$('#u-act')?$('#u-act').checked:true;
  if(d.id){const u=userById(d.id);
    const mgr=x=>x.active&&(roleOf(x).locked||roleOf(x).perms.includes('users'));
    if(mgr(u)&&DB.users.filter(mgr).length<=1&&(!(DB.roles[role].locked||DB.roles[role].perms.includes('users'))||!act)){toast('Debe quedar al menos un usuario que pueda administrar usuarios');return}
    Object.assign(u,{name,email,role,active:act});if(pin)u.pin=await sha(pin);if($('#u-nopin')&&$('#u-nopin').checked)u.pin=null;if(u.id===ME.id)ME=u}
  else{const u={id:nextId('user','u',0),name,email,role,active:act,pin:pin?await sha(pin):null};DB.users.push(u)}
  logAct('owner','👤','Usuario '+(d.id?'actualizado':'creado')+': <b>'+esc(name)+'</b> ('+esc(DB.roles[role].name)+') por '+esc(ME.name));saveDB();closeModal();paintBrand();render();toast('✅ Usuario guardado')};
ACT.delUser=d=>{const u=userById(d.id);if(u.id===ME.id)return;if((roleOf(u).locked||roleOf(u).perms.includes('users'))&&DB.users.filter(x=>x.active&&(roleOf(x).locked||roleOf(x).perms.includes('users'))).length<=1){toast('Debe quedar al menos un usuario que pueda administrar usuarios');return}
  confirmBox('Eliminar usuario','¿Eliminar a <b>'+esc(u.name)+'</b>? Sus ventas anteriores se conservan.','Eliminar',()=>{DB.users=DB.users.filter(x=>x.id!==u.id);saveDB();closeModal();render();toast('Usuario eliminado')},true)};
ACT.roleForm=()=>openModal(`${modalHead('Nuevo rol')}<div class="modal-b f"><label>Nombre del rol *</label><input id="r-name" placeholder="Ej. Asesor comercial"></div><div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="saveRole">Crear rol</button></div>`);
ACT.saveRole=()=>{const n=val('r-name');if(!n){toast('Escribe el nombre del rol');return}const k='rol'+nextId('role','',0);DB.roles[k]={name:n,perms:['inv_view']};saveDB();closeModal();render();toast('Rol creado · asígnale permisos en la tabla')};
ACT.delRole=d=>{delete DB.roles[d.id];saveDB();render()};

/* ---------- Configuración ---------- */
VIEWS.config={html(){
  const s=DB.settings,tab=S.cfgTab;
  const head=`<div class="page-h"><div><h1>Configuración</h1><p>Datos del negocio, logo, sedes, reglas y datos del demo.</p></div></div><div class="tabs">${[['negocio','Negocio y logo'],['reglas','Sedes y reglas'],['datos','Datos']].map(([k,l])=>`<button class="tab ${tab===k?'on':''}" data-a="cfgTab" data-t="${k}">${l}</button>`).join('')}</div>`;
  if(tab==='negocio')return head+`<div class="grid g2"><div class="card card-p f"><h3 style="margin-bottom:12px">Datos del negocio</h3>
   <div class="row"><div style="grid-column:span 2"><label>Nombre comercial *</label><input id="s-name" value="${esc(s.name)}"></div></div><div class="row"><div><label>Razón social</label><input id="s-legal" value="${esc(s.legal)}"></div><div><label>NIT</label><input id="s-nit" value="${esc(s.nit)}"></div></div>
   <div class="row"><div style="grid-column:span 2"><label>Dirección</label><input id="s-addr" value="${esc(s.address)}"></div></div><div class="row"><div><label>Teléfono</label><input id="s-phone" value="${esc(s.phone)}"></div><div><label>Correo</label><input id="s-email" value="${esc(s.email)}"></div></div>
   <label>Mensaje al pie del comprobante</label><input id="s-foot" value="${esc(s.footer)}" style="margin-bottom:12px"><label>Color de la marca</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px"><input type="color" id="s-brand" value="${s.brand}" style="width:46px;height:36px;padding:2px;cursor:pointer">${['#4F46E5','#0D9488','#DC2626','#EA580C','#2563EB','#7C3AED','#111827'].map(c=>`<button class="swatch" data-a="swatch" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
   <button class="btn primary" data-a="saveBiz">Guardar cambios</button></div>
   <div class="card card-p"><h3>Logo</h3><p style="font-size:13px;color:var(--t3);margin:4px 0 12px">Sube el logo desde tu computador (PNG, JPG, WEBP o SVG). Se usa en el menú, el inicio de sesión y los comprobantes.</p>
    <div class="dropzone" id="logo-drop" data-a="pickLogo">${s.logo?`<img src="${s.logo}" alt="Logo actual" style="max-width:200px;max-height:110px">`:`<div class="logo-mark" style="width:64px;height:64px;font-size:26px;margin:0 auto">${esc(initials(s.name)||'I')}</div><div style="margin-top:8px;font-size:13px;color:var(--t2)">Aún no hay logo</div>`}<div style="margin-top:10px;font-size:12.5px;color:var(--t3)">Arrastra un archivo aquí o haz clic para elegirlo</div></div>
    <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" data-a="pickLogo">📁 Elegir archivo</button>${s.logo?'<button class="btn danger" data-a="rmLogo">Quitar logo</button>':''}</div></div></div>`;
  if(tab==='reglas')return head+`<div class="grid g2"><div class="card card-p f"><h3 style="margin-bottom:12px">Sedes</h3>${s.branches.map((b,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px"><input class="br-in" data-i="${i}" value="${esc(b)}" style="flex:1"><button class="btn sm danger" data-a="delBranch" data-i="${i}" title="Eliminar sede">🗑</button></div>`).join('')}
    <button class="btn" data-a="addBranch" style="margin-top:4px">➕ Agregar sede</button><div class="note">Al renombrar una sede, todos sus productos se actualizan. No se puede eliminar una sede con productos.</div></div>
   <div class="card card-p f"><h3 style="margin-bottom:12px">Reglas del negocio</h3><label>Garantía por condición (meses)</label><div class="row">${CONDS.map(c=>`<div><label style="font-weight:500;color:var(--t3)">${c}</label><input type="number" min="0" max="36" data-w="${c}" value="${s.warr[c]}"></div>`).join('')}</div>
    <div class="row"><div><label>Descuento máximo sin autorización (%)</label><input id="s-disc" type="number" min="0" max="30" value="${s.maxDisc}"></div><div><label>Margen mínimo (%)</label><input id="s-mg" type="number" min="0" max="80" value="${s.minMargin}"></div></div>
    <div class="row"><div><label>Días para considerar envejecido</label><input id="s-aged" type="number" min="7" value="${s.agedDays}"></div><div><label>Días de apartado</label><input id="s-hold" type="number" min="1" max="30" value="${s.holdDays}"></div><div><label>TRM de referencia</label><input id="s-trm" type="number" value="${s.trm}"></div></div>
    <button class="btn primary" data-a="saveRules">Guardar reglas</button></div></div>`;
  return head+`<div class="grid g2"><div class="card card-p"><h3>Copia de seguridad</h3><p style="font-size:13px;color:var(--t3);margin:4px 0 12px">Todo lo que haces queda guardado en este navegador. Descarga una copia para llevarla a otro equipo o para recuperarla.</p>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-a="exportJson">⬇️ Descargar copia (JSON)</button>${can('dev')?'<button class="btn" data-a="importJson">⬆️ Restaurar copia</button>':''}</div><input type="file" id="json-file" accept="application/json,.json" hidden>
   <div class="note">${STORAGE_OK?'✅ Guardado automático activo en este navegador.':'⚠️ Este navegador no permite guardar: el demo funciona en memoria y se pierde al recargar.'}</div></div>
   <div class="card card-p"><h3>Restablecer demo</h3><p style="font-size:13px;color:var(--t3);margin:4px 0 12px">Borra tus cambios y vuelve a cargar los ${DB.items.length>0?'datos de ejemplo':''} con fechas de hoy. Conserva la sesión.</p>${can('dev')?'<button class="btn danger" data-a="resetDemo">🔄 Restablecer datos de ejemplo</button>':'<div class="note">🔒 Solo el Desarrollador puede restablecer o restaurar los datos.</div>'}
   <div class="note">Datos actuales: ${DB.items.length} productos · ${DB.sales.length} ventas · ${DB.clients.length} clientes · ${DB.users.length} usuarios.</div></div></div>`;
}};
ACT.cfgTab=d=>{S.cfgTab=d.t;render()};
ACT.swatch=d=>{$('#s-brand').value=d.c;DB.settings.brand=d.c;applyBrand()};
ACT.saveBiz=()=>{if(!need('settings'))return;const s=DB.settings,n=val('s-name');if(!n){toast('El nombre del negocio es obligatorio');return}
  Object.assign(s,{name:n,legal:val('s-legal'),nit:val('s-nit'),address:val('s-addr'),phone:val('s-phone'),email:val('s-email'),footer:val('s-foot'),brand:$('#s-brand').value});
  saveDB();applyBrand();paintBrand();render();toast('✅ Datos del negocio guardados')};
ACT.pickLogo=()=>{if(!need('settings','Tu rol no puede cambiar el logo'))return;$('#logo-file').click()};
async function setLogoFile(file){
  if(!need('settings','Tu rol no puede cambiar el logo'))return;
  try{DB.settings.logo=await processLogo(file);saveDB();if(!STORAGE_OK)toast('Logo cargado (no se pudo guardar en este navegador)');applyBrand();paintBrand();if(S.view==='config')render();toast('✅ Logo actualizado')}
  catch(e){toast('⚠️ '+esc(e.message))}
}
ACT.rmLogo=()=>{DB.settings.logo=null;saveDB();applyBrand();paintBrand();render();toast('Logo eliminado')};
ACT.addBranch=()=>{DB.settings.branches.push('Nueva sede '+(DB.settings.branches.length+1));saveDB();render()};
ACT.delBranch=d=>{const b=DB.settings.branches[+d.i];if(DB.settings.branches.length<=1){toast('Debe existir al menos una sede');return}
  if(DB.items.some(i=>i.branch===b&&(inStock(i)||i.status==='Vendido'))){toast('No se puede eliminar: la sede tiene productos o historial');return}DB.settings.branches.splice(+d.i,1);saveDB();render()};
ACT.saveRules=()=>{if(!need('settings'))return;const s=DB.settings,names=$$('.br-in').map(x=>x.value.trim());
  if(names.some(n=>!n)||new Set(names).size!==names.length){toast('Los nombres de sede no pueden estar vacíos ni repetidos');return}
  names.forEach((n,i)=>{const old=s.branches[i];if(old!==n){DB.items.forEach(it=>{if(it.branch===old)it.branch=n});DB.transfers.forEach(t=>{if(t.from===old)t.from=n;if(t.to===old)t.to=n})}});s.branches=names;
  $$('[data-w]').forEach(e=>s.warr[e.dataset.w]=Math.max(0,Math.round(+e.value||0)));
  s.maxDisc=Math.max(0,Math.min(30,num('s-disc')));s.minMargin=Math.max(0,num('s-mg'));s.agedDays=Math.max(7,Math.round(num('s-aged'))||45);s.holdDays=Math.max(1,Math.round(num('s-hold'))||5);s.trm=num('s-trm')||s.trm;
  saveDB();render();toast('✅ Reglas guardadas')};
ACT.exportJson=()=>{download('importech-demo-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(DB),'application/json');toast('Copia descargada')};
ACT.importJson=()=>{if(need('dev','Solo el Desarrollador puede restaurar copias'))$('#json-file').click()};
function importJsonFile(file){const fr=new FileReader();fr.onload=()=>{try{let d=JSON.parse(fr.result);const dd=migrateDB(d);if(!dd)throw 0;d=dd;if(!Array.isArray(d.items)||!d.settings||!Array.isArray(d.users)||!d.users.length)throw 0;
    confirmBox('Restaurar copia','Se reemplazarán todos los datos actuales por los de la copia (<b>'+d.items.length+'</b> productos, <b>'+d.sales.length+'</b> ventas).','Restaurar',()=>{DB=d;if(!userById(ME.id)){logout();return}ME=userById(ME.id);saveDB();applyBrand();paintBrand();paintNav();closeModal();go('dashboard');toast('✅ Copia restaurada')})}
  catch(e){toast('⚠️ El archivo no es una copia válida de este demo')}};fr.readAsText(file)}
ACT.resetDemo=()=>!need('dev','Solo el Desarrollador puede restablecer los datos')?0:confirmBox('Restablecer demo','Se borrarán todos tus cambios (productos, ventas, clientes, usuarios y logo) y volverán los datos de ejemplo.','Restablecer',()=>{const me=ME.email;resetDB();ME=DB.users.find(u=>u.email===me)||DB.users[0];applyBrand();paintBrand();paintNav();closeModal();go('dashboard');toast('🔄 Datos de ejemplo restablecidos')},true);
