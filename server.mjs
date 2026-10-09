import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {openDB,hash,vote,signParticipation} from './core.mjs';
const root=dirname(fileURLToPath(import.meta.url)),cfg=JSON.parse(readFileSync(join(root,'config.json')));
const demo=cfg.mode==='demo';
if(!demo&&(!cfg.approved||!process.env.ADMIN_KEY||process.env.ADMIN_KEY.length<32))throw Error('Se requiere configuración aprobada y ADMIN_KEY de 32 caracteres como mínimo.');
mkdirSync(join(root,'data'),{recursive:true});
const db=openDB(join(root,'data',demo?'demo-seleccion-unica.sqlite':'election.sqlite'));
const saved=db.prepare('SELECT value FROM config WHERE id=1').get();
if(saved&&saved.value!==JSON.stringify(cfg))throw Error('La configuración cambió después de inicializar la base. Revisa el README antes de continuar.');
db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(cfg));
const admin=process.env.ADMIN_KEY||randomBytes(32).toString('hex');
if(demo){db.prepare('INSERT OR IGNORE INTO voters VALUES(?,?,?)').run(hash('DEMO-2026'),'PERSONA-DEMO','["sst","hs"]');console.log('Credencial de prueba: DEMO-2026\nClave de junta para esta sesión: '+admin);}
db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('SERVER_START',new Date().toISOString());
const sessions=new Map(),attempts=new Map();
const demoElections=cfg.elections.map(e=>({...e,ready:true,pendingReason:undefined}));
const clockConfig=demo?{...cfg,elections:demoElections,opens:'2020-01-01T00:00:00Z',closes:'2099-01-01T00:00:00Z'}:cfg;
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function guard(key){const v=attempts.get(key);if(v&&v.end>Date.now()&&v.n>=30)throw Error('Demasiados intentos. Espera 15 minutos.');}
function fail(key){const old=attempts.get(key);const v=old&&old.end>Date.now()?old:{n:0,end:Date.now()+900000};v.n++;attempts.set(key,v);}
setInterval(()=>{for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);for(const [k,v] of attempts)if(v.end<Date.now())attempts.delete(k);},60000).unref();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const send=(s,d)=>{res.writeHead(s,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(d));};
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){res.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});return res.end(readFileSync(join(root,'public',path==='/'?'index.html':path.slice(1))));}
  const assets={'/logo.png':'image/png','/equipo.jpg':'image/jpeg','/salud.jpg':'image/jpeg'};
  if(req.method==='GET'&&assets[path]){res.writeHead(200,{'Content-Type':assets[path]});return res.end(readFileSync(join(root,'public',path.slice(1))));}
  if(req.method==='GET'&&path==='/api/config')return send(200,{...cfg,elections:demo?demoElections:cfg.elections,serverTime:new Date().toISOString()});
  if(req.method!=='POST')return send(404,{error:'No encontrado.'});
  if(req.headers['content-type']!=='application/json')return send(415,{error:'Formato inválido.'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'Origen inválido.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>250000)return send(413,{error:'Solicitud demasiado grande.'});}
  const body=JSON.parse(raw);
  if(path==='/api/login'){
   const lk='login:'+req.socket.remoteAddress;guard(lk);
   if(typeof body.code!=='string'||!db.prepare('SELECT 1 FROM voters WHERE code_hash=?').get(hash(body.code))){fail(lk);return send(401,{error:'Credencial inválida.'});}
   const token=randomBytes(32).toString('hex');sessions.set(token,{code:body.code,expires:Date.now()+1800000});return send(200,{token});
  }
  if(path==='/api/admin'||path==='/api/admin-receipt'){
   const ak='admin:'+req.socket.remoteAddress;guard(ak);
   if(typeof body.key!=='string'||!equal(body.key,admin)){fail(ak);return send(401,{error:'Clave incorrecta.'});}
   if(path==='/api/admin-receipt'){const v=db.prepare('SELECT code_hash FROM voters WHERE employee=?').get(body.employee);const row=v&&db.prepare('SELECT payload,checksum FROM signatures WHERE code_hash=? AND election=?').get(v.code_hash,body.election);if(!row)return send(404,{error:'Constancia no encontrada.'});return send(200,{...JSON.parse(row.payload),checksum:row.checksum});}
   const closed=Date.now()>=Date.parse(cfg.closes);
   const voters=db.prepare('SELECT code_hash,employee,eligible FROM voters ORDER BY employee').all().map(v=>({employee:v.employee,signed:db.prepare('SELECT election FROM signatures WHERE code_hash=?').all(v.code_hash).map(s=>s.election),eligible:JSON.parse(v.eligible),voted:db.prepare('SELECT election FROM participation WHERE code_hash=?').all(v.code_hash).map(p=>p.election)}));
   return send(200,{demo,closed,voters,elections:cfg.elections.map(e=>({id:e.id,title:e.title,eligible:db.prepare('SELECT eligible FROM voters').all().filter(v=>JSON.parse(v.eligible).includes(e.id)).length,participation:db.prepare('SELECT COUNT(*) n FROM participation WHERE election=?').get(e.id).n,results:closed?{blank:db.prepare("SELECT COUNT(*) n FROM ballots WHERE election=? AND selection='[]'").get(e.id).n,candidates:e.candidates.map(c=>({name:c.name,votes:db.prepare('SELECT selection FROM ballots WHERE election=?').all(e.id).filter(b=>JSON.parse(b.selection).includes(c.id)).length}))}:null})),events:db.prepare('SELECT event,time FROM audit ORDER BY id').all()});
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
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Aplicación: http://127.0.0.1:'+(process.env.PORT||8787)));
