// Carga del inventario inicial desde Excel, eligiendo el archivo con el selector (como una persona).
const { chromium } = require('playwright');
const path=require('path');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await (await b.newContext({viewport:{width:1366,height:900}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/setup');await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPass','Vitrina#7Luna');await p.fill('#ownerPass2','Vitrina#7Luna');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});
 await p.goto(B+'/inventario');await p.click('a:has-text("Importar desde Excel")');await p.waitForURL('**/inventario/importar');
 const fc=p.waitForEvent('filechooser');await p.click('text=Elegir archivo (Excel o CSV)');const chooser=await fc;
 ok(chooser.isMultiple()===false,'el botón abre el selector de archivos');
 await chooser.setFiles(path.join(__dirname,'inventario-prueba.xlsx'));
 await p.waitForSelector('td:has-text("iPhone 15 Pro")',{timeout:20000});
 const r=await p.innerText('main');
 ok(/3\b[\s\S]*\(15 unidades\)/.test(r),'reconoce 3 productos y 15 unidades con encabezados distintos (Referencia, Stock, PVP)');
 ok(/1 iPhone entrarán «En revisión»/.test(r),'avisa que el iPhone entra en revisión');
 await p.click('button:has-text("Importar 3 productos")');await p.waitForSelector('text=Listo: 3 productos importados',{timeout:30000});
 await p.goto(B+'/inventario');const inv=await p.innerText('main');
 ok(/iPhone 15 Pro/.test(inv)&&/AirPods Pro 2/.test(inv)&&/Cargador 20 W/.test(inv),'los productos aparecen en el inventario');
 // archivo real de la tienda: sin encabezados, datos desde la fila 3, sin precio de venta
 await p.goto(B+'/inventario/importar');
 await p.setInputFiles('input[type=file][accept^=".xlsx"]',path.join(__dirname,'inventario-sin-encabezados.xlsx'));
 await p.waitForSelector('td:has-text("iPhone 12 Pro Max")',{timeout:20000});
 let r2=await p.innerText('main');
 ok(/no trae encabezados/.test(r2),'detecta que el archivo no tiene encabezados');
 ok(/\b41\b/.test(r2)&&/3 fila\(s\) no se importarán/.test(r2)&&/Fila 3: IMEI no válido/.test(r2),'41 equipos válidos y 3 filas con error (con el número de fila de Excel)');
 await p.click('button:has-text("Importar 41 productos")');await p.waitForSelector('text=Listo: 41 productos importados',{timeout:60000});
 // un archivo de inventario en el importador de ventas sugiere el lugar correcto
 await p.goto(B+'/config?tab=importar');
 await p.setInputFiles('input[type=file][accept^=".xlsx"]',path.join(__dirname,'inventario-prueba.xlsx'));
 await p.waitForSelector('text=Si el archivo es de');ok(true,'el importador de ventas indica dónde subir un archivo de inventario');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');process.exit(fails?1:0);
})();
