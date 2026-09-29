/* =====================================================
   VISTAS · comercial: POS, ventas, comprobante, cuotas, garantías, clientes
   ===================================================== */

/* ---------- Mensaje de WhatsApp (vista previa) ---------- */
function waModal(title,phone,text,type,onSend){
  window.__waSend=()=>{logAct(type,'💬','Mensaje enviado a <b>'+esc(title)+'</b> por WhatsApp (demo)');saveDB();closeModal();toast('💬 Mensaje enviado por WhatsApp (demo)');onSend&&onSend()};
  openModal(`${modalHead('WhatsApp · '+esc(title))}<div class="modal-b"><div style="color:var(--t3);font-size:12.5px;margin-bottom:8px">Para: ${esc(phone||'sin teléfono')}</div>
   <div class="wa-box"><div class="wa">${esc(text).replace(/\*(.+?)\*/g,'<b>$1</b>')}<small>${ftime(Date.now())} ✓✓</small></div></div>
   <div class="note">En el sistema real este mensaje se envía por la API de WhatsApp Business. En el demo solo se registra en la actividad.</div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cerrar</button><button class="btn primary" onclick="window.__waSend()">Enviar (demo)</button></div>`);
}

/* ---------- POS ---------- */
function posInit(){if(!S.pos)S.pos={lines:[],client:'',mode:'contado',method:'Efectivo',disc:0,notes:'',q:'',prepaid:0,holdItem:null,newName:'',newPhone:'',abono:0}}
function posStart(itemId,fromHold){
  posInit();const it=itemById(itemId);if(!it)return;
  if(fromHold&&it.hold){S.pos={lines:[],client:it.hold.client,mode:'contado',method:'Efectivo',disc:0,notes:'',q:'',prepaid:it.hold.abono,holdItem:it.id,newName:'',newPhone:'',abono:0}}
  if(!S.pos.lines.some(l=>l.item===itemId))S.pos.lines.push({item:itemId,qty:1});
  go('pos');
}
function posTotals(){
  const P=S.pos,lines=P.lines.map(l=>({l,it:itemById(l.item)})).filter(x=>x.it);
  const sub=lines.reduce((a,x)=>a+x.it.price*x.l.qty,0),disc=Math.max(0,Math.min(100,+P.disc||0)),total=Math.round(sub*(1-disc/100));
  const cost=lines.reduce((a,x)=>a+x.it.cost*x.l.qty,0);
  return{lines,sub,disc,total,cost,discAmt:sub-total};
}
function posList(){
  const q=(S.pos.q||'').toLowerCase(),inCart=new Set(S.pos.lines.map(l=>l.item));
  const r=DB.items.filter(i=>isAvail(i)&&(!q||(i.name+' '+i.spec+' '+i.color+' '+i.serial+' '+i.sku).toLowerCase().includes(q))).sort((a,b)=>b.acq-a.acq).slice(0,14);
  if(!r.length)return '<div class="empty" style="padding:24px">Ningún producto disponible coincide.</div>';
  return r.map(i=>`<div class="pos-row"><div style="min-width:0"><div class="m" style="font-weight:600;font-size:13px">${CAT_IC[i.cat]} ${esc(i.name)}</div><div class="s" style="font-size:12px;color:var(--t3)">${esc([i.spec,i.color].filter(Boolean).join(' · '))} · ${condChip(i.cond)} · ${esc(i.branch)}${isQty(i)?' · '+i.qty+' uds':''}</div></div>
    <div style="text-align:right;flex-shrink:0"><div style="font-weight:700;font-size:13px">${fmt(i.price)}</div><button class="btn sm" data-a="posAdd" data-id="${i.id}" ${inCart.has(i.id)?'disabled':''}>${inCart.has(i.id)?'Agregado':'+ Agregar'}</button></div></div>`).join('');
}
function posCart(){
  const P=S.pos,T=posTotals(),cv=can('cost_view');
  const isCuotas=P.mode.startsWith('cuotas'),isHold=P.mode==='apartado',n=isCuotas?+P.mode.split(':')[1]:0;
  const abono=isCuotas?Math.round(T.total*.3):0,cuota=isCuotas?Math.ceil((T.total-abono)/n/1000)*1000:0;
  const overDisc=T.disc>DB.settings.maxDisc,belowCost=T.total<T.cost;
  return `<h3>Venta</h3>
  ${T.lines.length?T.lines.map(x=>`<div class="cart-line"><div style="min-width:0;flex:1"><div style="font-weight:600;font-size:13px">${esc(uname(x.it))}</div><div style="font-size:12px;color:var(--t3)">${esc(x.it.color)} ${x.it.serial?'· •••'+esc(x.it.serial.slice(-6)):''} · ${x.it.warr} m garantía</div></div>
    ${isQty(x.it)?`<div class="stepper"><button data-a="posQty" data-id="${x.it.id}" data-d="-1">−</button><b>${x.l.qty}</b><button data-a="posQty" data-id="${x.it.id}" data-d="1">+</button></div>`:''}
    <div style="width:92px;text-align:right;font-weight:700;font-size:13px">${fmt(x.it.price*x.l.qty)}</div><button class="x" data-a="posDel" data-id="${x.it.id}" aria-label="Quitar">×</button></div>`).join(''):'<div class="empty" style="padding:22px">Agrega productos desde la lista.</div>'}
  <div class="f" style="margin-top:14px"><div class="row"><div><label>Cliente ${isCuotas||isHold?'*':''}</label><select id="pos-cli"><option value="">Mostrador (sin registrar)</option>${DB.clients.map(c=>`<option value="${c.id}" ${P.client===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}<option value="new" ${P.client==='new'?'selected':''}>➕ Cliente nuevo…</option></select></div>
   <div><label>Forma de venta</label><select id="pos-mode"><option value="contado" ${P.mode==='contado'?'selected':''}>Contado</option>${[3,6,12].map(k=>`<option value="cuotas:${k}" ${P.mode==='cuotas:'+k?'selected':''}>${k} cuotas</option>`).join('')}<option value="apartado" ${isHold?'selected':''}>Apartado con abono</option></select></div></div>
   ${P.client==='new'?`<div class="row"><div><label>Nombre *</label><input id="pos-nn" value="${esc(P.newName)}" placeholder="Nombre completo"></div><div><label>Teléfono</label><input id="pos-np" value="${esc(P.newPhone)}" placeholder="300 000 0000"></div></div>`:''}
   <div class="row"><div><label>Método de pago</label><select id="pos-method">${METHODS.map(m=>`<option ${P.method===m?'selected':''}>${m}</option>`).join('')}</select></div>
    <div><label>Descuento % (límite ${DB.settings.maxDisc}%)</label><input id="pos-disc" type="number" min="0" max="30" step="0.5" value="${P.disc||0}"></div></div>
   ${isHold?`<div class="row"><div><label>Abono (COP) *</label><input id="pos-abono" type="number" step="10000" min="0" value="${P.abono||''}" placeholder="Ej. 500000"></div><div><label>Vence en (días)</label><input id="pos-days" type="number" min="1" max="30" value="${DB.settings.holdDays}"></div></div>`:''}</div>
  <div class="cost">
    <div class="r"><span>Subtotal</span><span>${fmt(T.sub)}</span></div>
    ${T.disc?`<div class="r"><span>Descuento ${T.disc}%</span><span style="color:var(--red-t)">−${fmt(T.discAmt)}</span></div>`:''}
    ${P.prepaid?`<div class="r"><span>Abono previo del apartado</span><span style="color:var(--green-t)">−${fmt(P.prepaid)}</span></div>`:''}
    <div class="r t"><span>Total</span><span style="font-size:17px">${fmt(T.total)}</span></div>
    ${isCuotas?`<div class="r"><span>Abono inicial (30%)${P.prepaid?' · ya pagado '+fmt(Math.min(P.prepaid,abono)):''}</span><span>${fmt(abono)}</span></div><div class="r"><span>${n} cuotas de</span><b>${fmt(cuota)}</b></div>`:''}
    ${cv&&T.lines.length?`<div class="r"><span>Margen de la venta</span><span style="color:${T.total<T.cost?'var(--red-t)':'var(--green-t)'}">${fmt(T.total-T.cost)} · ${T.total?Math.round((T.total-T.cost)/T.total*100):0}%</span></div>`:''}</div>
  ${overDisc?`<div class="note" style="background:var(--amber-bg);color:var(--amber-t)">⚠️ El descuento supera el límite del ${DB.settings.maxDisc}%. ${can('discount')?'Tu rol puede autorizarlo y se avisará al dueño.':'Tu rol no puede darlo: pide autorización al propietario/a.'}</div>`:''}
  ${belowCost?`<div class="note" style="background:var(--red-bg);color:var(--red-t)">⛔ El total queda por debajo del costo.</div>`:''}
  <button class="btn primary" style="width:100%;height:42px;margin-top:12px;justify-content:center" data-a="posConfirm" ${T.lines.length?'':'disabled'}>${isHold?'🔒 Crear apartado':'✅ Confirmar venta'}</button>
  ${T.lines.length?'<button class="btn sm" style="margin-top:8px" data-a="posClear">Vaciar carrito</button>':''}`;
}
VIEWS.pos={html(){posInit();
  return `<div class="page-h"><div><h1>Nueva venta</h1><p>Busca productos, arma el carrito, elige el cliente y la forma de pago.</p></div></div>
  <div class="grid pos-grid"><div class="card"><div class="filters"><input id="pos-q" placeholder="Buscar producto, serial/IMEI o SKU…" value="${esc(S.pos.q)}" autocomplete="off"></div><div id="pos-list" class="pos-scroll">${posList()}</div></div>
  <div class="card card-p" id="pos-cart">${posCart()}</div></div>`;
}};
function posPaint(){const c=$('#pos-cart');if(c)c.innerHTML=posCart();const l=$('#pos-list');if(l)l.innerHTML=posList()}
ACT.posAdd=d=>{posInit();if(!S.pos.lines.some(l=>l.item===d.id))S.pos.lines.push({item:d.id,qty:1});posPaint()};
ACT.posDel=d=>{S.pos.lines=S.pos.lines.filter(l=>l.item!==d.id);posPaint()};
ACT.posQty=d=>{const l=S.pos.lines.find(x=>x.item===d.id),it=itemById(d.id);l.qty=Math.max(1,Math.min(it.qty,l.qty+(+d.d)));posPaint()};
ACT.posClear=()=>{S.pos=null;posInit();posPaint()};
function posReadInputs(){const P=S.pos;if($('#pos-cli'))P.client=$('#pos-cli').value;if($('#pos-mode'))P.mode=$('#pos-mode').value;if($('#pos-method'))P.method=$('#pos-method').value;
  if($('#pos-disc'))P.disc=+$('#pos-disc').value||0;if($('#pos-nn'))P.newName=$('#pos-nn').value;if($('#pos-np'))P.newPhone=$('#pos-np').value;if($('#pos-abono'))P.abono=+$('#pos-abono').value||0}
ACT.posConfirm=()=>{
  if(!need('sell'))return;posReadInputs();const P=S.pos,T=posTotals();
  if(!T.lines.length){toast('Agrega al menos un producto');return}
  for(const x of T.lines){if(!isAvail(x.it)&&x.it.id!==P.holdItem){toast('«'+uname(x.it)+'» ya no está disponible');return}if(isQty(x.it)&&x.l.qty>x.it.qty){toast('Solo hay '+x.it.qty+' de «'+x.it.name+'»');return}}
  const isCuotas=P.mode.startsWith('cuotas'),isHold=P.mode==='apartado';
  if((isCuotas||isHold)&&!P.client){toast('Elige o crea el cliente para vender a cuotas o apartar');return}
  if(P.client==='new'&&!P.newName.trim()){toast('Escribe el nombre del cliente nuevo');$('#pos-nn')&&$('#pos-nn').focus();return}
  if(T.disc>DB.settings.maxDisc&&!can('discount')){toast('🔒 El descuento supera el límite del '+DB.settings.maxDisc+'%. Pide autorización al propietario/a.');return}
  if(T.total<T.cost&&!can('discount')){toast('🔒 No puedes vender por debajo del costo. Pide autorización al propietario/a.');return}
  if(isHold){
    if(T.lines.length!==1||isQty(T.lines[0].it)){toast('El apartado es para un solo equipo (no accesorios por cantidad)');return}
    if(P.abono<=0){toast('Escribe el valor del abono');$('#pos-abono')&&$('#pos-abono').focus();return}
  }
  let cid=P.client;
  if(cid==='new'){const c={id:nextId('client','c',0),name:P.newName.trim(),phone:P.newPhone.trim(),email:'',doc:'',notes:''};DB.clients.push(c);cid=c.id}
  const now=Date.now(),cl=clientById(cid);
  if(isHold){
    const it=T.lines[0].it,days=Math.max(1,Math.min(30,num('pos-days')||DB.settings.holdDays));
    it.status='Apartado';it.hold={client:cid,abono:P.abono,expires:now+days*DAY,t:now,by:ME.id,no:'RA-'+(1000+(DB.seq.hold=(DB.seq.hold||0)+1))};
    addEv(it,'Apartado',cl.name+' · abono '+fmt(P.abono)+' · vence en '+days+' días','warn');
    logAct('apartado','🔒','Apartado de <b>'+esc(cl.name)+'</b>: <b>'+esc(uname(it))+'</b> con abono de '+fmt(P.abono));
    S.pos=null;saveDB();paintNav();go('cuotas');openHoldReceipt(it.id);toast('🔒 Apartado creado · vence en '+days+' días');return;
  }
  const id=nextId('sale','S-',4),no='FV-'+(1000+DB.seq.sale);
  const sale={id,no,t:now,client:cid||null,by:ME.id,method:P.method,mode:P.mode,disc:T.disc,abono:0,prepaid:P.prepaid||0,plan:null,notes:'',
    lines:T.lines.map(x=>({item:x.it.id,name:uname(x.it),color:x.it.color,cond:x.it.cond,serial:x.it.serial,qty:x.l.qty,price:x.it.price,cost:x.it.cost+(isQty(x.it)?0:(x.it.repairs||0)),warr:x.it.warr,ret:0}))};
  sale.total=saleNet(sale);sale.branch=T.lines[0].it.branch;
  T.lines.forEach(x=>{const it=x.it;
    if(isQty(it)){it.qty-=x.l.qty;addEv(it,'Vendido ×'+x.l.qty,(cl?cl.name:'Mostrador')+' · '+no,'ok');
      if(it.min&&it.qty<=it.min){logAct('reorder','📈','Stock bajo: <b>'+esc(it.name)+'</b> quedó con '+it.qty+' unidades (mínimo '+it.min+')')}}
    else{it.status='Vendido';it.hold=null;addEv(it,'Vendido',(cl?cl.name:'Mostrador')+' · '+(isCuotas?'plan de '+P.mode.split(':')[1]+' cuotas':'contado · '+P.method)+' · '+no,'ok');addEv(it,'Garantía activada',it.warr+' meses','ok')}});
  if(isCuotas){const n=+P.mode.split(':')[1],abono=Math.round(sale.total*.3),cuota=Math.ceil((sale.total-abono)/n/1000)*1000;
    const pl={id:nextId('plan','P-',3),sale:id,client:cid,total:sale.total,abono,n,cuota,start:now,paidAmt:0,pays:[]};sale.abono=abono;sale.plan=pl.id;DB.plans.push(pl);
    logAct('cuotas','💳','Plan de <b>'+n+' cuotas</b> creado para <b>'+esc(cl.name)+'</b> ('+fmt(sale.total)+')')}
  DB.sales.push(sale);
  logAct('fe','🧾','Comprobante <b>'+no+'</b> emitido · '+fmt(sale.total)+(cl?' · '+esc(cl.name):''));
  if(T.disc>DB.settings.maxDisc)logAct('owner','🚨','Alerta al dueño: descuento de <b>'+T.disc+'%</b> en '+no+' ('+esc(ME.name)+')');
  if(T.total<T.cost)logAct('owner','🚨','Alerta al dueño: <b>venta bajo costo</b> en '+no+' ('+esc(ME.name)+')');
  S.pos=null;saveDB();paintNav();render();openReceipt(id);
  if(T.disc>DB.settings.maxDisc)toast('🚨 Alerta enviada al dueño: descuento del '+T.disc+'%');
};

/* ---------- Comprobantes: ver js/receipts.js ---------- */
ACT.refundModal=d=>{const s=saleById(d.id);
  if(s.plan&&planInfo(planById(s.plan)).st!=='pagado'){toast('Esta venta tiene un plan de cuotas activo. Resuélvelo con el propietario/a antes de devolver.');return}
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
   <td>${esc(s.lines[0].name)}${s.lines.length>1?` <span style="color:var(--t3)">+${s.lines.length-1}</span>`:''}</td><td>${s.mode==='contado'?esc(s.method):s.mode.split(':')[1]+' cuotas'}</td><td>${esc((userById(s.by)||{name:'—'}).name.split(' ')[0])}</td>
   <td class="num">${fmt(saleNet(s))}</td>${cv?`<td class="num" style="color:var(--green-t);font-weight:600">${fmt(saleMargin(s))}</td>`:''}<td>${v?chip('Devuelta','bad'):part?chip('Devolución parcial','warn'):s.plan?chip('A cuotas','info'):chip('Pagada','ok')}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">No hay ventas con esos filtros.</td></tr>'}</tbody></table></div>
  <div style="padding:12px 16px;font-size:13px;color:var(--t2);border-top:1px solid var(--border);display:flex;gap:18px"><span><b>${list.length}</b> ventas</span><span>Total <b>${fmt(tot)}</b></span>${cv?`<span>Margen <b>${fmt(mg)}</b></span>`:''}</div></div>`;
}};
ACT.exportSales=()=>{const cv=can('cost_view');downloadCSV('ventas-'+new Date().toISOString().slice(0,10)+'.csv',[['Venta','Fecha','Cliente','Producto','Serial','Cantidad','Valor unitario','Descuento %','Total venta','Pago',...(cv?['Margen venta']:[]),'Vendedor'],
  ...DB.sales.flatMap(s=>s.lines.map((l,i)=>[s.no,new Date(s.t).toISOString().slice(0,10),(clientById(s.client)||{name:'Mostrador'}).name,l.name,l.serial,lineNet(l),l.price,s.disc,i===0?saleNet(s):'',s.mode==='contado'?s.method:s.mode,...(cv?[i===0?saleMargin(s):'']:[]),(userById(s.by)||{name:''}).name]))]);toast('Ventas exportadas')};

/* ---------- Cuotas y apartados ---------- */
VIEWS.cuotas={html(){
  const rows=DB.plans.map(p=>({p,i:planInfo(p)})).sort((a,b)=>({mora:0,porvencer:1,aldia:2,pagado:3}[a.i.st]-{mora:0,porvencer:1,aldia:2,pagado:3}[b.i.st]));
  const act=rows.filter(x=>x.i.st!=='pagado'),moraN=act.filter(x=>x.i.st==='mora'),ap=DB.items.filter(i=>i.status==='Apartado'&&i.hold);
  return `<div class="page-h"><div><h1>Apartados y cuotas</h1><p>Vende financiado y deja que el sistema recuerde, escale y registre cada pago.</p></div></div>
  <div class="grid g3"><div class="card kpi"><div class="l">Cartera por cobrar</div><div class="v">${fmtM(act.reduce((a,x)=>a+x.i.bal,0))}</div><div class="d">${act.length} planes activos</div></div>
   <div class="card kpi ${moraN.length?'bad':''}"><div class="l">En mora</div><div class="v">${moraN.length}</div><div class="d">${fmtM(moraN.reduce((a,x)=>a+x.i.bal,0))} en saldo</div></div>
   <div class="card kpi"><div class="l">Apartados vigentes</div><div class="v">${ap.length}</div><div class="d">Con abono · se liberan solos al vencer</div></div></div>
  <div class="card mt"><div class="card-h"><h3>Planes de cuotas</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Cliente</th><th>Producto</th><th>Progreso</th><th class="num">Cuota</th><th>Próximo pago</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
  ${rows.map(({p,i})=>{const c=clientById(p.client),s=saleById(p.sale);return `<tr><td><div class="m">${esc(c.name)}</div><div class="s">${esc(c.phone)}</div></td><td>${esc(s.lines[0].name)}${s.lines.length>1?' +'+(s.lines.length-1):''}<div class="s">${s.no}</div></td>
   <td style="min-width:130px"><div class="bar ${i.st==='mora'?'r':''}"><i style="width:${Math.min(100,(p.paidAmt+p.abono)/p.total*100)}%"></i></div><div class="s">${i.cov} de ${p.n} cuotas</div></td><td class="num">${fmt(p.cuota)}</td>
   <td>${i.st==='pagado'?'—':fdate(i.next)}${i.st==='mora'?`<div class="s" style="color:var(--red-t)">${i.moraDays} días de mora</div>`:''}</td><td class="num">${fmt(i.bal)}</td><td>${chip(PLAN_ST[i.st][0],PLAN_ST[i.st][1])}</td>
   <td style="white-space:nowrap"><button class="btn sm" data-a="planDetail" data-id="${p.id}">Ver</button> ${i.st!=='pagado'?`<button class="btn sm" data-a="remind" data-id="${p.id}">💬</button> ${can('credit')?`<button class="btn sm primary" data-a="payModal" data-id="${p.id}">Registrar pago</button>`:''}`:''}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">Aún no hay planes de cuotas. Se crean al vender a cuotas desde “Nueva venta”.</td></tr>'}</tbody></table></div></div>
  <div class="card mt"><div class="card-h"><h3>Motor de cobranza automático</h3></div><div class="card-p"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px">${chip('D-3 · Recordatorio WhatsApp','info')}<span>→</span>${chip('D0 · Aviso de mora','warn')}<span>→</span>${chip('D+4 · Llamada con IA','pur')}<span>→</span>${chip('D+10 · Gestor humano','bad')}</div></div></div>
  <div class="card mt"><div class="card-h"><h3>Apartados</h3></div><div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Equipo</th><th>Cliente</th><th class="num">Abono</th><th class="num">Precio</th><th>Vence</th><th></th></tr></thead><tbody>
   ${ap.map(i=>{const c=clientById(i.hold.client),left=Math.ceil((i.hold.expires-Date.now())/DAY);return `<tr><td class="click" data-a="item" data-id="${i.id}" style="cursor:pointer"><div class="m">${esc(uname(i))}</div><div class="s">${esc(i.color)}</div></td><td>${esc(c?c.name:'—')}</td><td class="num">${fmt(i.hold.abono)}</td><td class="num">${fmt(i.price)}</td>
    <td>${fdate(i.hold.expires)}<div class="s" style="color:${left<=2?'var(--red-t)':'var(--t3)'}">${left>0?'en '+left+' días':'vencido'} · se libera solo</div></td>
    <td style="white-space:nowrap"><button class="btn sm" data-a="holdReceipt" data-id="${i.id}">Recibo</button> ${can('sell')?`<button class="btn sm primary" data-a="finishHold" data-id="${i.id}">Completar venta</button> <button class="btn sm" data-a="releaseHold" data-id="${i.id}">Liberar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay apartados vigentes.</td></tr>'}</tbody></table></div></div>`;
}};
ACT.planDetail=d=>{const p=planById(d.id),i=planInfo(p),c=clientById(p.client),s=saleById(p.sale);
  const sched=Array.from({length:p.n},(_,k)=>{const due=p.start+(k+1)*30*DAY,paid=k<i.cov;return{k:k+1,due,paid,late:!paid&&due<Date.now()}});
  openModal(`${modalHead('Plan '+p.id+' · '+esc(c.name))}<div class="modal-b"><div class="kv"><div><span>Venta</span><b>${s.no}</b></div><div><span>Total financiado</span><b>${fmt(p.total)}</b></div><div><span>Abono inicial</span><b>${fmt(p.abono)}</b></div><div><span>Saldo</span><b>${fmt(i.bal)}</b></div></div>
   <table><thead><tr><th>Cuota</th><th>Vence</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>${sched.map(x=>`<tr><td>${x.k} de ${p.n}</td><td>${fdate(x.due)}</td><td class="num">${fmt(p.cuota)}</td><td>${x.paid?chip('Pagada','ok'):x.late?chip('Vencida','bad'):chip('Pendiente','gray')}</td></tr>`).join('')}</tbody></table>
   <h3 style="margin:16px 0 6px;font-size:14px">Pagos recibidos</h3>${p.pays.length?p.pays.map((x,k)=>`<div class="r" style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0"><span>${fdate(x.t)} · ${esc(x.method)}</span><span><b>${fmt(x.amount)}</b> <button class="btn sm" data-a="payReceipt" data-p="${p.id}" data-i="${k}">Recibo</button></span></div>`).join(''):'<div style="color:var(--t3);font-size:13px">Sin pagos de cuotas todavía.</div>'}</div><div class="modal-f"><button class="btn" data-a="closeModal">Cerrar</button></div>`)};
ACT.payModal=d=>{const p=planById(d.id),i=planInfo(p),c=clientById(p.client);
  openModal(`${modalHead('Registrar pago · '+esc(c.name))}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px">Saldo pendiente: <b>${fmt(i.bal)}</b> · próxima cuota: <b>${fmt(i.nextAmt)}</b></p>
   <div class="row"><div><label>Valor recibido (COP)</label><input id="pay-a" type="number" step="1000" min="1" max="${i.bal}" value="${i.nextAmt}"></div><div><label>Método</label><select id="pay-m">${METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div></div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doPay" data-id="${p.id}">Registrar pago</button></div>`)};
ACT.doPay=d=>{if(!need('credit'))return;const p=planById(d.id),i=planInfo(p),a=Math.min(i.bal,Math.round(num('pay-a')));if(a<=0){toast('Escribe un valor válido');return}
  p.paidAmt+=a;p.pays.push({t:Date.now(),amount:a,method:val('pay-m'),by:ME.id,no:'RP-'+(1000+(DB.seq.pay=(DB.seq.pay||0)+1))});const s=saleById(p.sale),ni=planInfo(p);
  s.lines.forEach(l=>{const it=itemById(l.item);if(it)addEv(it,'Pago de cuota',fmt(a)+' · '+val('pay-m')+(ni.st==='pagado'?' · plan pagado en su totalidad':''),'ok')});
  logAct('cuotas','💰','Pago recibido de <b>'+esc(clientById(p.client).name)+'</b>: '+fmt(a)+(ni.st==='pagado'?' · plan pagado ✅':''));saveDB();paintNav();render();openPayReceipt(p.id,p.pays.length-1);toast('✅ Pago de '+fmt(a)+' registrado')};
ACT.remind=d=>{const p=planById(d.id),i=planInfo(p),c=clientById(p.client),s=saleById(p.sale),nm=c.name.split(' ')[0];
  const stage=i.st==='mora'?(i.moraDays>=10?'Etapa 4 · gestor humano':i.moraDays>=4?'Etapa 3 · llamada con IA':'Etapa 2 · aviso de mora'):'Etapa 1 · recordatorio preventivo';
  const msg=i.st==='mora'?`Hola ${nm}, tu cuota ${i.cov+1} de ${p.n} de ${s.lines[0].name} por *${fmt(i.nextAmt)}* está vencida hace ${i.moraDays} días.\nPuedes ponerte al día ahora: [enlace de pago Bold]\nSi ya pagaste, responde con tu comprobante. 🙏`
    :`Hola ${nm} 👋 Te recordamos que tu cuota ${i.cov+1} de ${p.n} de ${s.lines[0].name} por *${fmt(i.nextAmt)}* vence el *${fdate(i.next)}*.\nPaga fácil aquí: [enlace de pago Bold]`;
  waModal(c.name+' · '+stage,c.phone,msg,'cuotas')};

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
  const sales=DB.sales.filter(s=>s.client===c.id&&!saleVoid(s)),tot=sales.reduce((a,s)=>a+saleNet(s),0),plans=DB.plans.filter(p=>p.client===c.id).map(p=>({p,i:planInfo(p)}));
  const bal=plans.reduce((a,x)=>a+x.i.bal,0),mora=plans.find(x=>x.i.st==='mora'),old=sales.find(s=>Date.now()-s.t>330*DAY),hold=DB.items.find(i=>i.hold&&i.hold.client===c.id&&i.status==='Apartado');
  return{sales,tot,bal,mora,old,hold};
}
VIEWS.clientes={html(){
  const q=S.cliQ.toLowerCase(),list=DB.clients.filter(c=>!q||(c.name+' '+c.phone+' '+c.email+' '+c.doc).toLowerCase().includes(q));
  return `<div class="page-h"><div><h1>Clientes</h1><p>Historial de compras y la siguiente oportunidad de venta.</p></div>${can('clients')?'<button class="btn primary" data-a="clientForm">➕ Nuevo cliente</button>':''}</div>
  <div class="card"><div class="filters"><input id="cl-q" placeholder="Buscar por nombre, teléfono, correo o documento…" value="${esc(S.cliQ)}"></div><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th class="num">Compras</th><th class="num">Total comprado</th><th class="num">Saldo</th><th>Siguiente acción</th></tr></thead><tbody>
  ${list.map(c=>{const st=cliStats(c);const act=st.mora?chip('Cobrar cuota en mora','bad'):st.old?chip('🔁 Ofrecer recompra','pur'):st.hold?chip('Completar apartado','info'):st.sales.length?chip('Postventa en curso','gray'):chip('Sin compras','gray');
   return `<tr class="click" data-a="clientDetail" data-id="${c.id}"><td class="m">${esc(c.name)}<div class="s">${esc(c.doc||'')}</div></td><td>${esc(c.phone||'—')}<div class="s">${esc(c.email||'')}</div></td><td class="num">${st.sales.length}</td><td class="num">${fmt(st.tot)}</td><td class="num">${st.bal?fmt(st.bal):'—'}</td><td>${act}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay clientes con esa búsqueda.</td></tr>'}</tbody></table></div></div>`;
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
ACT.delClient=d=>{const c=clientById(d.id);if(DB.sales.some(s=>s.client===c.id)||DB.plans.some(p=>p.client===c.id)){toast('No se puede eliminar: el cliente tiene ventas o planes asociados');return}
  confirmBox('Eliminar cliente','¿Eliminar a <b>'+esc(c.name)+'</b>?','Eliminar',()=>{DB.clients=DB.clients.filter(x=>x.id!==c.id);saveDB();closeModal();render();toast('Cliente eliminado')},true)};
