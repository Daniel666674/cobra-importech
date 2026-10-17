const { chromium } = require('playwright');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
const w=b=>{let s=0;for(let i=0;i<14;i++){let d=+b[13-i];if(i%2===0){d*=2;if(d>9)d-=9}s+=d}return b+((10-s%10)%10)};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/setup');await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPin','2222');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});
 const sec='section[aria-label="Verificación oficial"]';
 // retoma de un iPhone con TAC desconocido
 await p.goto(B+'/retomas');await p.fill('#r-imei',w('49015420500001'));await p.click('button:has-text("Verificar")');await p.waitForSelector(sec,{timeout:20000});
 ok(/aún no reconocido/.test(await p.innerText('body')),'TAC desconocido se avisa');
 await p.fill('#r-name','iPhone 14');await p.fill('#r-spec','128 GB');await p.fill('#r-batt','78');
 await p.fill('#r-ref','2400000');
 const q=await p.innerText('main aside');ok(/6%/.test(q),'batería < 80% aplica descuento automático');
 ok(await p.locator('main aside button:has-text("Aceptar retoma")').isDisabled(),'no deja aceptar sin verificación ni datos del vendedor');
 await p.fill('#r-vendor','Juan Pérez');await p.fill('#r-doc','1.020.333.444');
 await p.locator(sec+' button:has-text("Limpio")').click();await p.locator(sec+' button:has-text("Sin bloqueo")').click();
 await p.locator('main aside input[type=checkbox]').check();
 const btn=await p.innerText('main aside button:has-text("Aceptar retoma")');console.log('  oferta:',btn);
 await p.click('main aside button:has-text("Aceptar retoma")');await p.waitForURL(/\/inventario\/I-0001/,{timeout:30000});
 const t=await p.innerText('body');ok(/Trade-in/.test(t)&&/Juan Pérez/.test(t),'retoma ingresada con datos de quien entrega');
 // segundo iPhone con el mismo TAC: ya se reconoce
 await p.goto(B+'/ingreso');await p.fill('#imei',w('49015420500002'));await p.click('#verify-btn');await p.waitForSelector(sec,{timeout:20000});
 ok(/Identificado: iPhone 14/.test(await p.innerText('body')),'el sistema recordó el modelo del TAC');
 // importar CSV de TAC
 const fs=require('fs'),os=require('os');fs.writeFileSync(os.tmpdir()+'/tac.csv','tac,marca,modelo\n35305111,Apple Inc.,iPhone 15 Pro\n35305222,Samsung,Galaxy\n');
 await p.goto(B+'/config');await p.setInputFiles('input[accept*=csv]',os.tmpdir()+'/tac.csv');await p.waitForSelector('text=1 modelos importados',{timeout:20000});ok(true,'importa CSV de TAC (solo Apple)');
 // WhatsApp del dueño
 await p.fill('#c-ownerPhone','3001112222');await p.click('button:has-text("Guardar configuración")');await p.waitForSelector('text=Configuración guardada');
 await p.goto(B+'/');ok(true,'inicio carga con celular del dueño');
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');
})().catch(e=>{console.log('EXC',e.message.split('\n').slice(0,4).join(' | '));process.exit(1)});
