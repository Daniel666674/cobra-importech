/* =====================================================
   DATA · constantes, catálogo, datos de ejemplo y persistencia
   ===================================================== */
const DB_KEY='importech_demo_v4', SESSION_KEY='importech_session_v4', DB_VER=6;
const DAY=864e5;

const CATS=['iPhone','iPad','Mac','Apple Watch','AirPods','Accesorios'];
const CAT_IC={iPhone:'📱',iPad:'📲',Mac:'💻','Apple Watch':'⌚',AirPods:'🎧',Accesorios:'🔌'};
const CAT_SKU={iPhone:'IPH',iPad:'IPD',Mac:'MAC','Apple Watch':'AWT',AirPods:'APD',Accesorios:'ACC'};
const CONDS=['Nuevo','Exhibición','Reacondicionado','Pre-owned','Usado'];
const COND_INFO={
  'Nuevo':'Sellado, sin uso',
  'Exhibición':'Equipo de vitrina, sin uso real, caja abierta',
  'Reacondicionado':'Revisado y reparado en taller, como nuevo',
  'Pre-owned':'Seminuevo grado A, casi sin marcas',
  'Usado':'Grado B, marcas visibles de uso'};
const COND_CHIP={'Nuevo':'ok','Exhibición':'info','Reacondicionado':'pur','Pre-owned':'warn','Usado':'gray'};
const COND_F={'Nuevo':1,'Exhibición':.92,'Reacondicionado':.82,'Pre-owned':.74,'Usado':.62};
const STATUSES=['En vitrina','Apartado','En taller','En revisión','Vendido'];
const METHODS=['Efectivo','Transferencia','Tarjeta','Nequi','Daviplata','Enlace Bold'];
const STOR={128:-400000,256:0,512:1000000,1024:2000000};

/* Catálogo (precio de referencia nuevo en COP; TAC ficticio para simular la verificación) */
const CATALOG=[
 ...[['iPhone 17 Pro Max',6899000,'35911001'],['iPhone 17 Pro',5899000,'35911002'],['iPhone 17',4199000,'35911003'],
  ['iPhone 16 Pro Max',5599000,'35822003'],['iPhone 16 Pro',4799000,'35822001'],['iPhone 16',3499000,'35822002'],
  ['iPhone 15 Pro Max',4599000,'35733003'],['iPhone 15 Pro',3999000,'35733001'],['iPhone 15',2999000,'35733002'],
  ['iPhone 14 Pro',3299000,'35644002'],['iPhone 14',2299000,'35644001'],['iPhone 13',1799000,'35555001'],
  ['iPhone 12',1399000,'35466001'],['iPhone SE (3.ª gen)',1499000,'35377001']].map(([name,retail,tac])=>({cat:'iPhone',name,retail,tac})),
 ...[['iPad 10.ª gen 64 GB Wi-Fi',1799000],['iPad 11.ª gen 128 GB Wi-Fi',2099000],['iPad 9.ª gen 64 GB Wi-Fi',1399000],['iPad mini 7 128 GB',2699000],
  ['iPad Air 11" M3 128 GB',3299000],['iPad Air 13" M3 256 GB',4399000],['iPad Pro 11" M4 256 GB',5499000],['iPad Pro 13" M4 512 GB',7899000]].map(([name,retail])=>({cat:'iPad',name,retail})),
 ...[['MacBook Air 13" M4 16/256',4699000],['MacBook Air 15" M4 16/512',6299000],['MacBook Air 13" M3 8/256',4199000],['MacBook Air 13" M2 8/256',3499000],
  ['MacBook Air 13" M1 8/256',2699000],['MacBook Pro 14" M4 16/512',7499000],['MacBook Pro 14" M4 Pro 24/512',9499000],['MacBook Pro 16" M4 Pro 24/512',11499000],
  ['iMac 24" M4 16/256',6599000],['Mac mini M4 16/256',3299000]].map(([name,retail])=>({cat:'Mac',name,retail})),
 ...[['Apple Watch Series 10 46 mm',2299000],['Apple Watch Series 10 42 mm',2099000],['Apple Watch Ultra 2 49 mm',3999000],
  ['Apple Watch SE (2.ª gen) 44 mm',1399000],['Apple Watch Series 9 45 mm',1899000]].map(([name,retail])=>({cat:'Apple Watch',name,retail})),
 ...[['AirPods 4',749000],['AirPods 4 con cancelación de ruido',999000],['AirPods Pro 2 (USB-C)',1149000],['AirPods Pro 3',1299000],
  ['AirPods 3',599000],['AirPods Max (USB-C)',2499000]].map(([name,retail])=>({cat:'AirPods',name,retail})),
 ...[['Cargador MagSafe 15 W',179000],['Adaptador de corriente 20 W USB-C',89000],['Cable USB-C a USB-C 1 m',69000],['Cable USB-C a Lightning 1 m',69000],
  ['Cable MagSafe 3 a USB-C 2 m',199000],['Funda de silicona iPhone 17 Pro',199000],['Funda transparente MagSafe iPhone 16',169000],
  ['Vidrio templado iPhone 17',59000],['Vidrio templado iPhone 16 / 15',49000],['Apple Pencil Pro',649000],['Apple Pencil (USB-C)',379000],
  ['Magic Keyboard iPad Air 11"',1299000],['Smart Folio iPad Air 11"',299000],['AirTag (paquete x4)',399000],['Adaptador multipuerto USB-C',299000],
  ['Magic Mouse',449000],['Batería MagSafe',449000],['Estuche AirPods Pro 2',79000]].map(([name,retail])=>({cat:'Accesorios',name,retail}))];
const CAT_BY_NAME=Object.fromEntries(CATALOG.map(c=>[c.name,c]));

/* ---------- IMEI (simulado) ---------- */
function luhnOk(s){if(!/^\d{15}$/.test(s))return false;let sum=0;for(let i=0;i<15;i++){let d=+s[14-i];if(i%2===1){d*=2;if(d>9)d-=9}sum+=d}return sum%10===0}
function withCheck(b){let sum=0;for(let i=0;i<14;i++){let d=+b[13-i];if(i%2===0){d*=2;if(d>9)d-=9}sum+=d}return b+((10-sum%10)%10)}
const mkImei=(tac,n)=>withCheck(tac+String(n).padStart(6,'0'));
const mkSerial=n=>'F'+((n*2654435761)>>>0).toString(36).toUpperCase().padStart(7,'0')+'X'+String(n*7919%1000).padStart(3,'0');
/* IMEI de prueba: el registro es simulado */
const TEST_IMEI={clean:mkImei('35911001',700001),hurto:mkImei('35911002',900001),extravio:mkImei('35822001',900002),
  icloud:mkImei('35733001',900003),operador:mkImei('35822002',900004)};
const REG={};
REG[TEST_IMEI.hurto]={neg:'Reportado como HURTADO · operador Claro · 12 sep'};
REG[TEST_IMEI.extravio]={neg:'Reportado como EXTRAVIADO · operador Tigo · 03 sep'};
REG[TEST_IMEI.icloud]={icloud:true};
REG[TEST_IMEI.operador]={carrier:'Bloqueado a operador Movistar'};

/* ---------- Permisos y roles ---------- */
const PERMS=[
 ['inv_view','Ver inventario'],['inv_edit','Crear y editar productos'],['inv_delete','Eliminar productos'],['cost_view','Ver costos y márgenes'],
 ['sell','Registrar ventas'],['discount','Dar descuentos sobre el límite'],['refund','Hacer devoluciones'],
 ['credit','Gestionar apartados y abonos'],['tradein','Recibir trade-in'],['workshop','Gestionar taller'],
 ['purchase','Gestionar compras'],['clients','Gestionar clientes'],
 ['reports','Ver reportes'],['users','Gestionar usuarios y permisos'],['settings','Cambiar configuración y logo'],
 ['dev','Herramientas de desarrollador (restaurar y restablecer datos)']];
const ALL_PERMS=PERMS.map(p=>p[0]);
const DEFAULT_ROLES={
 dev:{name:'Desarrollador',locked:true,perms:ALL_PERMS},
 owner:{name:'Propietario/a',perms:ALL_PERMS.filter(p=>p!=='dev')},
 employee:{name:'Empleado/a de tienda',perms:['inv_view','sell','credit','tradein','clients','workshop']}};

/* ---------- Automatizaciones ---------- */
const AUTOS=[
 {id:'reprice',ic:'🏷️',n:'Repricing por TRM y mercado',imp:'Alto',d:'Cuando cambia el dólar o la competencia, recalcula precios y protege el margen mínimo.'},
 {id:'aged',ic:'⏳',n:'Alerta de inventario envejecido',imp:'Alto',d:'Detecta equipos que llevan demasiados días en vitrina y propone rebaja o traslado de sede.'},
 {id:'wa',ic:'💬',n:'Venta por WhatsApp',imp:'Alto',d:'Responde disponibilidad, precio y foto, y aparta el equipo con abono. Atiende 24/7.'},
 {id:'reorder',ic:'📈',n:'Reposición sugerida',imp:'Alto',d:'Detecta accesorios y modelos con stock bajo y arma la orden de compra al proveedor.'},
 {id:'owner',ic:'🚨',n:'Alertas al dueño',imp:'Alto',d:'Descuentos fuera de rango, ventas bajo costo, IMEI duplicado o reportado, devoluciones.'},
 {id:'apartado',ic:'🔒',n:'Apartados con abonos',imp:'Alto',d:'Bloquea el equipo con abono, avisa por WhatsApp el saldo antes de que venza y lo libera solo si no completan el pago.'},
 {id:'post',ic:'⭐',n:'Postventa automática',imp:'Medio',d:'Día 7 reseña, día 30 accesorios, y aviso antes de que venza la garantía.'},
 {id:'recompra',ic:'🔁',n:'Recompra y trade-in',imp:'Medio',d:'A los 12–18 meses ofrece recibir el equipo del cliente por uno nuevo.'},
 {id:'fe',ic:'🧾',n:'Comprobantes de venta',imp:'Medio',d:'Cada venta genera su comprobante con IMEI/serial y garantía. (La factura electrónica DIAN se integra con el sistema real.)'},
 {id:'caja',ic:'💰',n:'Cierre de caja diario',imp:'Medio',d:'Resume ventas del día por método de pago y sede para cuadrar la caja.'},
 {id:'pub',ic:'📣',n:'Publicación automática',imp:'Medio',d:'Los equipos nuevos en vitrina se publican en catálogo, WhatsApp Business y Marketplace.'}];

/* =====================================================
   DATOS DE EJEMPLO
   ===================================================== */
function buildSeed(){
  const now=Date.now(),ago=d=>now-d*DAY,hrs=h=>now-h*36e5;
  const D={ver:DB_VER,seedAt:now,seq:{item:0,sale:0,client:0,order:0,po:0,claim:0,user:0,feed:0,role:0},
    settings:{name:'Importech',legal:'Importech S.A.S.',nit:'900.000.000-0',address:'Calle 10 # 5-20, Medellín',phone:'300 000 0000',email:'ventas@importech.demo',
      footer:'Gracias por tu compra. Conserva este comprobante para hacer válida tu garantía.',brand:'#1F2937',logo:'assets/brand/logo.png',
      branches:['Tienda principal'],warr:{'Nuevo':12,'Exhibición':9,'Reacondicionado':6,'Pre-owned':3,'Usado':1},
      maxDisc:5,minMargin:12,trm:4050,agedDays:45,holdDays:5,apartadoMinPct:20},
    roles:JSON.parse(JSON.stringify(DEFAULT_ROLES)),users:[],clients:[],items:[],sales:[],orders:[],purchases:[],holdHist:[],claims:[],feed:[],autos:{}};
  AUTOS.forEach(a=>D.autos[a.id]=true);

  /* Usuarios */
  [['Daniel Acosta','daniel@importech.demo','dev'],['Angelica','angelica@importech.demo','owner'],['Anderson','anderson@importech.demo','employee']].forEach(([name,email,role])=>
    D.users.push({id:'u'+(++D.seq.user),name,email,role,active:true,pin:null}));
  const U=D.users,SU=[U[1],U[2],U[2]];   // quién vendió: Angelica o Anderson

  /* Clientes */
  [['Camila Rojas','300 512 4471','camila.rojas@correo.co','1.020.334.551'],['Juan Pablo Gómez','315 220 8834','jp.gomez@correo.co','1.017.220.118'],
   ['Valentina Ortiz','310 447 9012','vale.ortiz@correo.co','1.036.902.774'],['Andrés Felipe Mejía','320 118 6650','afmejia@correo.co','71.334.902'],
   ['Laura Restrepo','301 776 2298','lauraresp@correo.co','1.044.512.667'],['Sebastián Cárdenas','311 903 5517','scardenas@correo.co','1.128.400.912'],
   ['Daniela Vargas','318 665 0043','dvargas@correo.co','1.152.887.340'],['Mateo Herrera','304 821 7709','mherrera@correo.co','1.001.556.203'],
   ['Isabela Duarte','316 390 2265','isaduarte@correo.co','1.037.118.995'],['Carlos Ramírez','322 054 8813','cramirez@correo.co','98.554.301'],
   ['Tienda Digital SAS','604 444 1200','compras@tiendadigital.co','901.223.445-1']].forEach(([name,phone,email,doc])=>
    D.clients.push({id:'c'+(++D.seq.client),name,phone,email,doc,notes:''}));
  const C=D.clients;

  /* Productos */
  const B=[D.settings.branches[0],D.settings.branches[0],D.settings.branches[0]],W=D.settings.warr;   // una sola tienda
  function mk(o){
    const n=++D.seq.item;
    const it=Object.assign({id:'I-'+String(n).padStart(4,'0'),sku:'',cat:'iPhone',name:'',spec:'',color:'',cond:'Nuevo',serial:'',qty:1,cost:0,price:0,warr:12,
      branch:B[0],status:'En vitrina',acq:now,src:'',batt:null,notes:'',repairs:0,min:0,tl:[],hold:null},o);
    it.track=(it.cat==='AirPods'||it.cat==='Accesorios')?'qty':'unit';
    it.sku=CAT_SKU[it.cat]+'-'+String(n).padStart(4,'0');
    if(it.track==='unit'&&!it.serial)it.serial=it.cat==='iPhone'?mkImei((CAT_BY_NAME[it.name]||{tac:'35000000'}).tac,1000+n*137):mkSerial(n);
    D.items.push(it);return it;
  }
  const fmt0=n=>'$'+Math.round(n).toLocaleString('es-CO');
  const ev=(it,t,title,detail,tone,by)=>it.tl.push({t,title,detail:detail||'',tone:tone||'',by:by||''});
  const staff=['Anderson','Angelica'];
  const soldDefs=[];
  /* r(cat,name,spec,color,cond,cost,price,branch,status,díasAdq,origen,extra) */
  const r=(cat,name,spec,color,cond,cost,price,branch,status,acq,src,x)=>{
    x=x||{};
    const it=mk({cat,name,spec,color,cond,cost,price,branch,status,acq:ago(acq),src,warr:x.warr!=null?x.warr:W[cond],batt:x.batt||null,qty:x.qty!=null?x.qty:1,min:x.min||0,notes:x.notes||''});
    const t0=ago(acq),tr=/Trade-in/.test(src);
    ev(it,t0,tr?'Trade-in recibido':(/Consig/.test(src)?'Ingreso en consignación':'Compra'),src,'',staff[it.id.length%2]);
    {
      if(it.track==='unit'&&cat==='iPhone')ev(it,t0+2*36e5,'Recepción · IMEI verificado','Base negativa: limpio · iCloud: libre · Operador: libre','ok','Anderson');
      else ev(it,t0+2*36e5,'Recepción',it.track==='qty'?it.qty+' unidades ingresadas':'Equipo recibido y revisado','ok','Anderson');
      if(status!=='En revisión')ev(it,t0+DAY*.8,'En vitrina',branch,'','Anderson');
    }
    if(status==='En taller')ev(it,ago(4),'Entró a taller','Orden de reparación abierta','warn','Anderson');
    if(status==='Apartado'){const h=x.hold||{c:9,pays:[[3,500000,'Efectivo']],exp:4};
      const pays=h.pays.map(([d,a,m],k)=>({t:ago(d),amount:a,method:m,by:'u3',no:'RB-'+(900+D.seq.item*3+k)}));
      it.hold={client:C[h.c].id,abono:pays.reduce((a,y)=>a+y.amount,0),expires:now+h.exp*DAY,t:pays[0].t,by:'u3',no:'RA-'+(900+D.seq.item),pays};
      ev(it,pays[0].t,'Apartado',C[h.c].name+' · abono '+fmt0(pays[0].amount)+' · vence en '+h.exp+' días','warn','Anderson');
      pays.slice(1).forEach(y=>ev(it,y.t,'Abono recibido',fmt0(y.amount)+' · '+y.method,'ok','Anderson'))}
    if(x.sale)soldDefs.push([it,x.sale]);
    return it;
  };

  /* ---- iPhone ---- */
  r('iPhone','iPhone 17 Pro Max','256 GB','Titanio naranja','Nuevo',5750000,6899000,B[0],'En vitrina',12,'Importación L-52',{batt:100});
  r('iPhone','iPhone 17 Pro Max','512 GB','Titanio negro','Nuevo',6650000,7899000,B[0],'En vitrina',12,'Importación L-52',{batt:100});
  r('iPhone','iPhone 17 Pro','256 GB','Azul profundo','Nuevo',4950000,5899000,B[1],'En vitrina',12,'Importación L-52',{batt:100});
  r('iPhone','iPhone 17 Pro','256 GB','Plata','Nuevo',4950000,5899000,B[1],'Apartado',12,'Importación L-52',{batt:100,hold:{c:9,pays:[[6,300000,'Efectivo'],[2,300000,'Transferencia']],exp:5}});
  r('iPhone','iPhone 17 Pro','512 GB','Naranja','Exhibición',5300000,6299000,B[0],'En vitrina',20,'Importación L-49',{batt:100,notes:'Equipo de exhibición sin uso real'});
  r('iPhone','iPhone 17','256 GB','Negro','Nuevo',3550000,4199000,B[0],'En vitrina',12,'Importación L-52',{batt:100});
  r('iPhone','iPhone 17','128 GB','Blanco','Nuevo',3250000,3899000,B[1],'En vitrina',5,'Importación L-53',{batt:100});
  r('iPhone','iPhone 16 Pro Max','256 GB','Titanio desierto','Nuevo',4650000,5499000,B[0],'En vitrina',26,'Importación L-49',{batt:100});
  r('iPhone','iPhone 16 Pro','256 GB','Titanio natural','Nuevo',4050000,4799000,B[2],'En vitrina',48,'Importación L-47',{batt:100});
  r('iPhone','iPhone 16 Pro','128 GB','Titanio negro','Reacondicionado',3300000,3899000,B[1],'En vitrina',16,'Importación L-49',{batt:95});
  r('iPhone','iPhone 16','128 GB','Rosado','Nuevo',2900000,3499000,B[0],'En vitrina',63,'Importación L-44',{batt:100});
  r('iPhone','iPhone 16','256 GB','Ultramarino','Exhibición',2950000,3299000,B[1],'En vitrina',21,'Importación L-49',{batt:100,notes:'Exhibición'});
  r('iPhone','iPhone 15 Pro Max','256 GB','Titanio azul','Exhibición',3850000,4299000,B[0],'En vitrina',33,'Importación L-46',{batt:100});
  r('iPhone','iPhone 15 Pro','256 GB','Titanio natural','Reacondicionado',3000000,3599000,B[0],'En vitrina',30,'Trade-in',{batt:92});
  r('iPhone','iPhone 15 Pro','256 GB','Titanio negro','Pre-owned',2650000,3199000,B[2],'En vitrina',22,'Trade-in',{batt:91});
  r('iPhone','iPhone 15 Pro','128 GB','Titanio azul','Pre-owned',2500000,2999000,B[1],'En taller',55,'Trade-in',{batt:88});
  r('iPhone','iPhone 15','256 GB','Rosado','Reacondicionado',2200000,2699000,B[1],'En taller',9,'Trade-in',{batt:94});
  r('iPhone','iPhone 15','128 GB','Negro','Pre-owned',1800000,2299000,B[0],'En vitrina',34,'Trade-in',{batt:90});
  r('iPhone','iPhone 14 Pro','128 GB','Morado oscuro','Pre-owned',2100000,2599000,B[0],'En vitrina',18,'Trade-in',{batt:89});
  r('iPhone','iPhone 14','128 GB','Medianoche','Pre-owned',1350000,1799000,B[0],'En taller',41,'Trade-in',{batt:86});
  r('iPhone','iPhone 14','128 GB','Morado','Usado',1150000,1499000,B[1],'En vitrina',72,'Consignación',{batt:84});
  r('iPhone','iPhone 13','128 GB','Azul','Usado',950000,1299000,B[0],'En vitrina',27,'Trade-in',{batt:83});
  r('iPhone','iPhone 13','128 GB','Medianoche','Usado',900000,1249000,B[2],'En revisión',2,'Trade-in',{batt:81});
  r('iPhone','iPhone 12','64 GB','Negro','Usado',650000,899000,B[1],'En vitrina',38,'Trade-in',{batt:79});
  /* ---- iPad ---- */
  r('iPad','iPad 10.ª gen 64 GB Wi-Fi','','Azul','Nuevo',1450000,1799000,B[0],'En vitrina',14,'Importación L-52');
  r('iPad','iPad Air 11" M3 128 GB','','Gris espacial','Nuevo',2700000,3299000,B[0],'En vitrina',14,'Importación L-52');
  r('iPad','iPad Air 13" M3 256 GB','','Azul','Nuevo',3650000,4399000,B[1],'En vitrina',14,'Importación L-52');
  r('iPad','iPad Pro 11" M4 256 GB','','Negro espacial','Nuevo',4500000,5499000,B[0],'En vitrina',20,'Importación L-49');
  r('iPad','iPad Pro 13" M4 512 GB','','Plata','Exhibición',6300000,7199000,B[0],'En vitrina',40,'Importación L-46',{notes:'Exhibición con Apple Pencil Pro de demostración'});
  r('iPad','iPad mini 7 128 GB','','Púrpura','Nuevo',2200000,2699000,B[1],'En vitrina',10,'Importación L-52');
  r('iPad','iPad 9.ª gen 64 GB Wi-Fi','','Gris espacial','Reacondicionado',950000,1299000,B[2],'En vitrina',35,'Trade-in',{batt:90});
  r('iPad','iPad Air 11" M3 128 GB','','Azul','Pre-owned',2100000,2599000,B[1],'En vitrina',25,'Trade-in',{batt:93});
  /* ---- Mac ---- */
  r('Mac','MacBook Air 13" M4 16/256','','Azul cielo','Nuevo',3850000,4699000,B[0],'En vitrina',14,'Importación L-52');
  r('Mac','MacBook Air 15" M4 16/512','','Medianoche','Nuevo',5250000,6299000,B[0],'Apartado',14,'Importación L-52',{hold:{c:8,pays:[[9,1200000,'Tarjeta']],exp:1}});
  r('Mac','MacBook Air 13" M3 8/256','','Gris espacial','Nuevo',3450000,4199000,B[1],'En vitrina',52,'Importación L-45');
  r('Mac','MacBook Pro 14" M4 16/512','','Negro espacial','Nuevo',6200000,7499000,B[0],'En vitrina',20,'Importación L-49');
  r('Mac','MacBook Pro 14" M4 Pro 24/512','','Plata','Exhibición',7600000,8699000,B[0],'En vitrina',44,'Importación L-46',{notes:'Exhibición, 0 ciclos de batería'});
  r('Mac','MacBook Pro 16" M4 Pro 24/512','','Negro espacial','Reacondicionado',8900000,10199000,B[1],'En vitrina',30,'Importación L-49',{batt:98});
  r('Mac','MacBook Air 13" M2 8/256','','Medianoche','Pre-owned',2600000,3199000,B[0],'En vitrina',24,'Trade-in',{batt:91});
  r('Mac','MacBook Air 13" M1 8/256','','Oro','Usado',1750000,2199000,B[2],'En vitrina',58,'Trade-in',{batt:85});
  r('Mac','Mac mini M4 16/256','','Plata','Nuevo',2650000,3299000,B[0],'En vitrina',14,'Importación L-52');
  /* ---- Apple Watch ---- */
  r('Apple Watch','Apple Watch Series 10 46 mm','GPS','Negro azabache','Nuevo',1850000,2299000,B[0],'En vitrina',14,'Importación L-52');
  r('Apple Watch','Apple Watch Series 10 42 mm','GPS','Rosa','Nuevo',1700000,2099000,B[1],'En vitrina',14,'Importación L-52');
  r('Apple Watch','Apple Watch Ultra 2 49 mm','GPS + Cellular','Titanio natural','Exhibición',3300000,3699000,B[0],'En vitrina',36,'Importación L-46');
  r('Apple Watch','Apple Watch SE (2.ª gen) 44 mm','GPS','Medianoche','Nuevo',1100000,1399000,B[1],'En vitrina',14,'Importación L-52');
  r('Apple Watch','Apple Watch Series 9 45 mm','GPS','Rojo','Reacondicionado',1350000,1699000,B[2],'En vitrina',29,'Trade-in',{batt:96});
  r('Apple Watch','Apple Watch Series 8 45 mm','GPS','Medianoche','Usado',850000,1149000,B[1],'En vitrina',47,'Trade-in',{batt:87});
  /* ---- AirPods (por cantidad) ---- */
  r('AirPods','AirPods 4','','Blanco','Nuevo',590000,749000,B[0],'En vitrina',14,'Importación L-52',{qty:6,min:3});
  r('AirPods','AirPods 4 con cancelación de ruido','','Blanco','Nuevo',810000,999000,B[1],'En vitrina',14,'Importación L-52',{qty:4,min:3});
  r('AirPods','AirPods Pro 2 (USB-C)','','Blanco','Nuevo',930000,1149000,B[0],'En vitrina',14,'Importación L-52',{qty:8,min:3});
  r('AirPods','AirPods Pro 3','','Blanco','Nuevo',1050000,1299000,B[0],'En vitrina',5,'Importación L-53',{qty:2,min:3});
  r('AirPods','AirPods Max (USB-C)','','Azul','Nuevo',2000000,2499000,B[0],'En vitrina',26,'Importación L-49',{qty:2,min:1});
  r('AirPods','AirPods Pro 2 (USB-C)','','Blanco','Reacondicionado',720000,949000,B[1],'En vitrina',19,'Trade-in',{qty:3,min:1});
  r('AirPods','AirPods 3','','Blanco','Pre-owned',380000,499000,B[1],'En vitrina',31,'Trade-in',{qty:2,min:1});
  /* ---- Accesorios (por cantidad) ---- */
  const acc=(name,cost,price,qty,min,warr,branch)=>r('Accesorios',name,'','','Nuevo',cost,price,branch||B[0],'En vitrina',20,'Importación L-49',{qty,min,warr});
  acc('Cargador MagSafe 15 W',130000,179000,14,5,12);
  acc('Adaptador de corriente 20 W USB-C',60000,89000,20,8,12);
  acc('Cable USB-C a USB-C 1 m',42000,69000,25,10,6);
  acc('Cable USB-C a Lightning 1 m',42000,69000,3,8,6);
  acc('Cable MagSafe 3 a USB-C 2 m',150000,199000,5,3,12);
  acc('Funda de silicona iPhone 17 Pro',120000,199000,12,5,3);
  acc('Funda transparente MagSafe iPhone 16',100000,169000,9,5,3);
  acc('Vidrio templado iPhone 17',20000,59000,30,10,1);
  acc('Vidrio templado iPhone 16 / 15',18000,49000,4,10,1);
  acc('Apple Pencil Pro',500000,649000,6,2,12);
  acc('Apple Pencil (USB-C)',290000,379000,5,2,12);
  acc('Magic Keyboard iPad Air 11"',1000000,1299000,3,1,12);
  acc('Smart Folio iPad Air 11"',210000,299000,6,2,6);
  acc('AirTag (paquete x4)',310000,399000,7,3,12);
  acc('Adaptador multipuerto USB-C',220000,299000,6,3,6);
  acc('Magic Mouse',350000,449000,4,2,12);
  acc('Batería MagSafe',340000,449000,5,2,12,B[1]);
  acc('Estuche AirPods Pro 2',35000,79000,15,5,3,B[1]);

  /* ---- Vendidos (historial de ventas) ---- */
  const S=(cat,name,spec,color,cond,cost,price,branch,acqD,src,sale,x)=>r(cat,name,spec,color,cond,cost,price,branch,'Vendido',acqD,src,Object.assign({sale},x||{}));
  S('iPhone','iPhone 17 Pro Max','256 GB','Titanio negro','Nuevo',5750000,6799000,B[0],36,'Importación L-50',{d:6,c:0,u:2,m:'Tarjeta',mode:'contado',acc:[['Funda de silicona iPhone 17 Pro',1],['Vidrio templado iPhone 17',1]]},{batt:100});
  S('iPhone','iPhone 17 Pro','256 GB','Plata','Nuevo',4950000,5799000,B[1],34,'Importación L-50',{d:4,c:1,u:2,m:'Transferencia',mode:'contado'},{batt:100});
  S('iPhone','iPhone 16','128 GB','Negro','Nuevo',2900000,3399000,B[0],46,'Importación L-47',{d:14,c:2,u:1,m:'Efectivo',mode:'contado',acc:[['Cargador MagSafe 15 W',1]]},{batt:100});
  S('iPhone','iPhone 15 Pro','256 GB','Titanio natural','Pre-owned',2650000,3199000,B[1],50,'Trade-in',{d:27,c:3,u:2,m:'Nequi',mode:'contado'},{batt:90});
  S('iPhone','iPhone 14','128 GB','Rojo','Pre-owned',1350000,1749000,B[0],41,'Trade-in',{d:9,c:4,u:2,m:'Daviplata',mode:'contado'},{batt:85});
  S('iPhone','iPhone 17','256 GB','Verde','Nuevo',3550000,4199000,B[1],66,'Importación L-46',{d:33,c:5,u:2,m:'Tarjeta',mode:'contado'},{batt:100});
  S('iPhone','iPhone 13','128 GB','Rosado','Usado',900000,1249000,B[0],56,'Trade-in',{d:26,c:6,u:1,m:'Efectivo',mode:'contado'},{batt:80});
  S('iPhone','iPhone 16 Pro','256 GB','Titanio natural','Nuevo',4050000,4749000,B[1],81,'Importación L-45',{d:52,c:7,u:2,m:'Transferencia',mode:'contado'},{batt:100});
  S('iPhone','iPhone 15 Pro','256 GB','Titanio blanco','Nuevo',3300000,3999000,B[0],370,'Importación L-12',{d:340,c:8,u:1,m:'Tarjeta',mode:'contado'},{batt:100});
  S('iPad','iPad 10.ª gen 64 GB Wi-Fi','','Rosa','Nuevo',1450000,1749000,B[0],40,'Importación L-47',{d:11,c:2,u:1,m:'Tarjeta',mode:'contado',acc:[['Apple Pencil (USB-C)',1]]});
  S('Mac','MacBook Air 13" M3 8/256','','Medianoche','Nuevo',3450000,4099000,B[0],44,'Importación L-46',{d:19,c:10,u:1,m:'Transferencia',mode:'contado',acc:[['Adaptador multipuerto USB-C',2],['Magic Mouse',2]]});
  S('Mac','MacBook Pro 14" M4 16/512','','Plata','Nuevo',6200000,7399000,B[0],100,'Importación L-46',{d:75,c:9,u:0,m:'Tarjeta',mode:'contado'});
  S('Apple Watch','Apple Watch Series 10 46 mm','GPS','Plata','Nuevo',1850000,2249000,B[0],38,'Importación L-47',{d:8,c:4,u:2,m:'Nequi',mode:'contado'});
  S('Apple Watch','Apple Watch SE (2.ª gen) 44 mm','GPS','Estelar','Nuevo',1100000,1349000,B[1],41,'Importación L-47',{d:3,c:6,u:2,m:'Efectivo',mode:'contado'});
  S('iPhone','iPhone 16 Pro Max','256 GB','Titanio negro','Nuevo',4650000,5399000,B[0],12,'Importación L-52',{d:2,c:0,u:1,m:'Tarjeta',mode:'contado',acc:[['Estuche AirPods Pro 2',1],['Cable USB-C a USB-C 1 m',2]]},{batt:100});
  S('AirPods','AirPods Pro 2 (USB-C)','','Blanco','Nuevo',930000,1099000,B[1],40,'Importación L-47',{d:1,c:7,u:2,m:'Transferencia',mode:'contado'},{qty:1});

  /* Generar ventas y planes a partir de los vendidos */
  soldDefs.sort((a,b)=>b[1].d-a[1].d);
  soldDefs.forEach(([it,s])=>{
    const t=ago(s.d),lines=[];
    const price=it.price;
    if(it.track==='qty'){it.status='En vitrina';it.qty=0}else it.status='Vendido';
    lines.push({item:it.id,name:it.name+(it.spec?' · '+it.spec:''),color:it.color,cond:it.cond,serial:it.serial,qty:1,price,cost:it.cost,warr:it.warr,ret:0});
    (s.acc||[]).forEach(([nm,q])=>{const a=D.items.find(x=>x.name===nm&&x.track==='qty'&&x.cat==='Accesorios');if(a){a.qty+=q;lines.push({item:a.id,name:a.name,color:'',cond:a.cond,serial:'',qty:q,price:a.price,cost:a.cost,warr:a.warr,ret:0});a.qty-=q;
      ev(a,t,'Vendido ×'+q,C[s.c].name,'ok','Anderson')}});
    const total=lines.reduce((a,l)=>a+l.price*l.qty,0);
    const sale={id:'S-'+String(++D.seq.sale).padStart(4,'0'),no:'FV-'+String(1000+D.seq.sale),t,client:C[s.c].id,by:SU[s.u].id,method:s.m,mode:'contado',payments:[{method:s.m,amount:total}],lines,disc:0,total,prepaid:0,notes:''};
    D.sales.push(sale);
    ev(it,t,'Vendido',C[s.c].name+' · '+'contado · '+s.m+' · '+sale.no,'ok',SU[s.u].name.split(' ')[0]);
    ev(it,t+6e4,'Comprobante de venta',sale.no+' emitido con serial/IMEI y garantía');
    ev(it,t+12e4,'Garantía activada',it.warr+' meses','ok');
  });
  D.sales.sort((a,b)=>a.t-b.t);

  /* Reclamo de garantía abierto */
  {const sl=D.sales.find(s=>s.lines[0].name.startsWith('iPhone 16 · 128'));
   if(sl){const it=D.items.find(x=>x.id===sl.lines[0].item);D.claims.push({id:'G-001',sale:sl.id,line:0,t:ago(2),note:'La batería se descarga rápido',status:'Abierto'});
     ev(it,ago(2),'Reclamo de garantía abierto','La batería se descarga rápido','warn','Anderson')}}

  /* Taller */
  const byS=(n,c,st)=>D.items.find(x=>x.name===n&&x.color===c&&x.status===st);
  D.orders.push(
   {id:'T-031',item:byS('iPhone 15','Rosado','En taller').id,job:'Cambio de batería',st:'En reparación',cost:180000,tech:'Anderson',t:ago(3)},
   {id:'T-030',item:byS('iPhone 15 Pro','Titanio azul','En taller').id,job:'Cambio de pantalla',st:'Esperando repuesto',cost:420000,tech:'Anderson',t:ago(6)},
   {id:'T-029',item:byS('iPhone 14','Medianoche','En taller').id,job:'Cambio de batería',st:'Listo',cost:160000,tech:'Anderson',t:ago(4)},
   {id:'T-032',item:D.items.find(x=>x.status==='En revisión').id,job:'Diagnóstico Face ID',st:'Diagnóstico',cost:0,tech:'Anderson',t:ago(1)});
  D.seq.order=32;

  /* Compras */
  D.purchases.push(
   {id:'L-053',sup:'Miami Tech',desc:'Lote iPhone 17 Pro Max / Pro',qty:12,usd:820,trm:4050,freight:1.5,arancel:0,iva:19,st:'En tránsito',t:ago(1)},
   {id:'L-052',sup:'Miami Tech',desc:'Lote iPhone 17 / iPad / MacBook',qty:8,usd:890,trm:4020,freight:1.5,arancel:0,iva:19,st:'Recibido',t:ago(12)},
   {id:'L-049',sup:'Global Mobile FL',desc:'Lote iPhone 16 y accesorios',qty:10,usd:698,trm:3985,freight:1.6,arancel:0,iva:19,st:'Recibido',t:ago(21)});
  D.seq.po=53;

  /* Historial de automatizaciones */
  const F=(h,type,ic,x)=>D.feed.push({id:++D.seq.feed,t:hrs(h),type,ic,x,by:'Sistema'});
  F(.4,'apartado','💬','Recordatorio de saldo enviado a <b>Isabela Duarte</b>: su apartado vence mañana');
  F(2,'reprice','🏷️','Repricing: <b>9 precios</b> ajustados por TRM $4.050 → $4.110');
  F(4,'aged','⏳','Alerta al dueño: <b>iPhone 14 · Usado</b> lleva 72 días en inventario');
  F(6,'fe','🧾','Comprobante <b>FV-1016</b> emitido y enviado al cliente');
  F(9,'owner','🚨','Verificación IMEI: <b>1 equipo bloqueado</b> por reporte de hurto');
  F(22,'reorder','📈','Reposición sugerida: <b>Cable USB-C a Lightning</b> quedó con 3 unidades');
  F(26,'caja','💰','Cierre de caja Sede Norte cuadrado · diferencia $0');
  F(30,'wa','💬','Cliente consultó <b>iPhone 17 Pro</b> por WhatsApp · equipo apartado con abono');
  F(31,'pub','📣','<b>iPhone 17 Pro Max</b> publicado en catálogo de WhatsApp Business');
  F(48,'post','⭐','Solicitud de reseña enviada a <b>Camila Rojas</b> (día 7)');
  F(50,'recompra','🔁','Oferta de recompra enviada a <b>Isabela Duarte</b>');
  F(52,'apartado','🔒','Apartado de <b>Carlos Ramírez</b> recibió abono de $500.000');
  F(70,'apartado','💬','Recordatorio de saldo enviado a <b>Carlos Ramírez</b> (vence en 3 días)');
  F(72,'fe','🧾','Comprobante <b>FV-1015</b> emitido y enviado al cliente');
  F(96,'wa','💬','Consulta por <b>AirPods Pro 3</b> respondida automáticamente');
  F(100,'aged','⏳','Rebaja sugerida del 5% para <b>iPhone 16 · Rosado</b>');
  F(120,'owner','🚨','Descuento del 12% detectado en venta · alerta enviada al dueño');
  D.feed.sort((a,b)=>b.t-a.t);
  return D;
}

/* =====================================================
   PERSISTENCIA (localStorage; si está bloqueado, funciona en memoria)
   ===================================================== */
let DB=null,STORAGE_OK=true;
/* Migra copias guardadas con el equipo anterior (v4) al equipo nuevo: Daniel (Desarrollador), Angelica (Propietario/a), Anderson (Empleado/a) */
function migrateDB(d){
  if(!d)return null;
  if(d.ver===4){
    const ren={'Marcela':'Anderson','Sofía':'Anderson','Andrés':'Anderson','Laura':'Angelica'};
    const idMap={u1:'u1',u2:'u2',u3:'u3',u4:'u3',u5:'u3'},roleMap={admin:'owner',gerente:'owner',vendedor:'employee',tecnico:'employee',bodega:'employee'};
    const fresh=JSON.parse(JSON.stringify(DEFAULT_ROLES));
    Object.keys(d.roles||{}).forEach(k=>{if(k.startsWith('rol')&&!fresh[k])fresh[k]=d.roles[k]});
    const base={u1:['Daniel Acosta','daniel@importech.demo','dev'],u2:['Angelica','angelica@importech.demo','owner'],u3:['Anderson','anderson@importech.demo','employee']};
    const users=Object.entries(base).map(([id,[name,email,role]])=>{const o=(d.users||[]).find(u=>u.id===id)||{};return{id,name,email,role,active:true,pin:o.pin||null}});
    (d.users||[]).filter(u=>!idMap[u.id]).forEach(u=>users.push(Object.assign({},u,{role:fresh[u.role]?u.role:(roleMap[u.role]||'employee')})));
    d.roles=fresh;d.users=users;
    const m=id=>idMap[id]||id;
    (d.sales||[]).forEach(s=>{s.by=m(s.by)});(d.transfers||[]).forEach(t=>{t.by=m(t.by)});
    (d.plans||[]).forEach(p=>(p.pays||[]).forEach(x=>{x.by=m(x.by)}));
    (d.items||[]).forEach(i=>{if(i.hold)i.hold.by=m(i.hold.by);(i.tl||[]).forEach(e=>{if(ren[e.by])e.by=ren[e.by]})});
    (d.orders||[]).forEach(o=>{if(ren[o.tech])o.tech=ren[o.tech]});
    d.ver=5;
  }
  /* v5 → v6: una sola tienda, sin transferencias ni ventas a cuotas; los apartados guardan sus abonos */
  if(d.ver===5){
    const main=(d.settings.branches&&d.settings.branches[0])?'Tienda principal':'Tienda principal';
    d.settings.branches=[main];d.settings.apartadoMinPct=d.settings.apartadoMinPct||20;
    (d.items||[]).forEach(i=>{i.branch=main;if(i.status==='En tránsito'){i.status='En vitrina';(i.tl||(i.tl=[])).push({t:Date.now(),title:'Recibido',detail:'Ingreso desde compra',tone:'ok',by:'Sistema'})}
      if(i.hold&&!i.hold.pays)i.hold.pays=[{t:i.hold.t||Date.now(),amount:i.hold.abono||0,method:'Efectivo',by:i.hold.by,no:i.hold.no||'RB-1'}]});
    (d.sales||[]).forEach(s=>{if(s.plan||/^cuotas/.test(s.mode||'')){s.plan=null;s.mode='contado'}if(!s.payments)s.payments=[{method:s.method||'Efectivo',amount:s.total}];delete s.branch});
    delete d.plans;delete d.transfers;d.holdHist=d.holdHist||[];
    if(d.autos)delete d.autos.cuotas;
    (d.feed||[]).forEach(f=>{if(f.type==='cuotas')f.type='apartado'});
    Object.values(d.roles||{}).forEach(r=>{if(r.perms)r.perms=r.perms.filter(p=>p!=='transfer')});
    d.ver=6;
  }
  return d.ver===DB_VER?d:null;
}
function loadDB(){
  try{const s=localStorage.getItem(DB_KEY);if(s){return migrateDB(JSON.parse(s))}}catch(e){STORAGE_OK=false}
  return null;
}
function saveDB(){
  try{localStorage.setItem(DB_KEY,JSON.stringify(DB));STORAGE_OK=true}catch(e){STORAGE_OK=false;
    if(typeof toast==='function')toast('⚠️ No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). El demo sigue funcionando en memoria.')}
}
function resetDB(){DB=buildSeed();saveDB()}
function initDB(){DB=loadDB();if(!DB){DB=buildSeed();saveDB()}}
