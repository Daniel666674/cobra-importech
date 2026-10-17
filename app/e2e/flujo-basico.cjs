const { chromium } = require('playwright');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const popups=[];ctx.on('page',pg=>popups.push(pg.url()));
 // 1) tienda vacía → configuración inicial
 await p.goto(B+'/');await p.waitForURL('**/setup',{timeout:60000});
 ok(/Bienvenido/.test(await p.innerText('body')),'primer arranque pide la configuración inicial');
 await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPin','2222');await p.fill('#devName','Daniel');await p.fill('#devPin','1111');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});
 ok(/Hola, Angelica/.test(await p.innerText('body')),'entra como propietaria tras crear la tienda');
 await p.goto(B+'/inventario');ok(/No hay productos/.test(await p.innerText('body')),'inventario vacío (sin datos de ejemplo)');
 // 2) accesorio
 await p.goto(B+'/ingreso');await p.click('button:has-text("Accesorios")');
 await p.fill('#i-name','Cargador MagSafe 15 W');await p.fill('#i-qty','10');await p.fill('#i-cost','130000');await p.fill('#i-price','179000');
 await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-0001/,{timeout:30000});
 ok(/Cargador MagSafe/.test(await p.innerText('h1')),'accesorio creado I-0001');
 // 3) iPhone con verificación oficial
 const imei='358220020000016';
 await p.goto(B+'/ingreso');await p.fill('#imei',imei);await p.click('button:has-text("Verificar")');await p.waitForSelector('section[aria-label="Verificación oficial"]',{timeout:20000});
 let r=await p.innerText('body');ok(/Verificación automática/.test(r)&&/Formato del IMEI/.test(r),'muestra las verificaciones automáticas');
 // IMEI inválido de checksum
 ok(await p.locator('button:has-text("Guardar en inventario")').isDisabled(),'guardar deshabilitado sin resultado oficial');
 await p.click('text=🔎 Verificar en la fuente oficial');await p.waitForTimeout(700);
 ok((await p.evaluate(()=>navigator.clipboard.readText()))===imei,'copia el IMEI');
 ok(popups.length>=2,'abre CRC y Apple ('+popups.length+' pestañas)');
 await p.fill('#i-name','iPhone 16');await p.fill('#i-spec','128 GB');await p.fill('#i-cost','2500000');await p.fill('#i-price','3499000');
 await p.locator('section[aria-label="Verificación oficial"] button:has-text("Limpio")').click();
 ok(await p.locator('button:has-text("Guardar en inventario")').isDisabled(),'sigue deshabilitado con solo CRC');
 await p.locator('section[aria-label="Verificación oficial"] button:has-text("Sin bloqueo")').click();
 await p.locator('section[aria-label="Verificación oficial"] button:has-text("Reportado")').click();
 ok(await p.locator('button:has-text("Guardar en inventario")').isDisabled(),'reportado bloquea guardar');
 await p.locator('section[aria-label="Verificación oficial"] button:has-text("Limpio")').first().click();
 if(await p.locator('input[type=checkbox]').count())await p.locator('input[type=checkbox]').check();
 await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-0002/,{timeout:30000});
 r=await p.innerText('body');ok(/Limpio/.test(r)&&/Angelica/.test(r)&&/Consulta oficial/.test(r),'ficha con verificación oficial e historial');
 // 4) venta
 await p.goto(B+'/venta?item=I-0002');await p.waitForSelector('text=Cobrar',{timeout:20000});
 await p.click('button:has-text("Cobrar")');await p.waitForURL(/\/ventas\/S-0001/,{timeout:30000});
 r=await p.innerText('body');ok(/FV-1001/.test(r)&&/TRES MILLONES CUATROCIENTOS NOVENTA Y NUEVE MIL/.test(r),'comprobante FV-1001 con valor en letras');
 // 5) apartado de accesorio no; apartado de otro iPhone: ingresar segundo
 await p.goto(B+'/venta');await p.click('button:has-text("Cargador MagSafe")');
 await p.fill('input[aria-label="Valor del descuento"]','10');await p.waitForTimeout(200);
 ok(/Indica el motivo/.test(await p.innerText('body')),'exige motivo del descuento');
 await p.fill('input[aria-label="Motivo del descuento"]','Cliente frecuente');
 await p.click('button:has-text("Cobrar")');await p.waitForURL(/\/ventas\/S-0002/,{timeout:30000});
 // 6) permisos: empleado
 await p.goto(B+'/usuarios');
 await p.fill('#nu-n','Anderson');await p.fill('#nu-p','3333');await p.click('button:has-text("Crear")');await p.waitForSelector('text=Usuario creado');
 await p.click('button:has-text("Salir")');await p.waitForURL('**/login');
 await p.click('button:has-text("Anderson")');await p.fill('#pin','3333');await p.click('button:has-text("Entrar")');await p.waitForURL(B+'/');
 const nav=await p.innerText('nav');ok(/Nueva venta/.test(nav)&&!/Usuarios y permisos|Configuración|Reportes/.test(nav),'empleado: menú reducido');
 await p.goto(B+'/usuarios');ok(p.url().includes('denied')||p.url()===B+'/?denied=1','empleado no entra a usuarios');
 await p.goto(B+'/inventario');ok(!/Costo/.test(await p.innerText('thead')),'empleado no ve costos');
 const csv=await p.request.get(B+'/api/export/inventario');ok(csv.status()===403,'empleado no descarga CSV');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');
})().catch(e=>{console.log('EXC',e.message);process.exit(1)});
