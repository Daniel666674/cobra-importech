// Configuración por pestañas, vista previa del comprobante, numeración e importación de ventas históricas.
const { chromium } = require('playwright');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
// CSV como lo guarda Excel en Windows: separador «;» y codificación Windows-1252 (tildes en un byte).
const latin1=(s)=>Buffer.from(s,'latin1');
const CSV=[
 'No. Factura;Fecha;Cliente;Cédula;Teléfono;Descripción;IMEI;Cant;Valor Unitario;Total;Forma de Pago;Vendedor',
 'A-100;15/03/2025 10:30;José Pérez;71234567;3001112233;iPhone 14 Pro 128 GB;356111111111119;1;3.200.000;3.250.000;Transferencia Bancolombia;Angelica',
 'A-100;15/03/2025 10:30;José Pérez;71234567;3001112233;Funda MagSafe;;1;150.000;3.250.000;Transferencia Bancolombia;Angelica',
 'A-101;16/03/2025;;;;AirPods Pro 2;;1;950.000;950.000;EFECTIVO;Pedro',
 'A-102;fecha mala;;;;iPad;;1;1;1;;',
].join('\r\n');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1366,height:900}});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(B+'/');await p.waitForURL('**/setup',{timeout:60000});
 await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPass','Vitrina#7Luna');await p.fill('#ownerPass2','Vitrina#7Luna');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});

 // Negocio: valida NIT y guarda datos nuevos
 await p.goto(B+'/config');
 await p.fill('#c-nit','abc');await p.click('button:has-text("Guardar cambios")');
 await p.waitForSelector('[role=status]');ok(/NIT/.test(await p.innerText('[role=status]')),'rechaza un NIT inválido');
 await p.fill('#c-nit','901.234.567-8');await p.fill('#c-legal','Importech S.A.S.');await p.fill('#c-taxNote','No responsable de IVA');
 await p.fill('#c-city','Medellín');await p.fill('#c-instagram','@importech');await p.fill('#c-whatsapp','573001234567');
 await p.click('button:has-text("Guardar cambios")');await p.waitForSelector('text=Configuración guardada');ok(true,'guarda datos del negocio');

 // Comprobante: vista previa en vivo y numeración
 await p.click('button:has-text("🧾 Comprobante")');
 ok(p.url().includes('tab=comprobante'),'la pestaña queda en la URL');
 let r=await p.innerText('article');ok(/NIT 901\.234\.567-8/.test(r)&&/No responsable de IVA/.test(r)&&/@importech/.test(r)&&/Medellín/.test(r),'vista previa con los datos del negocio');
 await p.fill('#c-invTitle','Remisión');ok(/Remisión/i.test(await p.innerText('article')),'la vista previa cambia mientras se escribe');
 await p.fill('#c-legal','Resolución DIAN 18760000001 de 2025');ok(/Resolución DIAN/.test(await p.innerText('article')),'texto legal en la vista previa');
 await p.uncheck('text=Mostrar líneas de firma');ok(!/Firma del cliente/.test(await p.innerText('article')),'oculta las firmas');
 await p.click('button:has-text("Guardar cambios")');await p.waitForSelector('text=Configuración guardada');
 await p.fill('#n-prefix','imp-');await p.fill('#n-next','7000');ok(/IMP-7000/.test(await p.innerText('article')),'número del ejemplo con el nuevo prefijo');
 await p.click('button:has-text("Guardar numeración")');await p.waitForSelector('text=la próxima venta será IMP-7000');ok(true,'guarda la numeración');

 // Garantías
 await p.click('button:has-text("🛡️ Garantías")');
 await p.fill('#w-Usado','2');await p.fill('textarea[aria-label="Condición 1"]','Cubre defectos de fábrica por el tiempo indicado.');
 await p.click('button:has-text("Guardar garantías")');await p.waitForSelector('text=Garantías guardadas');ok(true,'guarda garantías');

 // Caja: quitar Daviplata
 await p.click('button:has-text("💳 Ventas y caja")');
 await p.uncheck('label:has-text("Daviplata") input');await p.click('button:has-text("Guardar formas de pago")');await p.waitForSelector('text=Formas de pago guardadas');

 // Importar
 await p.click('button:has-text("📥 Importar ventas")');
 await p.setInputFiles('input[type=file][accept^=".xlsx"]',{name:'ventas-2025.csv',mimeType:'text/csv',buffer:latin1(CSV)});
 await p.waitForSelector('text=Revisa antes de importar');
 r=await p.innerText('main');
 ok(/José Pérez/.test(r),'lee tildes de un CSV de Excel (Windows-1252)');
 ok(/1 fila\(s\) no se importarán/.test(r)&&/Fila 5: Fecha no reconocida/.test(r),'reporta la fila con fecha mala');
 ok(/\b2\b[\s\S]*\(3 productos\)/.test(r),'agrupa 3 filas válidas en 2 ventas');
 ok(/4\.200\.000/.test(r),'total con el descuento de la factura A-100');
 ok(await p.locator('select[aria-label="Columna para serial"]').inputValue()==='6','asignó la columna IMEI automáticamente');
 await p.click('button:has-text("Importar 2 ventas")');await p.waitForSelector('text=Listo: 2 ventas importadas',{timeout:30000});
 ok(/1 clientes nuevos/.test(await p.innerText('main')),'crea el cliente');
 ok(/ventas-2025\.csv/.test(await p.innerText('main')),'aparece en importaciones hechas');
 // Reimportar no duplica
 await p.setInputFiles('input[type=file][accept^=".xlsx"]',{name:'ventas-2025.csv',mimeType:'text/csv',buffer:latin1(CSV)});
 await p.waitForSelector('button:has-text("Importar 2 ventas")');await p.click('button:has-text("Importar 2 ventas")');
 await p.waitForSelector('text=2 ya existían',{timeout:30000});ok(true,'volver a importar no duplica');

 // Excel (.xlsx) directo, con fechas y pesos con formato
 await p.setInputFiles('input[type=file][accept^=".xlsx"]',require('path').join(__dirname,'ventas-prueba.xlsx'));
 await p.waitForSelector('td:has-text("Sofía Pérez")',{timeout:20000});
 r=await p.innerText('main');
ok(/Sofía Pérez/.test(r)&&/0?5 (de )?nov\.? (de )?2024/.test(r)&&/24 (de )?dic\.? (de )?2024/.test(r)&&/\$5\.150\.000/.test(r),'lee un Excel: fechas, nombres y totales (con descuento)');
 await p.click('button:has-text("Importar 2 ventas")');await p.waitForSelector('text=Listo: 2 ventas importadas',{timeout:30000});
 // Ventas: comprobante histórico
 await p.goto(B+'/ventas');ok(/A-100/.test(await p.innerText('main')),'la venta importada aparece en Ventas');
 await p.click('text=A-100');await p.waitForURL(/\/ventas\/H-/);
 r=await p.innerText('article');ok(/HISTÓRICA/.test(r)&&/356111111111119/.test(r)&&/Remisión/i.test(r)&&/Cubre defectos de fábrica/.test(r),'comprobante histórico con IMEI y configuración');

 // Venta nueva: prefijo y formas de pago
 await p.goto(B+'/ingreso');await p.click('button:has-text("Accesorios")');
 await p.fill('#i-name','Cable USB-C');await p.fill('#i-qty','5');await p.fill('#i-cost','30000');await p.fill('#i-price','60000');
 await p.click('button:has-text("Guardar en inventario")');await p.waitForURL(/\/inventario\/I-/,{timeout:30000});
 await p.goto(B+'/venta');await p.click('button:has-text("Cable USB-C")');
 const opts=await p.locator('select[aria-label="Método de pago"] option').allInnerTexts();
 ok(!opts.includes('Daviplata')&&opts.includes('Efectivo'),'caja sin la forma de pago desactivada');
 await p.click('button:has-text("Cobrar")');await p.waitForURL(/\/ventas\/S-/,{timeout:30000});
 ok(/IMP-7000/.test(await p.innerText('article')),'venta nueva con prefijo y número configurados');

 // Deshacer importación
 await p.goto(B+'/config?tab=importar');await p.click('button:has-text("Deshacer")');
 await p.waitForSelector('text=deshecha',{timeout:30000});
 await p.goto(B+'/ventas');ok(!/A-100/.test(await p.innerText('main')),'deshacer quita las ventas importadas');

 const exp=await p.request.get(B+'/api/export/clientes');ok(exp.status()===200&&/José Pérez/.test(await exp.text()),'exporta clientes (conserva los importados)');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');process.exit(fails?1:0);
})();
