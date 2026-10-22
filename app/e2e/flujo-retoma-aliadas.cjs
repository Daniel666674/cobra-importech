// Tienda aliada en consignación + venta con un iPhone recibido como parte de pago.
const { chromium } = require('playwright');
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
 const nav=await p.innerText('nav');ok(/Tiendas aliadas/.test(nav)&&!/Compras/.test(nav),'menú: Tiendas aliadas en lugar de Compras');
 await p.goto(B+'/compras');ok(p.url().endsWith('/aliados'),'Compras redirige a Tiendas aliadas');

 // Crear aliada en consignación
 await p.fill('#al-name','Celulares Don Pedro');await p.fill('#al-phone','3005550000');
 await p.click('button:has-text("Crear tienda aliada")');await p.waitForSelector('text=Tienda aliada creada');
 await p.click('a:has-text("Celulares Don Pedro")');await p.waitForURL(/\/aliados\/A/);
 // Ingresar un producto de la aliada desde su ficha
 await p.click('a:has-text("Ingresar producto de esta tienda")');await p.waitForURL(/\/ingreso\?ally=/);
 await p.click('button:has-text("Accesorios")');
 ok(await p.locator('#i-ally').inputValue()!=='','la aliada queda preseleccionada al ingresar');
 await p.fill('#i-name','MacBook Air M2 (consignación)');await p.fill('#i-qty','1');await p.fill('#i-cost','3000000');await p.fill('#i-price','3600000');
 ok(/Gana la tienda: \$600\.000 \(17%\)/.test(await p.innerText('main')),'muestra cuánto gana la tienda');
 await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-/,{timeout:30000});
 ok(/Aliada: Celulares Don Pedro/.test(await p.innerText('main')),'el producto queda con su aliada como origen');

 // Venta con retoma
 await p.goto(B+'/venta');await p.click('button:has-text("MacBook Air M2")');
 await p.click('button:has-text("+ Recibir un equipo")');
 const dlg='div[role=dialog]';const sec=dlg+' section[aria-label="Verificación oficial"]';
 await p.fill(dlg+' #r-imei',w('49015420700001'));await p.click(dlg+' button:has-text("Verificar")');await p.waitForSelector(sec,{timeout:20000});
 await p.fill(dlg+' #r-name','iPhone 13');await p.fill(dlg+' #r-spec','128 GB');await p.selectOption(dlg+' #r-cond','Usado');await p.fill(dlg+' #r-ref','2000000');
 await p.locator(sec+' button:has-text("Limpio")').click();await p.locator(sec+' button:has-text("Sin bloqueo")').click();
 await p.locator(dlg+' aside input[type=checkbox]').check();
 ok(!(await p.locator(dlg+' :text("Quien entrega el equipo")').count()),'en la venta no pide datos de otro vendedor: es el cliente');
 await p.click(dlg+' button:has-text("Usar como parte de pago")');await p.waitForSelector(dlg,{state:'detached'});
 let side=await p.innerText('main section.card');
 ok(/iPhone 13/.test(side)&&/−\$1\.000\.000/.test(side),'la retoma aparece con su valor ($1.000.000)');
 ok(/Total a pagar\s*\$2\.600\.000/.test(side),'el saldo baja a $2.600.000');
 ok(await p.locator('button:has-text("Cobrar")').isDisabled(),'sin cliente con cédula no deja cobrar');
 ok(/elige o crea el cliente con su cédula/.test(side),'explica que falta la cédula del cliente');
 await p.click('button:has-text("+ Nuevo")');await p.fill('input[aria-label="Nombre del cliente"]','Laura Ríos');await p.fill('input[placeholder="Cédula / NIT"]','1010101010');
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
 await p.goto(B+'/aliados');r=await p.innerText('main');
 ok(/\$3\.000\.000/.test(r)&&/\$600\.000/.test(r),'aliadas: se le debe $3.000.000 y la tienda gana $600.000');
 await p.click('a:has-text("Celulares Don Pedro")');await p.waitForURL(/\/aliados\/A/);
 await p.click('button:has-text("Todo")');await p.fill('input[aria-label="Nota del pago"]','Transferencia');await p.click('button:has-text("Registrar pago")');
 await p.waitForSelector('text=Saldo pendiente: $0');ok(true,'pago total registrado');await p.waitForSelector('td:has-text("Transferencia")',{timeout:15000});
 r=await p.innerText('main');ok(/No hay saldo pendiente/.test(r)&&/Transferencia/.test(r),'la cuenta queda en cero con el pago en el historial');

 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');process.exit(fails?1:0);
})();
