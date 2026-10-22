// Cámara de computador (webcam 720p, código pequeño en el cuadro): el escáner debe leer el IMEI.
// Cámara simulada: la foto e2e/camara-imei-webcam.png (código pequeño, desenfocado, con ruido y la caja oscura alrededor).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');const os=require('os'),path=require('path');
const Y4M=process.env.CAM_Y4M||path.join(os.tmpdir(),'camara-imei.y4m');
if(!process.env.CAM_Y4M)execFileSync('ffmpeg',['-loglevel','error','-y','-loop','1','-i',path.join(__dirname,'camara-imei-webcam.png'),'-t','3','-r','10','-pix_fmt','yuv420p',Y4M]);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const B='http://localhost:3101';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+Y4M]});
 const ctx=await b.newContext({viewport:{width:1366,height:900},permissions:['camera']});const p=await ctx.newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(B+'/');await p.waitForURL('**/setup',{timeout:60000});
 await p.fill('#business','Importech');await p.fill('#ownerName','Angelica');await p.fill('#ownerPass','Vitrina#7Luna');await p.fill('#ownerPass2','Vitrina#7Luna');
 await p.click('button:has-text("Crear mi tienda")');await p.waitForURL(B+'/',{timeout:60000});
 await p.goto(B+'/venta');await p.click('button:has-text("📷 Escanear")');
 const t0=Date.now();
 await p.waitForSelector('[role=dialog] dd:has-text("356938035643809")',{timeout:20000}).catch(()=>{});
 ok(await p.locator('[role=dialog] dd:has-text("356938035643809")').count()>0,`lee el IMEI con la webcam (${Date.now()-t0} ms)`);
 ok(errs.length===0,'sin errores JS '+errs.join(';'));
 await b.close();console.log(fails?'FALLAS '+fails:'TODO OK');process.exit(fails?1:0);
})();
