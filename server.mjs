import http from 'node:http';
import {readFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {openDB,hash,vote,signParticipation,checkStrokes,dbName} from './core.mjs';
import {credential,normalizeDni,boardKey,loadPadron} from './padron.mjs';
const root=dirname(fileURLToPath(import.meta.url)),cfg=JSON.parse(readFileSync(join(root,'config.json')));
const demo=cfg.mode==='demo';
if(!demo&&!cfg.approved)throw Error('Se requiere configuración aprobada (approved: true).');
mkdirSync(join(root,'data'),{recursive:true});
const db=openDB(join(root,'data',dbName(cfg)));
const saved=db.prepare('SELECT value FROM config WHERE id=1').get();
if(saved&&saved.value!==JSON.stringify(cfg))throw Error('La configuración cambió después de inicializar la base. Revisa el README antes de continuar.');
db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(cfg));
const admin=process.env.ADMIN_KEY||randomBytes(32).toString('hex');
/* Junta: una clave por integrante (claves-junta.mjs). En demo se crean con la clave JUNTA-DEMO. */
if(demo&&!db.prepare('SELECT COUNT(*) n FROM board').get().n&&existsSync(join(root,'junta.json'))){const ins=db.prepare('INSERT INTO board VALUES(?,?,?,?)');for(const m of JSON.parse(readFileSync(join(root,'junta.json'))))ins.run(m.id,m.name,m.role,hash(boardKey(m.id,'JUNTA-DEMO')));}
if(!demo&&db.prepare('SELECT COUNT(*) n FROM board').get().n<2)throw Error('Genera las claves de la junta con: node claves-junta.mjs');
const candidatePhotos=()=>{try{return readdirSync(join(root,'public','candidatas')).filter(f=>/^\d{2}\.jpg$/.test(f)).map(f=>f.slice(0,2));}catch{return [];}};
const boardList=()=>db.prepare('SELECT id,name,role FROM board ORDER BY rowid').all();
/* Firmas de cierre: cada integrante de la junta firma después del escrutinio; las actas se descargan con todas. */
const boardSigs=()=>db.prepare('SELECT b.id,b.name,b.role,s.strokes,s.signed_at FROM board b LEFT JOIN board_signatures s ON s.member=b.id ORDER BY b.rowid').all().map(m=>({id:m.id,name:m.name,role:m.role,signedAt:m.signed_at||null,strokes:m.strokes?JSON.parse(m.strokes):null}));
/* Resultados del escrutinio (también para quien entra después de abierto). */
const escData=(openedBy,openedAt)=>({demo,openedBy:openedBy.map(m=>({name:m.name,role:m.role})),openedAt,board:boardList(),signatures:boardSigs(),elections:cfg.elections.map(e=>({id:e.id,title:e.title,eligible:db.prepare('SELECT eligible FROM voters').all().filter(v=>JSON.parse(v.eligible).includes(e.id)).length,participation:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,results:results(e)}))});
const lastSeen=new Map();
function member(k){
 if(demo&&typeof k==='string'&&equal(k,admin))return {id:'demo',name:'Clave temporal',role:'Prueba'};
 if(!k||typeof k!=='object'||typeof k.member!=='string'||typeof k.key!=='string')return null;
 const m=db.prepare('SELECT id,name,role,key_hash FROM board WHERE id=?').get(k.member);
 return m&&equal(hash(boardKey(m.id,k.key)),m.key_hash)?m:null;
}
function results(e){const rows=db.prepare('SELECT selection FROM ballots WHERE election=?').all(e.id).map(b=>JSON.parse(b.selection));return {total:rows.length,blank:rows.filter(r=>!r.length).length,candidates:e.candidates.map(c=>({id:c.id,number:c.number,name:c.name,votes:rows.filter(r=>r.includes(c.id)).length}))};}
if(demo&&!db.prepare('SELECT COUNT(*) n FROM voters').get().n){db.prepare("INSERT OR IGNORE INTO voters(code_hash,employee,eligible,name) VALUES(?,?,?,'Trabajador de prueba')").run(hash(credential('12345678','DEMO-2026')),'12345678','["sst","hs"]');console.log('Ingreso de prueba: DNI 12345678 · código DEMO-2026\nJunta de prueba: elige cualquier integrante · clave JUNTA-DEMO');}
/* Completa los nombres del panel de la junta con padron.xlsx (no agrega ni quita trabajadores). */
for(const f of ['padron.xlsx','padron.csv'])if(existsSync(join(root,f))){try{const set=db.prepare("UPDATE voters SET name=? WHERE employee=? AND name=''");let n=0;for(const r of loadPadron(join(root,f),cfg.elections).rows)if(r.name)n+=Number(set.run(r.name,r.employee).changes);if(n)console.log('Nombres cargados desde '+f+': '+n+'.');}catch(e){console.log('No se pudieron leer los nombres de '+f+': '+e.message);}break;}
db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('SERVER_START',new Date().toISOString());
const sessions=new Map(),attempts=new Map();
/* Publicación con Cloudflare Tunnel: todo llega desde 127.0.0.1, así que la IP real viene en CF-Connecting-IP. */
const tunnel=process.env.TRUST_CLOUDFLARE==='1';
const clientIp=req=>tunnel&&req.headers['cf-connecting-ip']?String(req.headers['cf-connecting-ip']):req.socket.remoteAddress;
const sameOrigin=(req,origin)=>{const h=new URL(origin).host;return h===req.headers.host||(tunnel&&(h===req.headers['x-forwarded-host']||/\.trycloudflare\.com$/.test(h)||h===process.env.PUBLIC_HOST));};
/* Respaldo de la base cada 15 minutos (copia consistente con VACUUM INTO). */
const backupDir=join(root,'data','respaldos');mkdirSync(backupDir,{recursive:true});
function backup(){try{const f=join(backupDir,(demo?'demo-':'eleccion-')+new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')+'.sqlite');if(!existsSync(f)){db.exec("VACUUM INTO '"+f.replace(/'/g,"''")+"'");console.log('Respaldo guardado: '+f);}}catch(e){console.error('No se pudo guardar el respaldo: '+e.message);}}
backup();setInterval(backup,15*60000).unref();
const demoElections=cfg.elections.map(e=>({...e,ready:true,pendingReason:undefined}));
/* En modo prueba la votación está siempre abierta, salvo que la junta simule el cierre desde su panel. */
let demoClosedAt=null;
const clock=()=>demo?{...cfg,elections:demoElections,opens:'2020-01-01T00:00:00Z',closes:demoClosedAt||'2099-01-01T00:00:00Z'}:cfg;
const phase=()=>{const c=clock(),n=Date.now();return n<Date.parse(c.opens)?'antes':n>=Date.parse(c.closes)?'cerrada':'abierta';};
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function guard(key,max=30){const v=attempts.get(key);if(v&&v.end>Date.now()&&v.n>=max)throw Error('Demasiados intentos. Espera 15 minutos.');}
function fail(key){const old=attempts.get(key);const v=old&&old.end>Date.now()?old:{n:0,end:Date.now()+900000};v.n++;attempts.set(key,v);}
setInterval(()=>{for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);for(const [k,v] of attempts)if(v.end<Date.now())attempts.delete(k);},60000).unref();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const send=(s,d)=>{res.writeHead(s,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(d));};
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){res.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});return res.end(readFileSync(join(root,'public',path==='/'?'index.html':path.slice(1))));}
  const assets={'/portada-corregida.png':'image/png','/portada-image-health.jpg':'image/jpeg','/logo.png':'image/png','/equipo.jpg':'image/jpeg','/salud.jpg':'image/jpeg','/sst.jpg':'image/jpeg','/hs.jpg':'image/jpeg','/membrete.jpg':'image/jpeg','/fonts/jakarta.woff2':'font/woff2','/fonts/fraunces.woff2':'font/woff2','/fonts/fraunces-italic.woff2':'font/woff2'};
  /* Fotos de candidaturas: public/candidatas/NN.jpg (NN = número de candidatura). */
  if(req.method==='GET'&&/^\/candidatas\/\d{2}\.jpg$/.test(path)&&existsSync(join(root,'public',path.slice(1)))){res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'max-age=300'});return res.end(readFileSync(join(root,'public',path.slice(1))));}
  if(req.method==='GET'&&assets[path]){res.writeHead(200,{'Content-Type':assets[path]});return res.end(readFileSync(join(root,'public',path.slice(1))));}
  if(req.method==='GET'&&path==='/api/config')return send(200,{...cfg,elections:demo?demoElections:cfg.elections,...(demo&&demoClosedAt?{closes:demoClosedAt}:{}),board:boardList(),photos:candidatePhotos(),serverTime:new Date().toISOString()});
  if(req.method!=='POST')return send(404,{error:'No encontrado.'});
  if(req.headers['content-type']!=='application/json')return send(415,{error:'Formato inválido.'});
  if(req.headers.origin&&!sameOrigin(req,req.headers.origin))return send(403,{error:'Origen inválido.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>250000)return send(413,{error:'Solicitud demasiado grande.'});}
  const body=JSON.parse(raw);
  if(path==='/api/login'){
   const lk='login:'+clientIp(req);guard(lk);
   const dni=normalizeDni(body.dni);
   if(typeof body.dni!=='string'||typeof body.code!=='string'||!/^\d{8}$/.test(dni)){fail(lk);return send(401,{error:'Escribe tu DNI de 8 dígitos y tu código personal.'});}
   const dk='dni:'+dni;try{guard(dk,10);}catch(e){fail(lk);throw e;}
   const key=credential(dni,body.code);
   if(!db.prepare('SELECT 1 FROM voters WHERE code_hash=? AND employee=?').get(hash(key),dni)){fail(lk);fail(dk);return send(401,{error:'DNI o código incorrecto.'});}
   if(!Array.isArray(body.reviewed)||!['sst','hs'].every(id=>body.reviewed.includes(id)))return send(403,{error:'Primero confirma la lectura de ambos comités.'});
   const token=randomBytes(32).toString('hex');sessions.set(token,{code:key,expires:Date.now()+1800000});return send(200,{token});
  }
  if(path==='/api/admin'||path==='/api/admin-receipt'||path==='/api/junta-firmas'||path==='/api/junta-firmar'||path==='/api/demo-cierre'||path==='/api/admin-signatures'||path==='/api/escrutinio'){
   const ak='admin:'+clientIp(req);guard(ak);
   const who=member(body.key);
   if(!who){fail(ak);return send(401,{error:demo?'Clave incorrecta. En modo prueba la clave de la junta es JUNTA-DEMO (no es el código de los trabajadores).':'Clave incorrecta para ese integrante. Revisa la tarjeta de tu clave personal.'});}
   if(path==='/api/admin'&&!(lastSeen.get(who.id)>Date.now()-600000)){lastSeen.set(who.id,Date.now());db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('JUNTA_INGRESO '+who.role+' · '+who.name,new Date().toISOString());}
   if(path==='/api/escrutinio'){
    const second=member(body.second);
    if(!second){fail(ak);return send(401,{error:'La clave del segundo integrante es incorrecta.'});}
    if(second.id===who.id)return send(400,{error:'Se necesitan dos integrantes distintos de la junta.'});
    if(!demo&&Date.now()<Date.parse(cfg.closes))return send(400,{error:'El escrutinio se abre después del cierre de la votación.'});
    db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('ESCRUTINIO_ABIERTO '+who.role+' + '+second.role,new Date().toISOString());
    return send(200,escData([who,second],new Date().toISOString()));
   }
   if(path==='/api/junta-firmas')return send(200,{signatures:boardSigs()});
   if(path==='/api/junta-firmar'){
    if(who.id==='demo')return send(400,{error:'Firma con la clave personal de un integrante de la junta.'});
    if(!demo&&phase()!=='cerrada')return send(400,{error:'La junta firma después del cierre de la votación.'});
    if(!db.prepare("SELECT 1 FROM audit WHERE event LIKE 'ESCRUTINIO_ABIERTO%'").get())return send(400,{error:'Primero abran el escrutinio con dos integrantes.'});
    if(body.accepted!==true)return send(400,{error:'Marca la casilla de conformidad para firmar.'});
    if(db.prepare('SELECT 1 FROM board_signatures WHERE member=?').get(who.id))return send(400,{error:who.role+' ya firmó.'});
    let strokes;try{strokes=checkStrokes(body.strokes);}catch(e){return send(400,{error:e.message});}
    const at=new Date().toISOString();db.prepare('INSERT INTO board_signatures(member,strokes,signed_at) VALUES(?,?,?)').run(who.id,JSON.stringify(strokes),at);
    db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('JUNTA_FIRMA '+who.role+' · '+who.name,at);
    return send(200,{signatures:boardSigs()});
   }
   if(path==='/api/demo-cierre'){if(!demo)return send(403,{error:'Solo disponible en modo prueba.'});demoClosedAt=body.closed===true?new Date().toISOString():null;if(!demoClosedAt)db.exec('DELETE FROM board_signatures');db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run((demoClosedAt?'PRUEBA_CIERRE_SIMULADO ':'PRUEBA_REAPERTURA ')+who.role+' · '+who.name,new Date().toISOString());return send(200,{closed:!!demoClosedAt});}
   if(path==='/api/admin-signatures'){db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('LISTA_FIRMAS_DESCARGADA '+who.role+' · '+who.name,new Date().toISOString());return send(200,{company:cfg.company,period:cfg.period,demo,generatedAt:new Date().toISOString(),elections:cfg.elections.map(e=>({id:e.id,title:e.title,voted:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,signatures:db.prepare('SELECT payload,checksum FROM signatures WHERE election=?').all(e.id).map(r=>{const x=JSON.parse(r.payload);return{employee:x.employee,signerName:x.signerName,signedAt:x.signedAt,strokes:x.strokes,checksum:r.checksum};}).sort((a,b)=>a.signedAt.localeCompare(b.signedAt))}))});}
   if(path==='/api/admin-receipt'){const v=db.prepare('SELECT code_hash FROM voters WHERE employee=?').get(body.employee);const row=v&&db.prepare('SELECT payload,checksum FROM signatures WHERE code_hash=? AND election=?').get(v.code_hash,body.election);if(!row)return send(404,{error:'Constancia no encontrada.'});return send(200,{...JSON.parse(row.payload),checksum:row.checksum});}
   const closed=demo?!!demoClosedAt:Date.now()>=Date.parse(cfg.closes);
   const voters=db.prepare('SELECT code_hash,employee,eligible,name FROM voters ORDER BY employee').all().map(v=>({employee:v.employee,name:v.name||'',signed:db.prepare('SELECT election FROM signatures WHERE code_hash=?').all(v.code_hash).map(s=>s.election),eligible:JSON.parse(v.eligible),voted:db.prepare('SELECT election FROM participation WHERE code_hash=?').all(v.code_hash).map(p=>p.election)}));
   const opened=db.prepare("SELECT event,time FROM audit WHERE event LIKE 'ESCRUTINIO_ABIERTO%' ORDER BY id DESC").get(),roles=opened?opened.event.replace('ESCRUTINIO_ABIERTO ','').split(' + '):[];
   return send(200,{demo,closed,member:{name:who.name,role:who.role},escOpened:!!opened,escrutinio:opened&&(closed||demo)?escData(roles.map(r=>boardList().find(m=>m.role===r)||{name:'',role:r}),opened.time):null,signatures:boardSigs(),voters,elections:cfg.elections.map(e=>({id:e.id,title:e.title,eligible:db.prepare('SELECT eligible FROM voters').all().filter(v=>JSON.parse(v.eligible).includes(e.id)).length,participation:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,results:null})),events:db.prepare('SELECT event,time FROM audit ORDER BY id').all()});
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,''),session=sessions.get(token);
  if(!session||session.expires<Date.now()){sessions.delete(token);return send(401,{error:'Sesión vencida. Ingresa nuevamente.'});}
  if(path==='/api/logout'){sessions.delete(token);return send(200,{ok:true});}
  if(path==='/api/sign')return send(200,signParticipation(db,cfg,session.code,body));
  if(path==='/api/receipt'){const row=db.prepare('SELECT payload,checksum FROM signatures WHERE code_hash=? AND election=?').get(hash(session.code),body.election);if(!row)return send(404,{error:'Constancia no encontrada.'});return send(200,{...JSON.parse(row.payload),checksum:row.checksum});}
  if(path==='/api/status')return send(200,{phase:phase(),signed:db.prepare('SELECT election FROM signatures WHERE code_hash=?').all(hash(session.code)).map(s=>s.election),eligible:JSON.parse(db.prepare('SELECT eligible FROM voters WHERE code_hash=?').get(hash(session.code)).eligible),voted:db.prepare('SELECT election FROM participation WHERE code_hash=?').all(hash(session.code)).map(v=>v.election)});
  if(path==='/api/vote'){
  if(phase()!=='abierta')return send(400,{error:'La votación está cerrada.'});
   const unsigned=db.prepare('SELECT p.election FROM participation p LEFT JOIN signatures s ON s.code_hash=p.code_hash AND s.election=p.election WHERE p.code_hash=? AND s.code_hash IS NULL').get(hash(session.code));
   if(unsigned)return send(400,{error:'Primero firma la constancia de tu voto anterior ('+((cfg.elections.find(e=>e.id===unsigned.election)||{}).title||unsigned.election)+').'});
   vote(db,clock(),session.code,body.election,body.selection);return send(200,{ok:true});}
  send(404,{error:'No encontrado.'});
 }catch(err){send(400,{error:err.code?'No se pudo completar la operación.':err.message});}
});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Aplicación: http://127.0.0.1:'+(process.env.PORT||8787)+(tunnel?' · modo túnel Cloudflare activo':'')));
