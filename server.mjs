import http from 'node:http';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {openDB,hash,vote,signParticipation} from './core.mjs';
import {credential,normalizeDni,boardKey} from './padron.mjs';
const root=dirname(fileURLToPath(import.meta.url)),cfg=JSON.parse(readFileSync(join(root,'config.json')));
const demo=cfg.mode==='demo';
if(!demo&&!cfg.approved)throw Error('Se requiere configuración aprobada (approved: true).');
mkdirSync(join(root,'data'),{recursive:true});
const db=openDB(join(root,'data',demo?'demo-dni.sqlite':'election.sqlite'));
const saved=db.prepare('SELECT value FROM config WHERE id=1').get();
if(saved&&saved.value!==JSON.stringify(cfg))throw Error('La configuración cambió después de inicializar la base. Revisa el README antes de continuar.');
db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(cfg));
const admin=process.env.ADMIN_KEY||randomBytes(32).toString('hex');
/* Junta: una clave por integrante (claves-junta.mjs). En demo se crean con la clave JUNTA-DEMO. */
if(demo&&!db.prepare('SELECT COUNT(*) n FROM board').get().n&&existsSync(join(root,'junta.json'))){const ins=db.prepare('INSERT INTO board VALUES(?,?,?,?)');for(const m of JSON.parse(readFileSync(join(root,'junta.json'))))ins.run(m.id,m.name,m.role,hash(boardKey(m.id,'JUNTA-DEMO')));}
if(!demo&&db.prepare('SELECT COUNT(*) n FROM board').get().n<2)throw Error('Genera las claves de la junta con: node claves-junta.mjs');
const boardList=()=>db.prepare('SELECT id,name,role FROM board ORDER BY rowid').all();
const lastSeen=new Map();
function member(k){
 if(demo&&typeof k==='string'&&equal(k,admin))return {id:'demo',name:'Clave temporal',role:'Prueba'};
 if(!k||typeof k!=='object'||typeof k.member!=='string'||typeof k.key!=='string')return null;
 const m=db.prepare('SELECT id,name,role,key_hash FROM board WHERE id=?').get(k.member);
 return m&&equal(hash(boardKey(m.id,k.key)),m.key_hash)?m:null;
}
function results(e){const rows=db.prepare('SELECT selection FROM ballots WHERE election=?').all(e.id).map(b=>JSON.parse(b.selection));return {total:rows.length,blank:rows.filter(r=>!r.length).length,candidates:e.candidates.map(c=>({id:c.id,number:c.number,name:c.name,votes:rows.filter(r=>r.includes(c.id)).length}))};}
if(demo){db.prepare('INSERT OR IGNORE INTO voters VALUES(?,?,?)').run(hash(credential('12345678','DEMO-2026')),'12345678','["sst","hs"]');console.log('Ingreso de prueba: DNI 12345678 · código DEMO-2026\nJunta de prueba: elige cualquier integrante · clave JUNTA-DEMO');}
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
const clockConfig=demo?{...cfg,elections:demoElections,opens:'2020-01-01T00:00:00Z',closes:'2099-01-01T00:00:00Z'}:cfg;
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
  const assets={'/portada-corregida.png':'image/png','/portada-image-health.jpg':'image/jpeg','/logo.png':'image/png','/equipo.jpg':'image/jpeg','/salud.jpg':'image/jpeg','/sst.jpg':'image/jpeg','/hs.jpg':'image/jpeg','/fonts/jakarta.woff2':'font/woff2','/fonts/fraunces.woff2':'font/woff2','/fonts/fraunces-italic.woff2':'font/woff2'};
  if(req.method==='GET'&&assets[path]){res.writeHead(200,{'Content-Type':assets[path]});return res.end(readFileSync(join(root,'public',path.slice(1))));}
  if(req.method==='GET'&&path==='/api/config')return send(200,{...cfg,elections:demo?demoElections:cfg.elections,board:boardList(),serverTime:new Date().toISOString()});
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
  if(path==='/api/admin'||path==='/api/admin-receipt'||path==='/api/escrutinio'){
   const ak='admin:'+clientIp(req);guard(ak);
   const who=member(body.key);
   if(!who){fail(ak);return send(401,{error:'Integrante o clave incorrecta.'});}
   if(path==='/api/admin'&&!(lastSeen.get(who.id)>Date.now()-600000)){lastSeen.set(who.id,Date.now());db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('JUNTA_INGRESO '+who.role+' · '+who.name,new Date().toISOString());}
   if(path==='/api/escrutinio'){
    const second=member(body.second);
    if(!second){fail(ak);return send(401,{error:'La clave del segundo integrante es incorrecta.'});}
    if(second.id===who.id)return send(400,{error:'Se necesitan dos integrantes distintos de la junta.'});
    if(!demo&&Date.now()<Date.parse(cfg.closes))return send(400,{error:'El escrutinio se abre después del cierre de la votación.'});
    db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('ESCRUTINIO_ABIERTO '+who.role+' + '+second.role,new Date().toISOString());
    return send(200,{demo,openedBy:[who,second].map(m=>({name:m.name,role:m.role})),openedAt:new Date().toISOString(),board:boardList(),elections:cfg.elections.map(e=>({id:e.id,title:e.title,eligible:db.prepare('SELECT eligible FROM voters').all().filter(v=>JSON.parse(v.eligible).includes(e.id)).length,participation:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,results:results(e)}))});
   }
   if(path==='/api/admin-receipt'){const v=db.prepare('SELECT code_hash FROM voters WHERE employee=?').get(body.employee);const row=v&&db.prepare('SELECT payload,checksum FROM signatures WHERE code_hash=? AND election=?').get(v.code_hash,body.election);if(!row)return send(404,{error:'Constancia no encontrada.'});return send(200,{...JSON.parse(row.payload),checksum:row.checksum});}
   const closed=Date.now()>=Date.parse(cfg.closes);
   const voters=db.prepare('SELECT code_hash,employee,eligible FROM voters ORDER BY employee').all().map(v=>({employee:v.employee,signed:db.prepare('SELECT election FROM signatures WHERE code_hash=?').all(v.code_hash).map(s=>s.election),eligible:JSON.parse(v.eligible),voted:db.prepare('SELECT election FROM participation WHERE code_hash=?').all(v.code_hash).map(p=>p.election)}));
   return send(200,{demo,closed,member:{name:who.name,role:who.role},voters,elections:cfg.elections.map(e=>({id:e.id,title:e.title,eligible:db.prepare('SELECT eligible FROM voters').all().filter(v=>JSON.parse(v.eligible).includes(e.id)).length,participation:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,results:null})),events:db.prepare('SELECT event,time FROM audit ORDER BY id').all()});
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,''),session=sessions.get(token);
  if(!session||session.expires<Date.now()){sessions.delete(token);return send(401,{error:'Sesión vencida. Ingresa nuevamente.'});}
  if(path==='/api/logout'){sessions.delete(token);return send(200,{ok:true});}
  if(path==='/api/sign')return send(200,signParticipation(db,cfg,session.code,body));
  if(path==='/api/receipt'){const row=db.prepare('SELECT payload,checksum FROM signatures WHERE code_hash=? AND election=?').get(hash(session.code),body.election);if(!row)return send(404,{error:'Constancia no encontrada.'});return send(200,{...JSON.parse(row.payload),checksum:row.checksum});}
  if(path==='/api/status')return send(200,{signed:db.prepare('SELECT election FROM signatures WHERE code_hash=?').all(hash(session.code)).map(s=>s.election),eligible:JSON.parse(db.prepare('SELECT eligible FROM voters WHERE code_hash=?').get(hash(session.code)).eligible),voted:db.prepare('SELECT election FROM participation WHERE code_hash=?').all(hash(session.code)).map(v=>v.election)});
  if(path==='/api/vote'){vote(db,clockConfig,session.code,body.election,body.selection);return send(200,{ok:true});}
  send(404,{error:'No encontrado.'});
 }catch(err){send(400,{error:err.code?'No se pudo completar la operación.':err.message});}
});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Aplicación: http://127.0.0.1:'+(process.env.PORT||8787)+(tunnel?' · modo túnel Cloudflare activo':'')));
