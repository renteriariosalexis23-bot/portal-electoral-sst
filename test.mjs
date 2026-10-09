import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDB,hash,vote} from './core.mjs';
const cfg={opens:'2026-11-02T09:00:00-05:00',closes:'2026-11-02T16:00:00-05:00',elections:[{id:'sst',total:1,groups:{},candidates:[{id:'a',group:''}]},{id:'hs',total:2,groups:{Mujer:1,Hombre:1},candidates:[{id:'m',group:'Mujer'},{id:'m2',group:'Mujer'},{id:'h',group:'Hombre'}]}]};
const now=Date.parse('2026-11-02T15:00:00Z');
function setup(eligible=['sst','hs']){const db=openDB(':memory:');db.prepare('INSERT INTO voters VALUES(?,?,?)').run(hash('secret'),'worker',JSON.stringify(eligible));return db;}
test('solo un voto por comité, independiente de la otra elección',()=>{const db=setup();vote(db,cfg,'secret','sst',['a'],now);assert.throws(()=>vote(db,cfg,'secret','sst',['a'],now),/Ya registraste/);vote(db,cfg,'secret','hs',['m','h'],now);assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,2);db.close();});
test('rechaza fuera de horario y cierra exactamente a las 16:00',()=>{const db=setup();for(const time of [Date.parse(cfg.opens)-1,Date.parse(cfg.closes)])assert.throws(()=>vote(db,cfg,'secret','sst',[],time),/cerrada/);vote(db,cfg,'secret','sst',[],Date.parse(cfg.opens));db.close();});
test('rechaza candidaturas ajenas, duplicadas y selección inválida sin registrar participación',()=>{const db=setup();for(const s of [['wrong'],['a','a'],['m','m2']])assert.throws(()=>vote(db,cfg,'secret',s[0]==='m'?'hs':'sst',s,now));assert.equal(db.prepare('SELECT COUNT(*) n FROM participation').get().n,0);db.close();});
test('respeta elegibilidad por comité y credenciales',()=>{const db=setup(['sst']);assert.throws(()=>vote(db,cfg,'secret','hs',[],now),/habilitado/);assert.throws(()=>vote(db,cfg,'wrong','sst',[],now),/habilitado/);db.close();});
test('revierte papeleta si falla el registro de participación',()=>{const db=setup();db.exec("CREATE TRIGGER fail BEFORE INSERT ON participation BEGIN SELECT RAISE(ABORT,'forced'); END");assert.throws(()=>vote(db,cfg,'secret','sst',['a'],now));assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,0);db.close();});
test('papeletas sin campos de identidad, IP, correo ni hora',()=>{const db=setup();assert.deepEqual(db.prepare('PRAGMA table_info(ballots)').all().map(c=>c.name),['id','election','selection']);db.close();});

test('HTTP: autenticación, emisión, duplicado, panel protegido y cierre de sesión',async()=>{
 const {mkdtempSync,cpSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const {spawn}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'ih-election-test-'));
 for(const name of ['server.mjs','core.mjs','config.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const key='test-only-key-abcdefghijklmnopqrstuvwxyz';
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18787',ADMIN_KEY:key},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:')){clearTimeout(timeout);resolve();}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});});
  const api=async(path,body={},token='')=>{const r=await fetch('http://127.0.0.1:18787/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  assert.equal((await api('status')).status,401);
  assert.equal((await api('login',{code:'invalid'})).status,401);
  const auth=await api('login',{code:'DEMO-2026'});assert.equal(auth.status,200);const token=auth.data.token;
  assert.equal((await api('vote',{election:'sst',selection:['s1','s2']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted,[]);
  assert.equal((await api('vote',{election:'sst',selection:['s1']},token)).status,200);
  assert.equal((await api('vote',{election:'sst',selection:['s1']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted,['sst']);
  assert.equal((await api('sign',{election:'hs',name:'Persona de prueba',accepted:true,strokes:[[[0.1,0.1],[0.8,0.7]]]},token)).status,400);
assert.equal((await api('vote',{election:'hs',selection:['h1']},token)).status,200);
  assert.equal((await api('vote',{election:'hs',selection:['h2']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted.sort(),['hs','sst']);
  assert.equal((await api('admin',{key:'wrong'})).status,401);
  const report=(await api('admin',{key})).data;assert.equal(report.elections[0].participation,1);assert.deepEqual(report.voters,[{employee:'PERSONA-DEMO',signed:[],eligible:['sst','hs'],voted:['hs','sst']}].map(v=>({...v,voted:report.voters[0].voted})));assert.deepEqual([...report.voters[0].voted].sort(),['hs','sst']);assert.equal(JSON.stringify(report.voters).includes('selection'),false);assert.equal(JSON.stringify(report.voters).includes('code_hash'),false);
  if(Date.now()<Date.parse('2026-11-02T16:00:00-05:00'))assert.equal(report.elections[0].results,null);
  const signature={election:'sst',name:'Persona de prueba',accepted:true,strokes:[[[0.1,0.1],[0.8,0.7]]]};
assert.equal((await api('sign',{...signature,accepted:false},token)).status,400);
assert.equal((await api('sign',{...signature,strokes:[]},token)).status,400);
const signed=await api('sign',signature,token);assert.equal(signed.status,200);assert.equal(signed.data.employee,'PERSONA-DEMO');assert.equal(signed.data.selection,undefined);
assert.equal((await api('sign',signature,token)).status,400);
assert.deepEqual((await api('status',{},token)).data.signed,['sst']);
assert.equal((await api('admin-receipt',{key:'wrong',employee:'PERSONA-DEMO',election:'sst'})).status,401);
const receipt=(await api('admin-receipt',{key,employee:'PERSONA-DEMO',election:'sst'})).data;assert.equal(receipt.id,signed.data.id);
assert.equal((await api('receipt',{election:'sst'},token)).data.id,receipt.id);
await api('logout',{},token);assert.equal((await api('status',{},token)).status,401);
 }finally{
  const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;rmSync(dir,{recursive:true,force:true});
 }
});

test('cédula pendiente rechaza incluso voto en blanco',()=>{const db=setup();const pending={...cfg,elections:cfg.elections.map(e=>({...e,ready:false}))};assert.throws(()=>vote(db,pending,'secret','sst',[],now),/pendiente/);assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,0);db.close();});