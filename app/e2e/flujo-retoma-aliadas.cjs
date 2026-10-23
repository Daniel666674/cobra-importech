// Tienda aliada en consignación + venta con un iPhone recibido como parte de pago.
const { chromium } = require('playwright');
const pick=async(p,sel,val)=>{const el=p.locator(sel);if(await el.evaluate(e=>e.tagName)==='SELECT'){const has=await el.locator('option',{hasText:val}).count();const exact=has&&(await el.locator('option').allInnerTexts()).includes(val);if(exact)return el.selectOption(val);await el.selectOption('__otro__');}await p.fill(sel,val)};
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
const w=b=>{let s=0;for(let i=0;i<14;i++){let d=+b[13-i];if(i%2===0){d*=2;if(d>9)d-=9}s+=d}return b+((10-s%10)%10)};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:900}});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/setup');await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPass','Vitrina#7Luna');await p.fill('#ownerPass2','Vitrina#7Luna');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});

 // Compras ya no está en el menú; Tiendas aliadas sí
 const nav=await p.innerText('nav');ok(/Cartera/.test(nav)&&!/Compras|Tiendas aliadas/.test(nav),'menú: Cartera en lugar de Compras / Tiendas aliadas');
 await p.goto(B+'/compras');ok(p.url().endsWith('/cartera'),'Compras redirige a Cartera');
 await p.goto(B+'/aliados');ok(p.url().endsWith('/cartera'),'el enlace viejo lleva a Cartera');

 // Crear aliada en consignación
 await p.fill('#al-name','Celulares Don Pedro');await p.fill('#al-phone','3005550000');
 await p.click('button:has-text("Crear tienda aliada")');await p.waitForSelector('text=Tienda aliada creada');
 await p.click('a:has-text("Celulares Don Pedro")');await p.waitForURL(/\/cartera\/A/);
 // Ingresar un producto de la aliada desde su ficha
 await p.click('a:has-text("Ingresar producto de esta tienda")');await p.waitForURL(/\/ingreso\?ally=/);
 await p.click('button:has-text("Accesorios")');
 ok(await p.locator('#i-ally').inputValue()!=='','la aliada queda preseleccionada al ingresar');
 await pick(p,'#i-name','MacBook Air M2 (consignación)');await p.fill('#i-qty','1');await p.fill('#i-cost','3000000');await p.fill('#i-price','3600000');
 ok(await p.locator('#i-gain').inputValue()==='600.000'&&/Gana la tienda/.test(await p.innerText('main')),'muestra cuánto gana la tienda (COP)');
 await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-/,{timeout:30000});
 ok(/Aliada: Celulares Don Pedro/.test(await p.innerText('main')),'el producto queda con su aliada como origen');

 // Venta con retoma
 await p.goto(B+'/venta');await p.click('button:has-text("MacBook Air M2")');
 await p.click('button:has-text("+ Recibir un equipo")');
 const dlg='div[role=dialog]';const sec=dlg+' section[aria-label="Verificación oficial"]';
 await p.fill(dlg+' #r-imei',w('49015420700001'));await p.click(dlg+' button:has-text("Verificar")');await p.waitForSelector(sec,{timeout:20000});
 await pick(p,dlg+' #r-name','iPhone 13');await pick(p,dlg+' #r-spec','128 GB');await p.selectOption(dlg+' #r-cond','Usado');await p.fill(dlg+' #r-ref','2000000');await p.fill(dlg+' #r-batt','85');
 await p.locator(sec+' button:has-text("Limpio")').click();await p.locator(sec+' button:has-text("Sin bloqueo")').click();
 await p.locator(dlg+' aside input[type=checkbox]').check();
 ok(!(await p.locator(dlg+' :text("Quien entrega el equipo")').count()),'en la venta no pide datos de otro vendedor: es el cliente');
 await p.click(dlg+' button:has-text("Usar como parte de pago")');await p.waitForSelector(dlg,{state:'detached'});
 let side=await p.innerText('main section.card >> nth=1');
 ok(/iPhone 13/.test(side)&&/−\$1\.000\.000/.test(side),'la retoma aparece con su valor ($1.000.000)');
 ok(/Total a pagar\s*\$2\.600\.000/.test(side),'el saldo baja a $2.600.000');
 ok(await p.locator('button:has-text("Cobrar")').isDisabled(),'sin cliente con cédula no deja cobrar');
 ok(/elige o crea el cliente con su cédula/.test(side),'explica que falta la cédula del cliente');
 await p.click('button:has-text("Crear cliente nuevo")');await p.fill('input[aria-label="Nombre del cliente"]','Laura Ríos');await p.fill('input[placeholder="Cédula / NIT"]','1010101010');
 await p.click('button:has-text("Cobrar $2.600.000")');await p.waitForURL(/\/ventas\/S-/,{timeout:30000});
 let r=await p.innerText('article');
 ok(/Equipo recibido como parte de pago/i.test(r)&&/iPhone 13/.test(r),'el comprobante muestra el equipo recibido');
 ok(/Retoma\s*\$1\.000\.000/.test(r)&&/TOTAL\s*\$3\.600\.000/.test(r),'el comprobante muestra la retoma como pago y el total completo');

 // El iPhone quedó en inventario
 await p.goto(B+'/inventario?q=iPhone 13');
 r=await p.innerText('main');ok(/iPhone 13/.test(r),'el iPhone recibido ya está en el inventario');
 await p.click('a:has-text("iPhone 13")');await p.waitForURL(/\/inventario\/I-/);r=await p.innerText('main');
 ok(/Retoma recibida en venta/.test(r)&&/Laura Ríos/.test(r)&&/Limpio/.test(r),'ficha con el origen (venta, cliente) y la verificación oficial');

 // Cuenta de la aliada
 await p.goto(B+'/cartera');r=await p.innerText('main');
 ok(/\$3\.000\.000/.test(r)&&/0–30 d/i.test(r),'cartera: se le debe $3.000.000, por edades');
 await p.click('a:has-text("Celulares Don Pedro")');await p.waitForURL(/\/cartera\/A/);
 ok(/\$600\.000/.test(await p.innerText('main')),'la ficha muestra que la tienda gana $600.000');
 await p.click('button:has-text("Todo")');await p.fill('#pay-ref','000123456');await p.click('button:has-text("Registrar pago")');
 await p.waitForSelector('text=CE-0001 registrado. Cuenta al día.');ok(true,'pago total con comprobante de egreso CE-0001');
 // dos anticipos seguidos
 for(const [v,m] of [['500000','Nequi'],['250000','Efectivo']]){await p.fill('#pay-amount',v);await p.selectOption('#pay-method',m);await p.check('text=Es un anticipo');await p.click('button:has-text("Registrar")');await p.waitForSelector(`text=Anticipo a favor:`);await p.waitForTimeout(500)}
 r=await p.innerText('main');ok(/anticipo a favor \$\s?750\.000/i.test(r),'varios anticipos: $750.000 a favor de la tienda');
 await p.click('a:has-text("CE-0001")');await p.waitForURL(/\/cartera\/egreso\//);r=await p.innerText('article');
 ok(/Comprobante de egreso/i.test(r)&&/000123456/.test(r)&&/TRES MILLONES/.test(r)&&/Recibí conforme/.test(r),'comprobante de egreso imprimible con valor en letras y firma');

 // fecha de pago con calendario y historial de todos los pagos
 await p.goto(B+'/cartera');await p.click('a:has-text("Celulares Don Pedro")');await p.waitForURL(/\/cartera\/A/);
 ok(await p.locator('#al-due').getAttribute('type')==='date','la fecha para pagarle se escoge en el calendario');
 await p.click('button:has-text("15 días")');await p.click('button:has-text("Guardar cambios")');await p.waitForSelector('text=Cambios guardados');
 ok(/pagar el/.test(await p.innerText('main')),'la ficha muestra la fecha de pago acordada');
 await p.goto(B+'/cartera?tab=pagos');r=await p.innerText('main');
 ok(/CE-0001/.test(r)&&/CE-0002/.test(r)&&/CE-0003/.test(r)&&/Nequi/.test(r),'historial con todos los pagos registrados');
 ok(/\$\s?3\.750\.000/.test(r),'total pagado en el historial');
 await p.selectOption('#f-forma','Nequi');await p.click('form button:has-text("Filtrar")');await p.waitForURL(/forma=Nequi/);
 r=await p.innerText('main');ok(/CE-0002/.test(r)&&!/CE-0001/.test(r),'filtra por forma de pago');
 const ex=await p.request.get(B+'/api/export/pagos-aliadas');ok(ex.status()===200&&/CE-0001/.test(await ex.text()),'exporta los pagos a Excel (CSV)');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');process.exit(fails?1:0);
})();
