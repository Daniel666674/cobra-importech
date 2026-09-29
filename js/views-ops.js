/* =====================================================
   VISTAS · operación: dashboard, inventario, ingreso, trade-in, taller
   ===================================================== */
const ACT={},VIEWS={};
let ALERTS=[];

/* ---------- Dashboard ---------- */
function weekly(){
  const out=[];
  for(let i=7;i>=0;i--){const to=Date.now()-i*7*DAY,from=to-7*DAY;
    out.push({l:i===0?'Últimos 7 días':i===1?'Semana pasada':'Hace '+(i+1)+' semanas',s:i===0?'Esta':i===1?'Pasada':'-'+(i+1)+' s',v:DB.sales.filter(s=>s.t>from&&s.t<=to).reduce((a,s)=>a+saleNet(s),0)/1e6})}
  return out;
}
function weekChart(){
  const W=640,H=230,pl=44,pr=8,pt=16,pb=30,ws=weekly(),max=Math.max(5,Math.ceil(Math.max(...ws.map(w=>w.v))/5)*5);
  const bw=30,step=(W-pl-pr)/ws.length;let g='';
  [0,.5,1].forEach(f=>{const y=pt+(H-pt-pb)*(1-f);g+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="#E4E8EF"/><text x="${pl-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#6F7E93">$${Math.round(max*f)}M</text>`});
  ws.forEach((w,i)=>{
    const h=(H-pt-pb)*w.v/max,x=pl+i*step+(step-bw)/2,y=H-pb-h;
    if(w.v>0)g+=`<path d="M${x},${H-pb} V${y+4} Q${x},${y} ${x+4},${y} H${x+bw-4} Q${x+bw},${y} ${x+bw},${y+4} V${H-pb} Z" fill="var(--brand)"/>`;
    g+=`<rect x="${pl+i*step}" y="${pt}" width="${step}" height="${H-pt-pb}" fill="transparent" data-tip="${w.l}: ${fmtM(w.v*1e6)}"/><text x="${x+bw/2}" y="${H-10}" text-anchor="middle" font-size="10.5" fill="#6F7E93">${w.s}</text>`;
    if(i===ws.length-1&&w.v>0)g+=`<text x="${x+bw/2}" y="${y-6}" text-anchor="middle" font-size="12" font-weight="700" fill="#0D1527">$${w.v.toFixed(1)}M</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas semanales en millones de pesos">${g}</svg>`;
}
const alertRow=(a,i)=>`<div class="alert-li" data-a="alert" data-i="${i}"><span class="n" style="color:${a.sev==='bad'?'var(--red-t)':a.sev==='warn'?'var(--amber-t)':'var(--blue-t)'}">${a.n}</span><span>${a.title}</span><span style="margin-left:auto;color:var(--t4)">›</span></div>`;
VIEWS.dashboard={html(){
  const cv=can('cost_view'),now=Date.now();
  const s30=DB.sales.filter(s=>now-s.t<=30*DAY),rev=s30.reduce((a,s)=>a+saleNet(s),0),mg=s30.reduce((a,s)=>a+saleMargin(s),0);
  const holds=DB.items.filter(i=>i.status==='Apartado'&&i.hold),holdSum=holds.reduce((a,i)=>a+holdPaid(i),0);
  const agedN=DB.items.filter(i=>inStock(i)&&daysIn(i)>DB.settings.agedDays);
  ALERTS=computeAlerts();
  const hr=new Date().getHours(),greet=hr<12?'Buenos días':hr<19?'Buenas tardes':'Buenas noches';
  const cats=CATS.map(c=>{const it=DB.items.filter(i=>i.cat===c&&inStock(i));return{c,n:it.reduce((a,i)=>a+stockQty(i),0),v:it.reduce((a,i)=>a+(cv?i.cost:i.price)*stockQty(i),0)}}),mx=Math.max(...cats.map(x=>x.v),1);
  const rec=[...DB.sales].sort((a,b)=>b.t-a.t).slice(0,5);
  return `
  <div class="page-h"><div><h1>${greet}, ${esc(ME.name.split(' ')[0])}</h1><p>Esto es lo que necesita tu atención hoy en ${esc(DB.settings.name)}.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${can('sell')?'<button class="btn primary" data-a="nav" data-v="pos">🛒 Nueva venta</button>':''}${can('inv_edit')?'<button class="btn" data-a="nav" data-v="ingreso">➕ Ingresar producto</button>':''}</div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="l">${cv?'Valor del inventario (costo)':'Valor del inventario (precio)'}</div><div class="v">${fmtM(cv?stockValue('cost'):stockValue('price'))}</div><div class="d">${DB.items.filter(inStock).reduce((a,i)=>a+stockQty(i),0)} unidades · ${DB.items.filter(inStock).length} referencias</div></div>
    <div class="card kpi"><div class="l">Ventas últimos 30 días</div><div class="v">${fmtM(rev)}</div><div class="d">${s30.length} ventas</div></div>
    <div class="card kpi">${cv?`<div class="l">Margen últimos 30 días</div><div class="v">${fmtM(mg)}</div><div class="d">${rev?Math.round(mg/rev*100):0}% sobre ventas`:`<div class="l">Apartados vigentes</div><div class="v">${holds.length}</div><div class="d">${fmtM(holdSum)} en abonos`}</div></div>
    <div class="card kpi ${agedN.length?'warn':''}"><div class="l">Más de ${DB.settings.agedDays} días en inventario</div><div class="v">${agedN.length} ref.</div><div class="d">${cv?fmtM(agedN.reduce((a,i)=>a+i.cost*stockQty(i),0))+' inmovilizados':'Requieren rebaja o promoción'}</div></div>
  </div>
  <div class="grid g21 mt">
    <div class="card"><div class="card-h"><div><h3>Ventas por semana</h3><div class="sub">Millones de pesos · últimas 8 semanas</div></div></div><div class="card-p chart">${weekChart()}</div></div>
    <div class="card"><div class="card-h"><div><h3>Requiere tu atención</h3><div class="sub">Calculado con tus datos en tiempo real</div></div></div><div class="card-p" style="padding-top:8px">
      ${ALERTS.length?ALERTS.slice(0,7).map((a,i)=>alertRow(a,i)).join(''):'<div class="empty" style="padding:20px">✅ Todo en orden</div>'}
    </div></div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><div class="card-h"><div><h3>Inventario por categoría</h3><div class="sub">${cv?'Valor a costo':'Valor a precio de venta'}</div></div></div><div class="card-p">
      ${cats.map(x=>`<div class="hbar" data-tip="${x.c}: ${x.n} unidades · ${fmtM(x.v)}"><span>${CAT_IC[x.c]} ${x.c}</span><div class="tr"><i style="width:${x.v/mx*100}%"></i></div><b>${fmtM(x.v)}</b></div>`).join('')}</div></div>
    <div class="card"><div class="card-h"><div><h3>Últimas ventas</h3></div>${can('sell')?'<button class="btn sm" data-a="nav" data-v="ventas">Ver todas</button>':''}</div>
      <div class="tbl-wrap" style="padding-top:8px"><table><thead><tr><th>Venta</th><th>Cliente</th><th class="num">Total</th></tr></thead><tbody>
      ${rec.map(s=>`<tr class="click" data-a="receipt" data-id="${s.id}"><td><div class="m">${s.no}</div><div class="s">${fdate(s.t)}</div></td><td>${esc(clientById(s.client)?.name||'Mostrador')}</td><td class="num">${fmt(saleNet(s))}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Aún no hay ventas</td></tr>'}</tbody></table></div></div>
  </div>
  <div class="card mt"><div class="card-h"><div><h3>Lo que el sistema hizo solo</h3><div class="sub">Registro de automatizaciones</div></div><button class="btn sm" data-a="nav" data-v="auto">Ver todas</button></div>
    <div class="card-p"><ul class="feed">${DB.feed.slice(0,6).map(f=>`<li><div class="fi">${f.ic}</div><div>${f.x}<time>${fdt(f.t)} · ${esc(f.by)}</time></div></li>`).join('')}</ul></div></div>`;
}};
ACT.alert=d=>{const a=ALERTS[+d.i];if(!a)return;if(a.go)Object.assign(S.inv,a.go.inv);go(a.view)};

/* ---------- Inventario ---------- */
function invRows(){
  const f=S.inv,q=f.q.toLowerCase(),aged=DB.settings.agedDays;
  return DB.items.filter(it=>{
    if(q&&!(it.name+' '+it.spec+' '+it.color+' '+it.serial+' '+it.sku+' '+it.id).toLowerCase().includes(q))return false;
    if(f.cat&&it.cat!==f.cat)return false;if(f.cond&&it.cond!==f.cond)return false;
    const st=f.st||'stock';
    if(st==='stock')return inStock(it);if(st==='all')return true;
    if(st==='age')return inStock(it)&&daysIn(it)>aged;
    if(st==='low')return isQty(it)&&it.min>0&&it.qty<=it.min;
    if(st==='lowmg')return inStock(it)&&it.price&&marginPct(it)<DB.settings.minMargin;
    return itemState(it)===st;
  }).sort((a,b)=>b.acq-a.acq);
}
function invTable(){
  const r=invRows(),cv=can('cost_view');
  if(!r.length)return '<div class="empty">Ningún producto coincide con los filtros.</div>';
  const tq=r.reduce((a,i)=>a+stockQty(i),0),tc=r.reduce((a,i)=>a+i.cost*stockQty(i),0),tp=r.reduce((a,i)=>a+i.price*stockQty(i),0);
  return `<div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Serial / SKU</th><th>Condición</th><th class="num">Stock</th><th>Estado</th><th class="num">Días</th>${cv?'<th class="num">Costo</th>':''}<th class="num">Precio</th>${cv?'<th class="num">Margen</th>':''}<th class="num">Garantía</th></tr></thead><tbody>
  ${r.map(it=>{const mg=marginPct(it),stt=itemState(it);return `<tr class="click" data-a="item" data-id="${it.id}">
   <td><div class="m">${CAT_IC[it.cat]} ${esc(it.name)}</div><div class="s">${esc([it.spec,it.color].filter(Boolean).join(' · '))}</div></td>
   <td class="mono">${it.serial?'•••'+esc(it.serial.slice(-6)):esc(it.sku)}</td><td>${condChip(it.cond)}</td>
   <td class="num">${isQty(it)?`<b style="${it.min&&it.qty<=it.min?'color:var(--red-t)':''}">${it.qty}</b>`:stockQty(it)}</td><td>${chip(stt,stChip(stt))}</td>
   <td class="num">${inStock(it)?(daysIn(it)>DB.settings.agedDays+15?chip('⏳ '+daysIn(it)+' d','bad'):daysIn(it)>DB.settings.agedDays?chip('⏳ '+daysIn(it)+' d','warn'):`<span style="color:var(--t3)">${daysIn(it)} d</span>`):'—'}</td>
   ${cv?`<td class="num">${fmt(it.cost+(it.repairs||0))}</td>`:''}<td class="num">${fmt(it.price)}</td>${cv?`<td class="num" style="font-weight:600;color:${mg<DB.settings.minMargin?'var(--amber-t)':'var(--green-t)'}">${mg}%</td>`:''}<td class="num">${it.warr} m</td></tr>`}).join('')}
  </tbody></table></div>
  <div style="padding:12px 16px;font-size:13px;color:var(--t2);border-top:1px solid var(--border);display:flex;gap:18px;flex-wrap:wrap"><span><b>${r.length}</b> referencias</span><span><b>${tq}</b> unidades</span>${cv?`<span>Valor a costo <b>${fmt(tc)}</b></span>`:''}<span>Valor a precio <b>${fmt(tp)}</b></span></div>`;
}
VIEWS.inventario={html(){
  const f=S.inv,sts=[['stock','En stock'],['all','Todos (incluye vendidos)'],['age','⏳ Envejecidos'],['low','📉 Stock bajo'],['lowmg','💸 Bajo margen mínimo'],...STATUSES.map(s=>[s,s])];
  return `<div class="page-h"><div><h1>Inventario</h1><p>Todos tus productos con costo, precio, garantía e historia. Toca una fila para ver el detalle.</p></div>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-a="exportInv">⬇️ Exportar CSV</button>${can('inv_edit')?'<button class="btn primary" data-a="nav" data-v="ingreso">➕ Ingresar producto</button>':''}</div></div>
  <div class="card"><div class="cats"><button class="cat ${!f.cat?'on':''}" data-a="invCat" data-c="">Todo</button>${CATS.map(c=>`<button class="cat ${f.cat===c?'on':''}" data-a="invCat" data-c="${c}">${CAT_IC[c]} ${c}</button>`).join('')}</div>
  <div class="filters"><input id="f-q" placeholder="Buscar por nombre, serial/IMEI, SKU o color…" value="${esc(f.q)}">
    <select id="f-cd"><option value="">Toda condición</option>${CONDS.map(c=>`<option ${f.cond===c?'selected':''}>${c}</option>`).join('')}</select>
    <select id="f-st">${sts.map(([v,l])=>`<option value="${v}" ${(f.st||'stock')===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <div id="inv-t">${invTable()}</div></div>`;
}};
ACT.invCat=d=>{S.inv.cat=d.c;render()};
ACT.exportInv=()=>{const cv=can('cost_view');downloadCSV('inventario-'+new Date().toISOString().slice(0,10)+'.csv',
  [['ID','SKU','Categoría','Producto','Especificación','Color','Condición','Serial/IMEI','Cantidad','Estado','Días en inventario',...(cv?['Costo']:[]),'Precio','Garantía (meses)'],
   ...invRows().map(i=>[i.id,i.sku,i.cat,i.name,i.spec,i.color,i.cond,i.serial,stockQty(i),itemState(i),daysIn(i),...(cv?[i.cost]:[]),i.price,i.warr])]);toast('Inventario exportado')};

/* ---------- Ficha del producto ---------- */
function openItem(id){
  const it=itemById(id);if(!it)return;
  const cv=can('cost_view'),tl=[...it.tl].sort((a,b)=>b.t-a.t),stt=itemState(it),sold=it.status==='Vendido';
  const cli=it.hold?clientById(it.hold.client):null;
  $('#drawer').innerHTML=`
  <div class="drawer-h"><div><h2>${CAT_IC[it.cat]} ${esc(it.name)}</h2><div style="color:var(--t3);font-size:13px">${esc([it.spec,it.color].filter(Boolean).join(' · '))}</div></div><button class="x" data-a="closeDrawer" aria-label="Cerrar">×</button></div>
  <div class="drawer-b">
   <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${chip(stt,stChip(stt))}${condChip(it.cond)}${inStock(it)?chip('⏳ '+daysIn(it)+' días en inventario',daysIn(it)>DB.settings.agedDays+15?'bad':daysIn(it)>DB.settings.agedDays?'warn':'gray'):''}</div>
   <div class="note" style="margin-top:10px">${COND_INFO[it.cond]}</div>
   <div class="kv">
     <div><span>${it.serial&&it.cat==='iPhone'?'IMEI':'Serial'}</span><b class="mono">${it.serial?esc(it.serial):'—'}</b></div><div><span>SKU · ID</span><b>${it.sku} · ${it.id}</b></div>
     <div><span>Stock</span><b>${isQty(it)?it.qty+' unidades':stockQty(it)+' unidad'}</b></div><div><span>Garantía</span><b>${it.warr} meses</b></div>
     ${it.batt?`<div><span>Batería / salud</span><b>${it.batt}%</b></div>`:''}<div><span>Origen</span><b>${esc(it.src||'—')}</b></div>
     ${isQty(it)&&it.min?`<div><span>Stock mínimo</span><b>${it.min}</b></div>`:''}</div>
   ${it.notes?`<div class="note">📝 ${esc(it.notes)}</div>`:''}
   ${it.hold?`<div class="note" style="background:var(--blue-bg);color:var(--blue-t)">🔒 Apartado por <b>${esc(cli?cli.name:'—')}</b> · abono ${fmt(it.hold.abono)} · vence ${fdate(it.hold.expires)}</div>`:''}
   <div class="cost">
     ${cv?`<div class="r"><span>Costo de compra / importación</span><span>${fmt(it.cost)}</span></div><div class="r"><span>Reparaciones</span><span>${fmt(it.repairs||0)}</span></div>`:''}
     <div class="r"><span>Precio al cliente</span><span>${fmt(it.price)}</span></div>
     ${cv?`<div class="r t"><span>Margen real</span><span style="color:${margin(it)>0?'var(--green-t)':'var(--red-t)'}">${fmt(margin(it))} · ${marginPct(it)}%</span></div>`:''}</div>
   <div class="acts">
    ${can('sell')&&isAvail(it)?`<button class="btn primary" data-a="sellItem" data-id="${it.id}">🛒 Vender</button>`:''}
    ${can('sell')&&it.status==='Apartado'?`<button class="btn primary" data-a="finishHold" data-id="${it.id}">✅ Completar venta</button><button class="btn" data-a="releaseHold" data-id="${it.id}">Liberar apartado</button>`:''}
    ${can('inv_edit')&&!sold?`<button class="btn" data-a="editItem" data-id="${it.id}">✏️ Editar</button>`:''}
    ${can('inv_edit')&&isQty(it)?`<button class="btn" data-a="adjust" data-id="${it.id}">± Ajustar stock</button>`:''}
    ${can('workshop')&&!isQty(it)&&['En vitrina','En revisión'].includes(it.status)?`<button class="btn" data-a="toWorkshop" data-id="${it.id}">🔧 Enviar a taller</button>`:''}
    ${!isQty(it)&&it.cat==='iPhone'&&!sold?`<button class="btn" data-a="reverify" data-id="${it.id}">🛡️ Re-verificar IMEI</button>`:''}
    ${can('inv_delete')?`<button class="btn danger" data-a="delItem" data-id="${it.id}">🗑️ Eliminar</button>`:''}
   </div>
   <h3 style="margin:24px 0 8px;font-size:14.5px">Historial del producto</h3>
   <ol class="tl">${tl.map(e=>`<li class="${e.tone}"><time>${fdt(e.t)}${e.by?' · '+esc(e.by):''}</time><b>${esc(e.title)}</b>${e.detail?`<br><span>${esc(e.detail)}</span>`:''}</li>`).join('')}</ol>
   <div class="note">Cada movimiento queda registrado con fecha y usuario.</div>
  </div>`;
  $('#drawer').classList.add('on');$('#scrim').classList.add('on');
}
ACT.item=d=>{closeModal();openItem(d.id)};
ACT.sellItem=d=>{closeDrawer();posStart(d.id)};
ACT.finishHold=d=>{closeDrawer();posStart(d.id,true)};
ACT.reverify=d=>{const it=itemById(d.id),r=verifyImei(it.serial,it.id);addEv(it,'Re-verificación de IMEI',r.verdict==='clean'?'Sin cambios: limpio en base negativa, iCloud y operador':r.steps.filter(s=>s.s!=='ok').map(s=>s.d).join(' | '),r.verdict==='clean'?'ok':'bad');saveDB();openItem(it.id);toast(r.verdict==='clean'?'✅ IMEI sigue limpio (simulado)':'⚠️ Se encontraron novedades')};
ACT.delItem=d=>{if(!need('inv_delete'))return;const it=itemById(d.id);
  if(DB.sales.some(s=>s.lines.some(l=>l.item===it.id))){toast('No se puede eliminar: tiene ventas asociadas. Ponle stock 0 si ya no lo vendes.');return}
  confirmBox('Eliminar producto','Vas a eliminar <b>'+esc(uname(it))+'</b> ('+it.id+'). Esta acción no se puede deshacer.','Eliminar',()=>{
    DB.items=DB.items.filter(x=>x.id!==it.id);DB.orders=DB.orders.filter(o=>o.item!==it.id);logAct('owner','🗑️','Producto eliminado: <b>'+esc(uname(it))+'</b> por '+esc(ME.name));saveDB();closeAll();render();paintNav();toast('Producto eliminado')},true)};
ACT.adjust=d=>{const it=itemById(d.id);openModal(`${modalHead('Ajustar stock · '+esc(it.name))}<div class="modal-b f"><p style="font-size:13px;color:var(--t2);margin-bottom:10px">Stock actual: <b>${it.qty}</b> unidades en ${esc(it.branch)}.</p>
  <div class="row"><div><label>Nuevo stock</label><input id="adj-q" type="number" min="0" value="${it.qty}"></div><div><label>Motivo</label><select id="adj-r"><option>Conteo físico</option><option>Merma o daño</option><option>Devolución a proveedor</option><option>Corrección de ingreso</option></select></div></div></div>
  <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="doAdjust" data-id="${it.id}">Guardar</button></div>`)};
ACT.doAdjust=d=>{const it=itemById(d.id),q=Math.max(0,Math.round(num('adj-q')));const old=it.qty;it.qty=q;addEv(it,'Ajuste de stock',old+' → '+q+' · '+$('#adj-r').value,q<old?'warn':'ok');
  if(q<old)logAct('owner','🚨','Ajuste de stock <b>'+esc(it.name)+'</b>: '+old+' → '+q+' ('+esc($('#adj-r').value)+')');saveDB();closeModal();openItem(it.id);render();toast('Stock actualizado')};
ACT.toWorkshop=d=>{closeDrawer();workshopModal(d.id)};
/* ---------- Formulario de producto (crear/editar) ---------- */
const SRCS=['Importación','Trade-in','Consignación','Compra directa','Proveedor local'];
function itemForm(it,cat){
  const c=it?it.cat:cat,q=c==='AirPods'||c==='Accesorios',ph=['iPhone','iPad','Mac','Apple Watch'].includes(c);
  const names=CATALOG.filter(x=>x.cat===c);
  const v=it||{name:'',spec:'',color:'',cond:'Nuevo',serial:'',qty:1,cost:0,price:0,warr:DB.settings.warr.Nuevo,branch:DB.settings.branches[0],src:'Importación',batt:ph?100:'',notes:'',min:q?3:0};
  return `<div class="f"><datalist id="dl-names">${names.map(n=>`<option value="${esc(n.name)}">`).join('')}</datalist>
   <div class="row"><div style="grid-column:span 2"><label>Producto *</label><input id="i-name" list="dl-names" value="${esc(v.name)}" placeholder="${c==='Accesorios'?'Ej. Cargador MagSafe 15 W':'Ej. '+(names[0]?names[0].name:'Modelo')}"></div>
     <div><label>${c==='iPhone'?'Capacidad':'Detalle / capacidad'}</label><input id="i-spec" value="${esc(v.spec)}" placeholder="${c==='iPhone'?'256 GB':'Opcional'}"></div></div>
   <div class="row"><div><label>Color</label><input id="i-color" value="${esc(v.color)}" placeholder="Ej. Titanio negro"></div>
     <div><label>Condición *</label><select id="i-cond">${CONDS.map(x=>`<option ${v.cond===x?'selected':''}>${x}</option>`).join('')}</select></div>
     ${ph?`<div><label>Batería / salud %</label><input id="i-batt" type="number" min="1" max="100" value="${v.batt||''}"></div>`:''}</div>
   <div class="row">${!q?`<div style="grid-column:span 2"><label>${c==='iPhone'?'IMEI':'Número de serie'} *</label><input id="i-serial" class="mono" value="${esc(v.serial)}" ${it&&c==='iPhone'?'':''} placeholder="${c==='iPhone'?'15 dígitos':'Serial del equipo'}"></div>`
       :`<div><label>Cantidad *</label><input id="i-qty" type="number" min="0" value="${v.qty}"></div><div><label>Stock mínimo (alerta)</label><input id="i-min" type="number" min="0" value="${v.min||0}"></div>`}
</div>
   <div class="row">${can('cost_view')?`<div><label>Costo real (COP) *</label><input id="i-cost" type="number" step="1000" min="0" value="${v.cost||''}"></div>`:''}
     <div><label>Precio al cliente (COP) *</label><input id="i-price" type="number" step="1000" min="0" value="${v.price||''}"></div>
     <div><label>Garantía (meses)</label><input id="i-warr" type="number" min="0" max="36" value="${v.warr}"></div></div>
   <div class="row"><div><label>Origen</label><select id="i-src">${SRCS.map(x=>`<option ${(v.src||'').startsWith(x)?'selected':''}>${x}</option>`).join('')}</select></div>
     <div style="grid-column:span 2"><label>Notas</label><input id="i-notes" value="${esc(v.notes)}" placeholder="Opcional"></div></div>
   <div id="i-mg" style="font-size:13px;color:var(--t2);margin:2px 0 10px"></div></div>`;
}
function itemMgHint(){const c=num('i-cost'),p=num('i-price');const e=$('#i-mg');if(!e||!p||!$('#i-cost')){if(e)e.innerHTML='';return}const mg=Math.round((p-c)/p*100);
  e.innerHTML='Margen estimado: <b style="color:'+(mg<DB.settings.minMargin?'var(--amber-t)':'var(--green-t)')+'">'+fmt(p-c)+' · '+mg+'%</b>'+(mg<DB.settings.minMargin?' · por debajo del mínimo ('+DB.settings.minMargin+'%)':'')}
function itemAutofill(force){
  const n=val('i-name'),sp=val('i-spec'),cd=val('i-cond');if(!$('#i-price'))return;
  if(force||!$('#i-price').dataset.touched){const p=listPrice(n,sp,cd);if(p)$('#i-price').value=p}
  if($('#i-cost')&&(force||!$('#i-cost').dataset.touched)&&num('i-price'))$('#i-cost').value=Math.round(num('i-price')*(cd==='Nuevo'?.83:cd==='Exhibición'?.86:cd==='Reacondicionado'?.8:.77)/10000)*10000;
  if(!$('#i-warr').dataset.touched)$('#i-warr').value=DB.settings.warr[cd]??12;
  itemMgHint();
}
function readItemForm(it,cat){
  const c=it?it.cat:cat,q=c==='AirPods'||c==='Accesorios';
  const o={name:val('i-name'),spec:val('i-spec'),color:val('i-color'),cond:val('i-cond'),cost:can('cost_view')?num('i-cost'):(it?it.cost:0),price:num('i-price'),warr:Math.max(0,Math.round(num('i-warr'))),src:val('i-src'),notes:val('i-notes')};
  if(!o.name)return{err:'Escribe el nombre del producto',f:'i-name'};
  if(!o.price)return{err:'Escribe el precio al cliente',f:'i-price'};
  if(can('cost_view')&&!o.cost&&!it)return{err:'Escribe el costo real',f:'i-cost'};
  if(o.cost&&o.cost>o.price*1.5)return{err:'El costo es mucho mayor que el precio. Revisa los valores.',f:'i-cost'};
  if(q){o.qty=Math.max(0,Math.round(num('i-qty')));o.min=Math.max(0,Math.round(num('i-min')))}
  else{o.serial=val('i-serial').replace(/\s/g,'').toUpperCase();if(!o.serial)return{err:'Escribe el '+(c==='iPhone'?'IMEI':'número de serie'),f:'i-serial'};
    if(DB.items.some(x=>x.serial===o.serial&&(!it||x.id!==it.id)))return{err:'Ese '+(c==='iPhone'?'IMEI':'serial')+' ya está registrado en el inventario',f:'i-serial'};
    if($('#i-batt'))o.batt=Math.max(0,Math.min(100,Math.round(num('i-batt'))))||null}
  return{o};
}
ACT.editItem=d=>{if(!need('inv_edit'))return;const it=itemById(d.id);closeDrawer();
  openModal(`${modalHead('Editar · '+esc(uname(it)))}<div class="modal-b">${itemForm(it)}</div><div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="saveEdit" data-id="${it.id}">Guardar cambios</button></div>`,true);['i-cost','i-price','i-warr'].forEach(id=>{const e=$('#'+id);if(e)e.dataset.touched=1});itemMgHint()};
ACT.saveEdit=d=>{const it=itemById(d.id),r=readItemForm(it);if(r.err){toast(r.err);$('#'+r.f)&&$('#'+r.f).focus();return}
  const ch=[];['cost','price','warr','cond'].forEach(k=>{if(it[k]!==r.o[k])ch.push(k+': '+it[k]+' → '+r.o[k])});
  const priceOld=it.price;Object.assign(it,r.o);
  addEv(it,'Producto editado',ch.join(' · ')||'Sin cambios relevantes',ch.length?'warn':'');
  if(priceOld!==it.price)logAct('reprice','🏷️','Precio de <b>'+esc(uname(it))+'</b>: '+fmt(priceOld)+' → '+fmt(it.price)+' por '+esc(ME.name));
  saveDB();closeModal();render();paintNav();toast('✅ Cambios guardados')};

/* ---------- Ingresar producto ---------- */
VIEWS.ingreso={html(){
  const cat=S.addCat||'iPhone';
  return `<div class="page-h"><div><h1>Ingresar producto</h1><p>Registra equipos y accesorios. Para iPhone, el IMEI se verifica automáticamente antes de guardar.</p></div></div>
  <div class="card"><div class="cats">${CATS.map(c=>`<button class="cat ${cat===c?'on':''}" data-a="addCat" data-c="${c}">${CAT_IC[c]} ${c}</button>`).join('')}</div>
  <div class="card-p">${cat==='iPhone'?`<div class="grid g21"><div class="f"><label>IMEI del equipo (15 dígitos)</label>
     <div style="display:flex;gap:8px"><input class="imei-in" id="imei" inputmode="numeric" maxlength="15" placeholder="000000000000000" autocomplete="off"><button class="btn primary" data-a="verify" style="height:46px">Verificar</button><button class="btn" data-a="scanAdd" style="height:46px" title="Leer IMEI, serial y modelo con la cámara">📷 Escanear</button></div>
     <div class="tests"><span style="font-size:12px;color:var(--t3);align-self:center">Probar con:</span>
      <button class="btn sm" data-a="fill" data-k="clean">✅ Limpio</button><button class="btn sm" data-a="fill" data-k="hurto">⛔ Hurtado</button><button class="btn sm" data-a="fill" data-k="extravio">⛔ Extraviado</button><button class="btn sm" data-a="fill" data-k="icloud">⚠️ iCloud activo</button><button class="btn sm" data-a="fill" data-k="operador">⚠️ Operador</button><button class="btn sm" data-a="fill" data-k="dup">♻️ Duplicado</button><button class="btn sm" data-a="fill" data-k="bad">✕ Inválido</button></div>
     <div id="vpanel"></div>
     <div class="note">Demo: los resultados de hurto, iCloud y operador están <b>simulados</b> con los IMEI de prueba de arriba. En el sistema real se consulta la base negativa oficial y un servicio de verificación de bloqueo.</div></div>
    <div class="card card-p" style="box-shadow:none;background:var(--ws-bg)"><h3>Qué se verifica</h3><ol style="margin:10px 0 0 18px;font-size:13px;color:var(--t2);display:flex;flex-direction:column;gap:7px"><li>Validación matemática del IMEI.</li><li>Modelo real según el TAC.</li><li>Que no esté ya en tu inventario.</li><li>Base negativa de hurto y extravío.</li><li>Bloqueo de iCloud y de operador.</li><li><b>Si está reportado no se puede guardar</b> y el dueño recibe una alerta.</li></ol></div></div>`
   :`<div class="scan-banner"><div>📷 <b>Llena el formulario con la cámara</b><span>Lee el serial de la caja y, en la pantalla “Información”, el modelo, capacidad y batería.</span></div><button class="btn primary" data-a="scanAdd">Escanear</button></div><h3 style="margin-bottom:12px">Nuevo ${c(cat)}</h3>${itemForm(null,cat)}<button class="btn primary" data-a="saveNew">Guardar en inventario</button>`}</div></div>`;
  function c(x){return x==='Accesorios'?'accesorio':x==='AirPods'?'AirPods':x==='Apple Watch'?'Apple Watch':x}
},after(){S.v=null;const i=$('#imei');if(i){i.addEventListener('input',()=>{i.value=i.value.replace(/\D/g,'').slice(0,15)});i.addEventListener('keydown',e=>{if(e.key==='Enter')doVerify()})}else itemMgHint()}};
ACT.addCat=d=>{S.addCat=d.c;render()};
ACT.fill=d=>{const v=d.k==='dup'?(DB.items.find(i=>i.cat==='iPhone'&&i.serial)||{serial:''}).serial:d.k==='bad'?'354000000000123':TEST_IMEI[d.k];$('#imei').value=v;doVerify()};
ACT.verify=()=>doVerify();
ACT.saveNew=()=>{if(!need('inv_edit'))return;const cat=S.addCat||'iPhone',r=readItemForm(null,cat);if(r.err){toast(r.err);$('#'+r.f)&&$('#'+r.f).focus();return}createItem(cat,r.o)};
function createItem(cat,o,extra){
  const n=(DB.seq.item=(DB.seq.item||0)+1);
  const it=Object.assign({id:'I-'+String(n).padStart(4,'0'),sku:CAT_SKU[cat]+'-'+String(n).padStart(4,'0'),cat,name:'',spec:'',color:'',cond:'Nuevo',serial:'',qty:1,cost:0,price:0,warr:12,branch:DB.settings.branches[0],
    status:'En vitrina',acq:Date.now(),src:'Importación',batt:null,notes:'',repairs:0,min:0,tl:[],hold:null},o);
  it.track=(cat==='AirPods'||cat==='Accesorios')?'qty':'unit';
  addEv(it,it.src==='Trade-in'?'Trade-in recibido':'Ingreso al inventario',it.src+(it.track==='qty'?' · '+it.qty+' unidades':''));
  if(extra&&extra.verify)addEv(it,'Verificación de IMEI',extra.verify.verdict==='clean'?'Base negativa: limpio · iCloud: libre · Operador: libre':'Advertencia aprobada por el propietario/a: '+extra.verify.steps.filter(s=>s.s==='warn').map(s=>s.d).join(' | '),extra.verify.verdict==='clean'?'ok':'warn');
  addEv(it,'En vitrina',it.branch);
  DB.items.unshift(it);logAct('owner','📦','Nuevo ingreso: <b>'+esc(uname(it))+'</b>'+(it.track==='qty'?' ×'+it.qty:'')+' por '+esc(ME.name));
  saveDB();paintNav();toast('✅ '+esc(uname(it))+' guardado en inventario');S.inv={q:'',cat:'',cond:'',br:'',st:'stock'};go('inventario');setTimeout(()=>openItem(it.id),250);
  return it;
}
let vTimer=null;
function doVerify(){
  const imei=($('#imei').value||'').replace(/\D/g,'');
  if(!imei){toast('Escribe o escanea un IMEI primero');return}
  const res=verifyImei(imei);S.v={imei,res,shown:0,done:false};
  clearInterval(vTimer);paintVerify();
  vTimer=setInterval(()=>{if(!S.v||!$('#vpanel')){clearInterval(vTimer);return}S.v.shown++;paintVerify();
    if(S.v.shown>=res.steps.length){clearInterval(vTimer);S.v.done=true;paintVerify();
      if(res.reason==='neg'){logAct('owner','🚨','Alerta al dueño: intento de ingresar IMEI <b>••'+imei.slice(-6)+'</b> con reporte de hurto/extravío · '+esc(ME.name));saveDB();toast('🚨 Alerta enviada al dueño por WhatsApp')}
      if(res.reason==='dup'){logAct('owner','🚨','Alerta al dueño: <b>IMEI duplicado</b> ••'+imei.slice(-6));saveDB()}}},480);
}
const STEP_ICON={ok:'✓',warn:'!',fail:'✕',skip:'–'};
function paintVerify(){
  const el=$('#vpanel');if(!el||!S.v)return;
  const {res,shown,done}=S.v;
  const rows=res.steps.map((s,i)=>i<shown?`<div class="step ${s.s}"><div class="ico">${STEP_ICON[s.s]}</div><div><div class="t">${s.l}</div><div class="d">${esc(s.d)}</div></div></div>`
    :i===shown&&!done?`<div class="step"><div class="ico"><div class="spin"></div></div><div><div class="t">${s.l}</div><div class="d">Consultando…</div></div></div>`
    :`<div class="step skip"><div class="ico">·</div><div><div class="t">${s.l}</div></div></div>`).join('');
  let out=`<h3 style="margin:22px 0 6px;font-size:14px">Verificación <span class="mono" style="color:var(--t3)">${S.v.imei}</span></h3><div class="steps">${rows}</div>`;
  if(done){
    const v=res.verdict,msg={clean:['✅','Equipo limpio','Puedes ingresarlo al inventario.'],review:['⚠️','Requiere revisión','Solo se puede ingresar con aprobación del propietario/a y queda anotado en el historial.'],
     blocked:['⛔',res.reason==='invalid'?'IMEI inválido':res.reason==='dup'?'Equipo duplicado':'Ingreso bloqueado',res.reason==='invalid'?'Revisa el número y vuelve a intentar.':res.reason==='dup'?'Este IMEI ya está en tu inventario.':'Este equipo está reportado. No lo compres ni lo ingreses. El dueño ya fue alertado.']}[v];
    out+=`<div class="verdict ${v}"><div class="big">${msg[0]}</div><div><b>${msg[1]}</b><div style="font-size:13px;margin-top:2px">${msg[2]}</div>${res.reason==='dup'&&res.existing?`<button class="btn sm" style="margin-top:8px" data-a="item" data-id="${res.existing.id}">Ver equipo existente</button>`:''}</div></div>`;
    if(res.reason==='neg')out+=`<div class="wa-box" style="margin-top:12px"><div style="font-size:11.5px;color:#6b6b6b">Alerta enviada al dueño · WhatsApp</div><div class="wa">🚨 *Alerta ${esc(DB.settings.name)}*
Se intentó ingresar un IMEI reportado.
IMEI: ••••${S.v.imei.slice(-6)}
Motivo: ${esc(REG[S.v.imei].neg)}
Usuario: ${esc(ME.name)}
El equipo NO fue ingresado.<small>${ftime(Date.now())}</small></div></div>`;
    if(v!=='blocked')out+=`<div style="margin-top:20px;border-top:1px solid var(--border);padding-top:18px"><h3 style="font-size:14px;margin-bottom:12px">Datos del equipo</h3>${itemForm({name:res.model?res.model.name:'',spec:'256 GB',color:'',cond:'Nuevo',serial:S.v.imei,qty:1,cost:0,price:0,warr:DB.settings.warr.Nuevo,branch:DB.settings.branches[0],src:'Importación',batt:100,notes:'',min:0,cat:'iPhone'})}
      ${v==='review'?`<label class="chk"><input type="checkbox" id="i-ok"> <span><b>Aprobación del propietario/a:</b> autorizo ingresar este equipo pese a la advertencia.</span></label>`:''}
      <button class="btn primary" data-a="saveVerified" ${v==='review'?'id="i-save" disabled':''}>Guardar en inventario</button></div>`;
  }
  el.innerHTML=out;
  if(done&&res.verdict!=='blocked'){const sr=$('#i-serial');if(sr){sr.value=S.v.imei;sr.readOnly=true}itemAutofill(true);applyScanFill()}
}
ACT.saveVerified=()=>{if(!need('inv_edit'))return;const r=readItemForm(null,'iPhone');if(r.err){toast(r.err);$('#'+r.f)&&$('#'+r.f).focus();return}
  if(S.v.res.verdict==='review'&&!$('#i-ok').checked)return;r.o.serial=S.v.imei;createItem('iPhone',r.o,{verify:S.v.res})};

/* ---------- Trade-in ---------- */
function tiInit(){if(!S.ti)S.ti={model:'iPhone 15 Pro',gb:256,batt:88,scr:0,body:1,fid:true,cam:true,btn:true,icl:true,imei:'',cli:''}}
function tradeQuote(){
  const T=S.ti,m=CAT_BY_NAME[T.model],base=Math.round((m.retail*.72+(STOR[T.gb]||0)*.6)/10000)*10000;
  const d=[];let f=1;const add=(l,p)=>{if(p){f-=p;d.push([l,p])}};
  add('Batería '+T.batt+'%',T.batt>=90?0:T.batt>=85?.04:T.batt>=80?.08:.15);
  add(['Pantalla perfecta','Rayones leves en pantalla','Pantalla rota'][T.scr],[0,.05,.25][T.scr]);
  add(['Carcasa sin marcas','Marcas leves en carcasa','Golpes en carcasa'][T.body],[0,.03,.10][T.body]);
  add('Face ID no funciona',T.fid?0:.20);add('Cámaras con falla',T.cam?0:.10);add('Botones con falla',T.btn?0:.05);
  const q=Math.round(base*f/10000)*10000,v=T.imei.length===15?verifyImei(T.imei):null,cond=(1-f)<.08?'Pre-owned':'Usado';
  const resale=listPrice(T.model,T.gb+' GB',cond);let block=null;
  if(!v)block='Ingresa el IMEI para poder cotizar.';else if(v.verdict==='blocked')block=v.reason==='invalid'?'IMEI inválido.':v.reason==='dup'?'Este IMEI ya está en tu inventario.':'⛔ IMEI reportado como hurtado o extraviado. NO comprar.';
  else if(!T.icl)block='El cliente debe cerrar sesión de su Apple ID (iCloud) antes de vender el equipo.';
  else if(REG[T.imei]&&REG[T.imei].icloud)block='Activation Lock activo: el cliente debe desactivar Buscar mi iPhone.';
  return{q,d,base,resale,block,v,cond};
}
function tiOut(){
  const q=tradeQuote(),v=q.v;
  return `<h3>Cotización</h3>${v?`<div style="margin-top:8px">${chip(v.verdict==='clean'?'✅ IMEI limpio':v.verdict==='review'?'⚠️ IMEI con advertencia':'⛔ IMEI bloqueado',v.verdict==='clean'?'ok':v.verdict==='review'?'warn':'bad')}</div>`:''}
  ${q.block?`<div class="verdict blocked" style="margin-top:14px"><div class="big">⛔</div><div><b>No se puede comprar</b><div style="font-size:13px">${q.block}</div></div></div>`:
  `<div style="font-size:38px;font-weight:800;letter-spacing:-1px;margin:14px 0 2px;color:var(--brand)">${fmt(q.q)}</div><div style="color:var(--t3);font-size:13px">Oferta al cliente · valor base ${fmt(q.base)}</div>
   <div class="cost"><div style="font-size:12px;font-weight:700;color:var(--t3);margin-bottom:4px;text-transform:uppercase">Descuentos aplicados</div>
   ${q.d.length?q.d.map(([l,p])=>`<div class="r"><span>${l}</span><span style="color:var(--red-t)">−${Math.round(p*100)}%</span></div>`).join(''):'<div class="r"><span>Equipo en excelente estado</span><span style="color:var(--green-t)">Sin descuentos</span></div>'}
   <div class="r t"><span>Precio de reventa estimado (${q.cond})</span><span>${fmt(q.resale)}</span></div><div class="r"><span>Margen estimado</span><span style="color:var(--green-t)">${fmt(q.resale-q.q)} · ${Math.round((q.resale-q.q)/q.resale*100)}%</span></div></div>
   <div class="f" style="margin-bottom:10px"><label>Cliente que entrega el equipo (opcional)</label><select id="ti-cli"><option value="">— Sin registrar —</option>${DB.clients.map(c=>`<option value="${c.id}" ${S.ti.cli===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
   <button class="btn primary" data-a="acceptTi">Aceptar y registrar equipo</button>`}
  <div class="note">La oferta se calcula sola con una tabla de descuentos por estado. El equipo entra como “En revisión” con su historial.</div>`;
}
VIEWS.tradein={html(){
  tiInit();const T=S.ti;
  const sel=(id,opts,v)=>`<select id="${id}">${opts.map(([x,l])=>`<option value="${x}" ${String(x)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
  return `<div class="page-h"><div><h1>Trade-in</h1><p>Recibe el iPhone del cliente, revísalo con la lista de chequeo y obtén una cotización automática.</p></div></div>
  <div class="grid g2"><div class="card card-p f"><h3 style="margin-bottom:12px">Revisión del equipo</h3>
   <div class="row"><div><label>Modelo</label>${sel('ti-model',CATALOG.filter(c=>c.cat==='iPhone').map(m=>[m.name,m.name]),T.model)}</div><div><label>Capacidad</label>${sel('ti-gb',[[128,'128 GB'],[256,'256 GB'],[512,'512 GB'],[1024,'1 TB']],T.gb)}</div></div>
   <div class="row"><div><label>IMEI</label><input id="ti-imei" class="mono" inputmode="numeric" maxlength="15" placeholder="15 dígitos" value="${T.imei}"></div><div><label>Batería (%)</label><input id="ti-batt" type="number" min="50" max="100" value="${T.batt}"></div></div>
   <div class="tests" style="margin:-4px 0 12px"><span style="font-size:12px;color:var(--t3);align-self:center">Probar IMEI:</span><button class="btn sm" data-a="tiFill" data-k="clean">✅ Limpio</button><button class="btn sm" data-a="tiFill" data-k="hurto">⛔ Hurtado</button><button class="btn sm" data-a="tiFill" data-k="icloud">⚠️ iCloud</button><button class="btn sm primary" data-a="scanTi">📷 Escanear</button></div>
   <div class="row"><div><label>Pantalla</label>${sel('ti-scr',[[0,'Perfecta'],[1,'Rayones leves'],[2,'Rota']],T.scr)}</div><div><label>Carcasa</label>${sel('ti-body',[[0,'Sin marcas'],[1,'Marcas leves'],[2,'Golpes']],T.body)}</div></div>
   <label class="chk"><input type="checkbox" id="ti-fid" ${T.fid?'checked':''}> Face ID funciona</label><label class="chk"><input type="checkbox" id="ti-cam" ${T.cam?'checked':''}> Cámaras funcionan</label>
   <label class="chk"><input type="checkbox" id="ti-btn" ${T.btn?'checked':''}> Botones y puertos funcionan</label><label class="chk"><input type="checkbox" id="ti-icl" ${T.icl?'checked':''}> <b>El cliente cerró sesión de iCloud frente a mí</b></label></div>
   <div class="card card-p" id="ti-out">${tiOut()}</div></div>`;
}};
ACT.tiFill=d=>{S.ti.imei=TEST_IMEI[d.k];$('#ti-imei').value=S.ti.imei;$('#ti-out').innerHTML=tiOut()};
ACT.acceptTi=()=>{if(!need('tradein'))return;const q=tradeQuote();if(q.block)return;const T=S.ti,cl=$('#ti-cli')?$('#ti-cli').value:'';
  const it=createItemQuiet('iPhone',{name:T.model,spec:T.gb>=1024?'1 TB':T.gb+' GB',color:'Por definir',cond:q.cond,serial:T.imei,cost:q.q,price:q.resale,warr:DB.settings.warr[q.cond],branch:DB.settings.branches[0],
    status:'En revisión',src:'Trade-in',batt:T.batt,notes:cl?'Recibido de '+clientById(cl).name:''});
  addEv(it,'IMEI verificado','Base negativa: limpio · cliente cerró iCloud frente al empleado','ok');
  addEv(it,'Revisión de ingreso','Batería '+T.batt+'% · '+(q.d.map(x=>x[0]).join(', ')||'sin novedades'));
  logAct('recompra','🔁','Trade-in recibido: <b>'+esc(uname(it))+'</b> por '+fmt(q.q));S.ti=null;saveDB();paintNav();toast('✅ Trade-in registrado · pasa a revisión');S.inv={q:'',cat:'iPhone',cond:'',br:'',st:'En revisión'};go('inventario')};
function createItemQuiet(cat,o){
  const n=(DB.seq.item=(DB.seq.item||0)+1);
  const it=Object.assign({id:'I-'+String(n).padStart(4,'0'),sku:CAT_SKU[cat]+'-'+String(n).padStart(4,'0'),cat,name:'',spec:'',color:'',cond:'Nuevo',serial:'',qty:1,cost:0,price:0,warr:12,branch:DB.settings.branches[0],status:'En vitrina',acq:Date.now(),src:'Importación',batt:null,notes:'',repairs:0,min:0,tl:[],hold:null},o);
  it.track=(cat==='AirPods'||cat==='Accesorios')?'qty':'unit';addEv(it,'Trade-in recibido','Cotización aceptada · '+fmt(it.cost));DB.items.unshift(it);return it;
}

/* ---------- Taller ---------- */
const ORDER_FLOW=['Diagnóstico','Esperando repuesto','En reparación','Listo'];
VIEWS.taller={html(){
  const col=s=>DB.orders.filter(o=>o.st===s),cv=can('cost_view');
  return `<div class="page-h"><div><h1>Taller y reacondicionado</h1><p>Cada reparación suma su costo al equipo y actualiza el margen real.</p></div>${can('workshop')?'<button class="btn primary" data-a="newOrder">➕ Nueva orden</button>':''}</div>
  <div class="grid g4">${ORDER_FLOW.map(s=>`<div class="card"><div class="card-h"><h3>${s}</h3>${chip(col(s).length,'gray')}</div><div class="card-p" style="display:flex;flex-direction:column;gap:10px">
   ${col(s).map(o=>{const u=itemById(o.item);return `<div style="border:1px solid var(--border);border-radius:10px;padding:11px 12px"><div style="font-weight:700;font-size:13px">${esc(u?uname(u):'—')}</div><div style="font-size:12.5px;color:var(--t2)">${esc(o.job)}</div>
    <div style="font-size:12px;color:var(--t3);margin:4px 0 8px">${o.id} · ${esc(o.tech)}${o.cost&&cv?' · '+fmt(o.cost):''} · ${daysAgo(o.t)} d</div>
    ${can('workshop')?`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-a="advance" data-id="${o.id}">${s==='Listo'?'Devolver a vitrina ✓':'Avanzar →'}</button><button class="btn sm" data-a="editOrder" data-id="${o.id}">Editar</button></div>`:''}</div>`}).join('')||'<div style="color:var(--t4);font-size:13px;text-align:center;padding:10px">Sin órdenes</div>'}
   </div></div>`).join('')}</div>
  <div class="note" style="margin-top:16px">Al pasar una orden a “Listo” y devolverla a vitrina, su costo se suma al equipo y baja su margen.</div>`;
}};
const JOBS=['Cambio de batería','Cambio de pantalla','Diagnóstico general','Diagnóstico Face ID','Reparación de cámara','Cambio de puerto de carga','Limpieza y reacondicionado','Cambio de carcasa'];
function workshopModal(itemId){
  const cands=DB.items.filter(i=>!isQty(i)&&['En vitrina','En revisión'].includes(i.status));
  const techs=DB.users.filter(u=>u.active&&(roleOf(u).locked||roleOf(u).perms.includes('workshop')));
  openModal(`${modalHead('Nueva orden de taller')}<div class="modal-b f"><div class="row"><div style="grid-column:span 2"><label>Equipo</label><select id="o-item">${cands.map(i=>`<option value="${i.id}" ${i.id===itemId?'selected':''}>${esc(uname(i))} · ${esc(i.color)} · •••${esc(i.serial.slice(-5))}</option>`).join('')}</select></div></div>
   <div class="row"><div><label>Trabajo</label><select id="o-job">${JOBS.map(j=>`<option>${j}</option>`).join('')}</select></div><div><label>Técnico</label><select id="o-tech">${techs.map(t=>`<option>${esc(t.name.split(' ')[0])}</option>`).join('')}</select></div><div><label>Costo estimado</label><input id="o-cost" type="number" step="10000" min="0" value="0"></div></div></div>
   <div class="modal-f"><button class="btn" data-a="closeModal">Cancelar</button><button class="btn primary" data-a="saveOrder">Crear orden</button></div>`);
}
ACT.newOrder=()=>workshopModal();
ACT.saveOrder=()=>{const it=itemById($('#o-item')?$('#o-item').value:'');if(!it){toast('No hay equipos disponibles para enviar a taller');return}
  DB.orders.unshift({id:nextId('order','T-',3),item:it.id,job:$('#o-job').value,st:'Diagnóstico',cost:num('o-cost'),tech:$('#o-tech').value,t:Date.now(),prev:it.status});
  addEv(it,'Entró a taller',$('#o-job').value,'warn');it.status='En taller';saveDB();closeModal();closeDrawer();paintNav();render();toast('🔧 Orden de taller creada')};
ACT.editOrder=d=>{const o=DB.orders.find(x=>x.id===d.id),u=itemById(o.item);openModal(`${modalHead('Orden '+o.id+' · '+esc(uname(u)))}<div class="modal-b f"><div class="row"><div><label>Trabajo</label><input id="o-job" value="${esc(o.job)}"></div><div><label>Costo (COP)</label><input id="o-cost" type="number" step="10000" value="${o.cost}"></div></div></div>
  <div class="modal-f"><button class="btn danger" data-a="cancelOrder" data-id="${o.id}">Cancelar orden</button><button class="btn primary" data-a="saveOrderEdit" data-id="${o.id}">Guardar</button></div>`)};
ACT.saveOrderEdit=d=>{const o=DB.orders.find(x=>x.id===d.id);o.job=val('o-job')||o.job;o.cost=num('o-cost');saveDB();closeModal();render()};
ACT.cancelOrder=d=>{const o=DB.orders.find(x=>x.id===d.id),u=itemById(o.item);u.status=o.prev||'En vitrina';addEv(u,'Orden de taller cancelada',o.job,'warn');DB.orders=DB.orders.filter(x=>x.id!==o.id);saveDB();closeModal();paintNav();render();toast('Orden cancelada')};
ACT.advance=d=>{if(!need('workshop'))return;const o=DB.orders.find(x=>x.id===d.id),u=itemById(o.item);
  if(o.st==='Listo'){u.status='En vitrina';u.repairs=(u.repairs||0)+o.cost;addEv(u,'Reparación terminada',o.job+' · costo '+fmt(o.cost)+' sumado al equipo','ok');addEv(u,'En vitrina',u.branch);DB.orders=DB.orders.filter(x=>x.id!==o.id);
    logAct('owner','🔧','Reparación terminada: <b>'+esc(uname(u))+'</b> ('+esc(o.job)+')');toast('✅ '+esc(uname(u))+' volvió a vitrina · +'+fmt(o.cost)+' al costo')}
  else o.st=ORDER_FLOW[ORDER_FLOW.indexOf(o.st)+1];
  saveDB();render();paintNav()};
