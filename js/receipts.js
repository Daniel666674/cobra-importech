/* =====================================================
   COMPROBANTES · factura de venta, recibo de apartado, recibo de pago
   ===================================================== */

/* Valor en letras (pesos colombianos) */
const W_UN=['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
const W_DE=['','','','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
const W_CE=['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
function w999(n){
  if(!n)return '';if(n===100)return 'CIEN';
  const c=Math.floor(n/100),r=n%100;let s=c?W_CE[c]+(r?' ':''):'';
  if(r<30)s+=W_UN[r];else{const d=Math.floor(r/10),u=r%10;s+=W_DE[d]+(u?' Y '+W_UN[u]:'')}
  return s;
}
function numWords(n){
  n=Math.round(Math.abs(n));if(n===0)return 'CERO';if(n>=1e9)return String(n);
  const mill=Math.floor(n/1e6),mil=Math.floor(n%1e6/1e3),rest=n%1e3;let s='';
  if(mill){s+=mill===1?'UN MILLÓN':w999(mill).replace(/UNO$/,'UN')+' MILLONES';if(n%1e6)s+=' '}
  if(mil){s+=mil===1?'MIL':w999(mil).replace(/UNO$/,'UN')+' MIL';if(rest)s+=' '}
  if(rest)s+=w999(rest);
  return s.trim();
}
const inWords=n=>'SON: '+numWords(n)+' PESOS M/CTE';

/* Piezas comunes */
function rcHead(kind,no,t,stampTxt,stampCls){
  const B=DB.settings;
  return `<div class="rc-band"></div><div class="rc-body">
   <div class="rc-head"><div class="rc-brand">${B.logo?`<img src="${B.logo}" alt="Logo de ${esc(B.name)}">`:`<div class="rc-mono">${esc(initials(B.name)||'I')}</div>`}
    <div class="rc-biz"><b>${esc(B.name)}</b>${esc(B.legal)} · NIT ${esc(B.nit)}<br>${esc(B.address)}<br>${esc(B.phone)} · ${esc(B.email)}</div></div>
    <div class="rc-doc"><div class="k">${kind}</div><div class="n">${esc(no)}</div><div class="d">${fdatey(t)} · ${ftime(t)}</div>${stampTxt?`<span class="rc-stamp ${stampCls||'ok'}">${stampTxt}</span>`:''}</div></div>`;
}
function rcFoot(){
  return `<div class="rc-foot">${esc(DB.settings.footer)}<i>Documento de demostración: no es una factura electrónica válida ante la DIAN. Valores en pesos colombianos (COP).</i></div></div>`;
}
const rcCard=(title,rows)=>`<div class="rc-card"><h4>${title}</h4>${rows.map(([k,v])=>v?`<div class="row"><span>${k}</span><span style="text-align:right">${v}</span></div>`:'').join('')}</div>`;
const WARR_TERMS=[
 'La garantía cubre defectos de funcionamiento y de fabricación durante la vigencia indicada para cada producto.',
 'No cubre golpes, caídas, humedad, pantallas rotas, modificaciones de software ni reparaciones hechas por terceros.',
 'Para hacerla efectiva presenta este comprobante y el equipo con su serial/IMEI, sin alteraciones.',
 'Equipos reacondicionados, pre-owned y usados tienen la garantía del establecimiento indicada en este documento.',
 'Los accesorios se cambian solo por defecto de fábrica, en su empaque original cuando aplique.'];

/* ---------- Factura / comprobante de venta ---------- */
function receiptHtml(s){
  const c=s.client?clientById(s.client):null,u=userById(s.by),void_=saleVoid(s);
  const stamp=void_?['DEVUELTA','bad']:['PAGADA','ok'];
  const subtotal=s.lines.reduce((a,l)=>a+l.qty*l.price,0),discAmt=Math.max(0,subtotal-s.total),pays=s.payments&&s.payments.length?s.payments:[{method:s.method,amount:s.total-(s.prepaid||0)}];
  const paidNow=pays.reduce((a,p)=>a+p.amount,0);
  return `<div class="rc">${rcHead('COMPROBANTE DE VENTA',s.no,s.t,stamp[0],stamp[1])}
   <div class="rc-parties">${rcCard('Cliente',[['Nombre',esc(c?c.name:'Cliente de mostrador')],['Documento',esc(c?c.doc:'')],['Teléfono',esc(c?c.phone:'')],['Correo',esc(c?c.email:'')]])}
    ${rcCard('Detalles de la venta',[['Atendió',esc(u?u.name:'—')],['Forma de pago',esc(payLabel(s))],['Descuento',s.disc?(+s.disc.toFixed(1))+'%'+(s.discReason?' · '+esc(s.discReason):''):''],['Observaciones',esc(s.notes||'')]])}</div>
   <div class="rc-tw"><table class="rc-t"><thead><tr><th style="width:26px">#</th><th>Descripción</th><th>Serial / IMEI</th><th class="r">Cant.</th><th class="r">Vr. unitario</th><th class="r">Total</th><th>Garantía</th></tr></thead><tbody>
   ${s.lines.map((l,i)=>`<tr class="${lineNet(l)<=0?'ret':''}"><td>${i+1}</td><td><b>${esc(l.name)}</b><br><small>${[l.color,l.cond].filter(Boolean).map(esc).join(' · ')}</small></td><td class="sn">${esc(l.serial||'—')}</td>
    <td class="r">${l.qty}${l.ret?'<br><small>dev. '+l.ret+'</small>':''}</td><td class="r">${fmt(l.price)}</td><td class="r"><b>${fmt(l.price*l.qty)}</b></td><td>${l.warr?l.warr+' meses<br><small>hasta '+fdatey(warrEnd(s,l))+'</small>':'<small>Sin garantía</small>'}</td></tr>`).join('')}</tbody></table></div>
   <div class="rc-lower"><div class="rc-warr"><h4>Condiciones de garantía</h4><ul>${WARR_TERMS.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    <div class="rc-tot"><div class="l"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>${discAmt?`<div class="l"><span>Descuento</span><span>−${fmt(discAmt)}</span></div>`:''}
     <div class="big"><span>TOTAL</span><span>${fmt(s.total)}</span></div>
     ${s.holdPays&&s.holdPays.length?`<div class="l"><span>Abonos del apartado (${s.holdPays.length})</span><span>${fmt(s.holdPays.reduce((a,y)=>a+y.amount,0))}</span></div>`:''}
     ${pays.map(p=>`<div class="l"><span>${esc(p.method)}</span><span>${fmt(p.amount)}</span></div>`).join('')}
     ${s.cash?`<div class="l"><span>Efectivo recibido · cambio</span><span>${fmt(s.cash.given)} · ${fmt(s.cash.change)}</span></div>`:''}
     <div class="l" style="border-top:1px solid #E5E7EB;margin-top:4px;padding-top:8px"><span><b>Total pagado</b></span><b>${fmt(paidNow+(s.holdPays?s.holdPays.reduce((a,y)=>a+y.amount,0):0))}</b></div></div></div>
   <div class="rc-words">${inWords(s.total)}</div>
   <div class="rc-sign"><div>Firma del cliente</div><div>Firma autorizada · ${esc(u?u.name.split(' ')[0]:'')}</div></div>${rcFoot()}</div>`;
}

/* ---------- Recibo de apartado (con todos sus abonos) ---------- */
function holdReceiptHtml(it){
  const h=it.hold,c=clientById(h.client),u=userById(h.by),saldo=holdBal(it),pays=h.pays||[];
  return `<div class="rc">${rcHead('RECIBO DE APARTADO',h.no||('RA-'+it.id.slice(2)),h.t,'APARTADO','warn')}
   <div class="rc-parties">${rcCard('Cliente',[['Nombre',esc(c?c.name:'—')],['Documento',esc(c?c.doc:'')],['Teléfono',esc(c?c.phone:'')],['Correo',esc(c?c.email:'')]])}
    ${rcCard('Apartado',[['Atendió',esc(u?u.name:'—')],['Vigente hasta',fdatey(h.expires)],['Abonos recibidos',String(pays.length)],['Descuento',esc(h.discNote||'')]])}</div>
   <div class="rc-tw"><table class="rc-t"><thead><tr><th>Descripción</th><th>Serial / IMEI</th><th class="r">Precio</th><th>Garantía</th></tr></thead><tbody><tr><td><b>${esc(uname(it))}</b><br><small>${[it.color,it.cond].filter(Boolean).map(esc).join(' · ')}</small></td><td class="sn">${esc(it.serial||'—')}</td><td class="r"><b>${fmt(it.price)}</b></td><td>${it.warr} meses</td></tr></tbody></table></div>
   <div class="rc-lower"><div class="rc-warr"><h4>Condiciones del apartado</h4><ul><li>El equipo queda reservado a nombre del cliente hasta la fecha indicada.</li><li>Para completar la compra el cliente paga el saldo antes del vencimiento.</li><li>Si no se completa el pago, el equipo vuelve a la venta y el abono se maneja según la política del establecimiento.</li><li>El precio y la disponibilidad se respetan durante la vigencia del apartado.</li></ul></div>
    <div class="rc-tot"><div class="l"><span>Precio del equipo</span><span>${fmt(it.price)}</span></div><div class="big"><span>ABONADO</span><span>${fmt(h.abono)}</span></div><div class="l" style="padding-top:8px"><span><b>Saldo por pagar</b></span><b>${fmt(saldo)}</b></div></div></div>
   <div class="rc-plan"><h4>Abonos recibidos</h4><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Método</th><th>Valor</th></tr></thead><tbody>${pays.map(y=>`<tr><td>${fdatey(y.t)}</td><td>${esc(y.no||'—')}</td><td>${esc(y.method)}</td><td>${fmt(y.amount)}</td></tr>`).join('')}</tbody></table></div>
   <div class="rc-words">${inWords(h.abono)} (total abonado)</div>
   <div class="rc-sign"><div>Firma del cliente</div><div>Firma autorizada · ${esc(u?u.name.split(' ')[0]:'')}</div></div>${rcFoot()}</div>`;
}

/* ---------- Recibo de abono ---------- */
function abonoReceiptHtml(it,idx){
  const h=it.hold,x=h.pays[idx],c=clientById(h.client),u=userById(x.by),paidTo=h.pays.slice(0,idx+1).reduce((a,y)=>a+y.amount,0),saldo=Math.max(0,it.price-paidTo);
  return `<div class="rc">${rcHead('RECIBO DE ABONO',x.no||('RB-'+it.id.slice(2)+'-'+(idx+1)),x.t,saldo<=0?'SALDO CUBIERTO':'ABONO RECIBIDO',saldo<=0?'ok':'info')}
   <div class="rc-parties">${rcCard('Cliente',[['Nombre',esc(c?c.name:'—')],['Documento',esc(c?c.doc:'')],['Teléfono',esc(c?c.phone:'')]])}
    ${rcCard('Abono',[['Recibió',esc(u?u.name:'—')],['Método',esc(x.method)],['Apartado',esc(h.no||'—')],['Vence',fdatey(h.expires)]])}</div>
   <div class="rc-tw"><table class="rc-t"><thead><tr><th>Concepto</th><th class="r">Valor</th></tr></thead><tbody><tr><td><b>Abono al apartado</b><br><small>${esc(uname(it))}${it.serial?' · '+esc(it.serial):''}</small></td><td class="r"><b>${fmt(x.amount)}</b></td></tr></tbody></table></div>
   <div class="rc-lower"><div class="rc-warr"><h4>Estado del apartado</h4><ul><li>Precio del equipo: ${fmt(it.price)}.</li><li>Abonado hasta hoy: ${fmt(paidTo)} en ${idx+1} abono${idx?'s':''}.</li><li>Vigente hasta ${fdatey(h.expires)}.</li></ul></div>
    <div class="rc-tot"><div class="big"><span>ABONO</span><span>${fmt(x.amount)}</span></div><div class="l" style="padding-top:8px"><span><b>Saldo pendiente</b></span><b>${fmt(saldo)}</b></div></div></div>
   <div class="rc-words">${inWords(x.amount)}</div>
   <div class="rc-sign"><div>Firma del cliente</div><div>Firma autorizada · ${esc(u?u.name.split(' ')[0]:'')}</div></div>${rcFoot()}</div>`;
}

/* ---------- Mostrar / imprimir ---------- */
let LAST_DOC={html:'',no:''};
function openDoc(html,no,buttons,banner){
  LAST_DOC={html,no};
  openModal(`${modalHead(esc(no))}<div class="modal-b">${banner||''}${html}</div><div class="modal-f" style="flex-wrap:wrap">${buttons||''}<button class="btn primary" data-a="printDoc">🖨️ Imprimir / Guardar PDF</button></div>`,true);
}
function openReceipt(id,opts){
  const s=saleById(id);if(!s)return;
  const done=opts&&opts.done;
  openDoc(receiptHtml(s),done?'Venta registrada · '+s.no:'Venta '+s.no,
    `${can('refund')&&!saleVoid(s)?`<button class="btn danger" data-a="refundModal" data-id="${s.id}">↩︎ Devolución</button>`:''}<button class="btn" data-a="sendReceipt" data-id="${s.id}">💬 Enviar por WhatsApp</button>${done&&can('sell')?'<button class="btn" data-a="newSale">🛒 Nueva venta</button>':''}`,
    done?`<div class="done-b"><div class="done-ic">✓</div><div><b>Venta registrada</b><span>${fmt(s.total)} · ${esc(payLabel(s))}${s.cash&&s.cash.change?' · cambio '+fmt(s.cash.change):''}</span></div></div>`:'');
}
function openHoldReceipt(id){const it=itemById(id);if(it&&it.hold)openDoc(holdReceiptHtml(it),'Recibo de apartado '+(it.hold.no||''),`<button class="btn" data-a="remindHold" data-id="${it.id}">💬 Enviar por WhatsApp</button>`,
  `<div class="done-b"><div class="done-ic">🔒</div><div><b>Apartado vigente</b><span>Abonado ${fmt(holdPaid(it))} · saldo ${fmt(holdBal(it))} · vence ${fdate(it.hold.expires)}</span></div></div>`)}
function openAbonoReceipt(id,idx){const it=itemById(id);if(it&&it.hold&&it.hold.pays[idx])openDoc(abonoReceiptHtml(it,+idx),'Recibo de abono '+(it.hold.pays[idx].no||''),
  `<button class="btn" data-a="holdReceipt" data-id="${it.id}">Ver recibo del apartado</button>`)}
ACT.receipt=d=>{closeDrawer();openReceipt(d.id)};
ACT.holdReceipt=d=>openHoldReceipt(d.id);
ACT.abonoReceipt=d=>openAbonoReceipt(d.id,+d.i);
ACT.newSale=()=>{closeModal();S.pos=null;go('pos')};
ACT.printDoc=()=>{$('#print').innerHTML=LAST_DOC.html;const t=document.title;document.title=(LAST_DOC.no||'Comprobante').replace(/[^\w\- ]/g,'')+' · '+DB.settings.name;window.print();setTimeout(()=>{document.title=t;$('#print').innerHTML=''},800)};
ACT.sendReceipt=d=>{const s=saleById(d.id),c=s.client?clientById(s.client):null;
  waModal(c?c.name:'Cliente',c?c.phone:'',`Hola ${c?c.name.split(' ')[0]:''} 👋 Gracias por tu compra en ${DB.settings.name}.\nTu comprobante *${s.no}* por *${fmt(saleNet(s))}* está listo.\nGarantía: ${s.lines[0].warr} meses desde hoy. ¡Cualquier duda, escríbenos!`,'fe',()=>openReceipt(s.id))};
ACT.remindHold=d=>{const it=itemById(d.id),c=clientById(it.hold.client);
  waModal(c.name,c.phone,`Hola ${c.name.split(' ')[0]} 👋 Tu apartado del ${uname(it)} sigue reservado.\nAbonado: ${fmt(holdPaid(it))} · Saldo: *${fmt(holdBal(it))}* · Vence el ${fdatey(it.hold.expires)}.\nCompleta tu compra cuando quieras: [enlace de pago]`,'apartado',()=>openHoldReceipt(it.id))};
