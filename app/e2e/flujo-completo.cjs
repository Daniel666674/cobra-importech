const { chromium } = require('playwright');const fs=require('fs');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
const w=b=>{let s=0;for(let i=0;i<14;i++){let d=+b[13-i];if(i%2===0){d*=2;if(d>9)d-=9}s+=d}return b+((10-s%10)%10)};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 p.on('dialog',d=>d.accept());
 await p.goto(B+'/setup');await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPass','Vitrina#7Luna');await p.fill('#ownerPass2','Vitrina#7Luna');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});
 const addPhone=async(imei,name,price)=>{await p.goto(B+'/ingreso');await p.fill('#imei',imei);await p.click('#verify-btn');await p.waitForSelector('section[aria-label="Verificación oficial"]',{timeout:20000});
  await p.fill('#i-name',name);await p.fill('#i-spec','128 GB');await p.fill('#i-cost',String(Math.round(price*0.7)));await p.fill('#i-price',String(price));
  await p.locator('section[aria-label="Verificación oficial"] button:has-text("Limpio")').click();await p.locator('section[aria-label="Verificación oficial"] button:has-text("Sin bloqueo")').click();
  if(await p.locator('input[type=checkbox]').count())await p.locator('input[type=checkbox]').check();
  await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-/,{timeout:30000});return p.url().split('/').pop()};
 const A=await addPhone(w('35822002100001'),'iPhone 16',3500000),Bn=await addPhone(w('35822002100002'),'iPhone 15',2800000);
 ok(A==='I-0001'&&Bn==='I-0002','dos iPhone ingresados');
 // apartado
 await p.goto(B+`/venta?item=${A}&mode=apartado`);await p.waitForSelector('text=Apartado');
 await p.click('button:has-text("+ Nuevo")');await p.fill('input[aria-label="Nombre del cliente"]','Carlos Ramírez');await p.fill('input[placeholder="Celular"]','300 111 2222');
 await p.fill('input[aria-label="Abono"]','500');await p.waitForTimeout(150);ok(/abono mínimo/i.test(await p.innerText('body')),'valida el abono mínimo (20%)');
 await p.fill('input[aria-label="Abono"]','800000');await p.click('button:has-text("Crear apartado")');await p.waitForURL(B+'/apartados',{timeout:30000});
 ok(/RA-1001/.test(await p.innerText('body'))&&/Carlos Ramírez/.test(await p.innerText('body')),'apartado RA-1001 creado');
 await p.click('button:has-text("💰 Abono")');await p.fill('input[aria-label="Valor del abono"]','700000');await p.click('button:has-text("Registrar")');await p.waitForSelector('text=2 abono(s)',{timeout:20000});
 ok(true,'abono registrado');
 await p.click('a:has-text("Recibo")');await p.waitForURL(/\/apartados\/I-0001/);ok(/RB-1002/.test(await p.innerText('body'))&&/1\.500\.000/.test(await p.innerText('body')),'recibo del apartado lista los abonos');
 await p.goto(B+'/apartados');await p.click('a:has-text("Cerrar como venta")');await p.waitForSelector('text=Cerrando el apartado');
 const due=await p.innerText('button:has-text("Cobrar")');ok(/2\.000\.000/.test(due),'cobra solo el saldo: '+due);
 await p.click('button:has-text("Cobrar")');await p.waitForURL(/\/ventas\/S-0001/,{timeout:30000});
 ok(/Abonos del apartado/.test(await p.innerText('body')),'comprobante incluye abonos previos');
 // garantía
 await p.click('button:has-text("Abrir reclamo de garantía")');await p.fill('#cl-n','Se descarga rápido');await p.click('button:text-is("Abrir reclamo")');await p.waitForSelector('text=Reclamo registrado');
 await p.goto(B+'/garantias');ok(/Se descarga rápido/.test(await p.innerText('body')),'reclamo visible en garantías');
 await p.click('button:has-text("Resolver")');await p.click('button:has-text("Cerrar")');await p.waitForSelector('text=Resuelto',{timeout:20000});ok(true,'reclamo resuelto');
 // taller
 await p.goto(B+`/inventario/${Bn}`);await p.click('button:has-text("Enviar a taller")');await p.fill('#job','Cambio de batería');await p.fill('#jc','180000');await p.click('button:has-text("Crear orden")');await p.waitForSelector('text=Orden de taller creada');
 await p.goto(B+'/taller');ok(/Cambio de batería/.test(await p.innerText('body')),'orden en el tablero del taller');
 for(let i=0;i<4;i++){await p.locator('button:has-text("Avanzar"), button:has-text("Entregar a vitrina")').first().click();await p.waitForTimeout(700)}
 await p.goto(B+`/inventario/${Bn}`);const t=await p.innerText('body');ok(/En vitrina/.test(t)&&/Reparación terminada/.test(t),'el equipo vuelve a vitrina con el costo sumado');
 // (Compras e importación están desactivadas por ahora; ver flujo-retoma-aliadas.cjs para productos de tiendas aliadas)
 // config + logo
 await p.goto(B+'/config');await p.fill('#c-nit','900.123.456-7');await p.click('button:has-text("Guardar cambios")');await p.waitForSelector('text=Configuración guardada');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');fs.writeFileSync(require('os').tmpdir()+'/l.png',png);
 await p.setInputFiles('input[type=file]',require('os').tmpdir()+'/l.png');await p.waitForSelector('text=Logo actualizado',{timeout:20000});ok(true,'logo subido desde archivo');
 await p.goto(B+'/ventas/S-0001');ok(/900\.123\.456-7/.test(await p.innerText('article')),'el NIT sale en el comprobante');
 for(const pth of ['/reportes','/clientes','/usuarios','/ventas','/']){const r=await p.goto(B+pth);ok(r.status()===200&&!(await p.innerText('body')).includes('Application error'),'carga '+pth)}
 ok(/Carlos Ramírez/.test((await(await p.goto(B+'/clientes')).text())),'cliente nuevo listado');
 const csv=await p.request.get(B+'/api/export/inventario');ok(csv.status()===200&&/iPhone 16/.test(await csv.text()),'exporta CSV de inventario');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');
})().catch(e=>{console.log('EXC',e.message.split('\n').slice(0,4).join(' | '));process.exit(1)});
