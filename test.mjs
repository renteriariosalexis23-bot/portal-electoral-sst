import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDB,hash,vote} from './core.mjs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rmSync} from 'node:fs';
const cfg={opens:'2026-11-02T09:00:00-05:00',closes:'2026-11-02T16:00:00-05:00',elections:[{id:'sst',total:1,groups:{},candidates:[{id:'a',group:''}]},{id:'hs',total:2,groups:{Mujer:1,Hombre:1},candidates:[{id:'m',group:'Mujer'},{id:'m2',group:'Mujer'},{id:'h',group:'Hombre'}]}]};
const now=Date.parse('2026-11-02T15:00:00Z');
function setup(eligible=['sst','hs']){const db=openDB(':memory:');db.prepare('INSERT INTO voters(code_hash,employee,eligible) VALUES(?,?,?)').run(hash('secret'),'worker',JSON.stringify(eligible));return db;}
test('solo un voto por comité, independiente de la otra elección',()=>{const db=setup();vote(db,cfg,'secret','sst',['a'],now);assert.throws(()=>vote(db,cfg,'secret','sst',['a'],now),/Ya registraste/);vote(db,cfg,'secret','hs',['m','h'],now);assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,2);db.close();});
test('agrega la columna de nombre a una base antigua sin perder trabajadores',()=>{const f=join(tmpdir(),'old-'+Date.now()+'.sqlite');const o=new DatabaseSync(f);o.exec('CREATE TABLE voters(code_hash TEXT PRIMARY KEY,employee TEXT UNIQUE NOT NULL,eligible TEXT NOT NULL)');o.prepare('INSERT INTO voters VALUES(?,?,?)').run('h','11111111','["sst"]');o.close();const db=openDB(f);assert.deepEqual({...db.prepare('SELECT employee,name FROM voters').get()},{employee:'11111111',name:''});db.close();rmSync(f);});
test('rechaza fuera de horario y cierra exactamente a las 16:00',()=>{const db=setup();for(const time of [Date.parse(cfg.opens)-1,Date.parse(cfg.closes)])assert.throws(()=>vote(db,cfg,'secret','sst',[],time),/cerrada/);vote(db,cfg,'secret','sst',['a'],Date.parse(cfg.opens));db.close();});
test('rechaza candidaturas ajenas, duplicadas y selección inválida sin registrar participación',()=>{const db=setup();for(const s of [['wrong'],['a','a'],['m','m2']])assert.throws(()=>vote(db,cfg,'secret',s[0]==='m'?'hs':'sst',s,now));assert.equal(db.prepare('SELECT COUNT(*) n FROM participation').get().n,0);db.close();});
test('respeta elegibilidad por comité y credenciales',()=>{const db=setup(['sst']);assert.throws(()=>vote(db,cfg,'secret','hs',['m','h'],now),/habilitado/);assert.throws(()=>vote(db,cfg,'wrong','sst',['a'],now),/habilitado/);db.close();});
test('revierte papeleta si falla el registro de participación',()=>{const db=setup();db.exec("CREATE TRIGGER fail BEFORE INSERT ON participation BEGIN SELECT RAISE(ABORT,'forced'); END");assert.throws(()=>vote(db,cfg,'secret','sst',['a'],now));assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,0);db.close();});
test('papeletas sin campos de identidad, IP, correo ni hora',()=>{const db=setup();assert.deepEqual(db.prepare('PRAGMA table_info(ballots)').all().map(c=>c.name),['id','election','selection']);db.close();});

test('HTTP: autenticación, emisión, duplicado, panel protegido y cierre de sesión',async()=>{
 const {mkdtempSync,cpSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const {spawn}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'ih-election-test-'));
 for(const name of ['server.mjs','core.mjs','padron.mjs','junta.json','config.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const key='test-only-key-abcdefghijklmnopqrstuvwxyz';
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18787',ADMIN_KEY:key},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:')){clearTimeout(timeout);resolve();}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});});
  const api=async(path,body={},token='')=>{const r=await fetch('http://127.0.0.1:18787/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  assert.equal((await api('status')).status,401);
  assert.equal((await api('login',{dni:'12345678',code:'invalid'})).status,401);
  assert.equal((await api('login',{dni:'12345678',code:'demo2026'})).status,403);
  assert.equal((await api('login',{dni:'12345678',code:'DEMO-2026',reviewed:['sst']})).status,403);
  const auth=await api('login',{dni:'12345678',code:'DEMO-2026',reviewed:['sst','hs']});assert.equal(auth.status,200);const token=auth.data.token;
  assert.equal((await api('vote',{election:'sst',selection:['s1','s2']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted,[]);
  assert.equal((await api('vote',{election:'sst',selection:['s1']},token)).status,200);
  assert.equal((await api('vote',{election:'sst',selection:['s1']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted,['sst']);
  const firma=[Array.from({length:12},(_,i)=>[0.1+i*0.06,i%2?0.3:0.6])];
  assert.equal((await api('sign',{election:'hs',name:'Persona De Prueba',accepted:true,strokes:firma},token)).status,400);
  const blocked=await api('vote',{election:'hs',selection:['h1']},token);assert.equal(blocked.status,400);assert.match(blocked.data.error,/Primero firma/);
  const signature={election:'sst',name:'Persona De Prueba',accepted:true,strokes:firma};
  assert.equal((await api('sign',{...signature,accepted:false},token)).status,400);
  assert.equal((await api('sign',{...signature,strokes:[]},token)).status,400);
  assert.equal((await api('sign',{...signature,strokes:[[[0.1,0.1],[0.12,0.1]]]},token)).status,400);
  for(const name of ['Persona','Juan 123','J P'])assert.match((await api('sign',{...signature,name},token)).data.error,/nombres y apellidos/);
  const signed=await api('sign',{...signature,name:'  María  Pérez-Rojas '},token);assert.equal(signed.status,200);assert.equal(signed.data.employee,'12345678');assert.equal(signed.data.signerName,'María Pérez-Rojas');assert.equal(signed.data.selection,undefined);
  assert.equal((await api('sign',signature,token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.signed,['sst']);
  assert.equal((await api('vote',{election:'hs',selection:['h1']},token)).status,200);
  assert.equal((await api('vote',{election:'hs',selection:['h2']},token)).status,400);
  assert.deepEqual((await api('status',{},token)).data.voted.sort(),['hs','sst']);
  assert.equal((await api('admin',{key:'wrong'})).status,401);
  const report=(await api('admin',{key})).data;assert.equal(report.elections[0].participation,1);assert.deepEqual(report.voters[0].signed,['sst']);assert.equal(report.voters[0].name,'Trabajador de prueba');assert.deepEqual([...report.voters[0].voted].sort(),['hs','sst']);assert.equal(JSON.stringify(report.voters).includes('selection'),false);assert.equal(JSON.stringify(report.voters).includes('code_hash'),false);
  assert.equal(report.elections[0].results,null);
assert.equal((await api('admin-receipt',{key:'wrong',employee:'12345678',election:'sst'})).status,401);
const receipt=(await api('admin-receipt',{key,employee:'12345678',election:'sst'})).data;assert.equal(receipt.id,signed.data.id);
assert.equal((await api('admin-signatures',{key:'wrong'})).status,401);
const all=(await api('admin-signatures',{key})).data;assert.equal(all.elections.find(e=>e.id==='sst').signatures[0].employee,'12345678');assert.ok(all.elections.find(e=>e.id==='sst').signatures[0].strokes.length);assert.ok(!JSON.stringify(all).includes('selection'));
assert.equal((await api('receipt',{election:'sst'},token)).data.id,receipt.id);
assert.equal((await api('status',{},token)).data.phase,'abierta');
assert.equal((await api('demo-cierre',{key:'wrong',closed:true})).status,401);
assert.equal((await api('demo-cierre',{key,closed:true})).data.closed,true);
assert.equal((await api('status',{},token)).data.phase,'cerrada');assert.equal((await api('admin',{key})).data.closed,true);
assert.match((await api('vote',{election:'hs',selection:[]},token)).data.error,/cerrada/);
assert.ok(Date.parse((await (await fetch('http://127.0.0.1:18787/api/config')).json()).closes)<=Date.now());
assert.equal((await api('demo-cierre',{key,closed:false})).data.closed,false);assert.equal((await api('status',{},token)).data.phase,'abierta');
await api('logout',{},token);assert.equal((await api('status',{},token)).status,401);
 }finally{
  const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;rmSync(dir,{recursive:true,force:true});
 }
});

test('no hay voto en blanco: una cédula vacía se rechaza sin registrar participación',()=>{const db=setup();assert.throws(()=>vote(db,cfg,'secret','sst',[],now),/Elige una candidatura/);assert.throws(()=>vote(db,cfg,'secret','hs',['m'],now),/Selecciona 2/);assert.equal(db.prepare('SELECT COUNT(*) n FROM participation').get().n,0);db.close();});
test('cédula pendiente rechaza incluso voto en blanco',()=>{const db=setup();const pending={...cfg,elections:cfg.elections.map(e=>({...e,ready:false}))};assert.throws(()=>vote(db,pending,'secret','sst',[],now),/pendiente/);assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n,0);db.close();});
test('padrón: lee Excel, valida DNI, columnas y duplicados',async()=>{
 const {writeXlsx,readXlsx,parsePadron,newCode,normalizeCode,credential,CODE_ALPHABET}=await import('./padron.mjs');
 const el=[{id:'sst'},{id:'hs'}];
 const ok=parsePadron(readXlsx(writeXlsx([['DNI','Nombre','SST','HS'],['45781236','María','SÍ','sí'],['07012345','José','x','NO']])),el);
 assert.deepEqual(ok.errors,[]);assert.deepEqual(ok.rows.map(r=>[r.employee,r.eligible]),[['45781236',['sst','hs']],['07012345',['sst']]]);
 const bad=parsePadron([['DNI','SST','HS'],['4578123','SI','SI'],['45781236','SI','SI'],['45781236','SI','SI'],['11111111','NO','NO'],['22222222','tal vez','SI'],[1234567,'SI','SI']],el);
 assert.equal(bad.errors.length,4);assert.match(bad.errors.join('\n'),/Fila 2: .*8 dígitos[\s\S]*Fila 4: .*repetido[\s\S]*Fila 5: .*ningún comité[\s\S]*Fila 6: .*SÍ o NO/);
 assert.equal(bad.rows.at(-1).employee,'01234567');
 assert.match(parsePadron([['NOMBRE','SST']],el).errors.join(),/Falta la columna DNI/);
 const c=newCode();assert.match(c,/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);assert.equal(CODE_ALPHABET.includes('O')||CODE_ALPHABET.includes('I')||CODE_ALPHABET.includes('L')||CODE_ALPHABET.includes('0')||CODE_ALPHABET.includes('1'),false);
 assert.equal(normalizeCode(' k7qm 4xpa '),'K7QM4XPA');assert.equal(credential('45781236','k7qm-4xpa'),credential('45781236','K7QM4XPA'));assert.notEqual(credential('45781236','K7QM4XPA'),credential('45781237','K7QM4XPA'));
});

test('carga del padrón desde Excel, ingreso con DNI + código y reemplazo de código',async()=>{
 const {mkdtempSync,cpSync,rmSync,writeFileSync,readFileSync,readdirSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync,spawn}=await import('node:child_process');
 const {writeXlsx}=await import('./padron.mjs');
 const dir=mkdtempSync(join(tmpdir(),'ih-padron-test-'));
 for(const name of ['server.mjs','core.mjs','padron.mjs','tarjetas.mjs','import-padron.mjs','reemplazar-codigo.mjs','claves-junta.mjs','junta.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
 writeFileSync(join(dir,'config.json'),JSON.stringify({...cfg,mode:'production',approved:true,opens:'2099-01-01T09:00:00-05:00',closes:'2099-01-01T16:00:00-05:00'}));
 writeFileSync(join(dir,'padron.xlsx'),writeXlsx([['DNI','NOMBRE','SST','HS'],['45781236','María Pérez','SI','SI'],['70123459','José Quispe','SI','NO']]));
 const run=(...a)=>execFileSync(process.execPath,a,{cwd:dir,encoding:'utf8'});
 try{
  assert.match(run('import-padron.mjs','padron.xlsx','--revisar'),/2 trabajadores \(2 en SST, 1 en HS\)/);
  assert.match(run('import-padron.mjs','padron.xlsx'),/2 códigos nuevos/);
  assert.match(run('claves-junta.mjs'),/Presidente, Secretaria, Vocal 1, Vocal 2/);
  assert.match(run('import-padron.mjs','padron.xlsx'),/No hay trabajadores nuevos/);
  const files=readdirSync(join(dir,'credenciales'));assert.ok(files.some(f=>f.startsWith('tarjetas-')));
  const creds=JSON.parse(readFileSync(join(dir,'credenciales',files.find(f=>f.endsWith('.json')))));
  const maria=creds.find(c=>c.dni==='45781236');assert.match(maria.code,/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(readFileSync(join(dir,'credenciales',files.find(f=>f.startsWith('tarjetas-'))),'utf8').includes(maria.code));
  const login=async(dni,code)=>{const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18788',ADMIN_KEY:'k'.repeat(40)},stdio:['ignore','pipe','pipe']});
   try{await new Promise((ok,ko)=>{child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:'))ok();});child.on('exit',c=>ko(Error('exit '+c)));});
    const r=await fetch('http://127.0.0.1:18788/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dni,code,reviewed:['sst','hs']})});return r.status;}
   finally{const e=new Promise(r=>child.once('exit',r));child.kill();await e;}};
  assert.equal(await login('45781236',maria.code.toLowerCase().replace('-','')),200);
  assert.equal(await login('70123459',maria.code),401);
  run('reemplazar-codigo.mjs','45781236','María Pérez');
  assert.equal(await login('45781236',maria.code),401);
  const repl=readdirSync(join(dir,'credenciales')).find(f=>f.startsWith('reemplazo-45781236'));
  const newCode=readFileSync(join(dir,'credenciales',repl),'utf8').match(/class="code">([A-Z0-9-]+)</)[1];
  assert.equal(await login('45781236',newCode),200);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('modo prueba: el Excel genera códigos de prueba que sirven para ingresar',async()=>{
 const {mkdtempSync,cpSync,rmSync,writeFileSync,readFileSync,readdirSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync,spawn}=await import('node:child_process');
 const {writeXlsx}=await import('./padron.mjs');
 const dir=mkdtempSync(join(tmpdir(),'ih-demo-padron-'));
 for(const name of ['server.mjs','core.mjs','padron.mjs','tarjetas.mjs','import-padron.mjs','junta.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
 writeFileSync(join(dir,'config.json'),JSON.stringify({...cfg,mode:'demo'}));
 writeFileSync(join(dir,'padron.xlsx'),writeXlsx([['DNI','NOMBRE','SST','HS'],['45781236','María','SI','SI']]));
 try{
  assert.match(execFileSync(process.execPath,['import-padron.mjs','padron.xlsx'],{cwd:dir,encoding:'utf8'}),/MODO PRUEBA[\s\S]*1 códigos nuevos/);
  const files=readdirSync(join(dir,'credenciales'));const card=readFileSync(join(dir,'credenciales',files.find(f=>f.startsWith('PRUEBA-tarjetas-'))),'utf8');
  assert.match(card,/PRUEBA · NO VÁLIDA/);const code=card.match(/class="code">([A-Z0-9-]+)</)[1];
  const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18789'},stdio:['ignore','pipe','pipe']});
  try{await new Promise((ok,ko)=>{child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:'))ok();});child.on('exit',c=>ko(Error('exit '+c)));});
   const r=await fetch('http://127.0.0.1:18789/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dni:'45781236',code,reviewed:['sst','hs']})});assert.equal(r.status,200);}
  finally{const e=new Promise(r=>child.once('exit',r));child.kill();await e;}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('túnel Cloudflare: límite de intentos por IP real y origen público aceptado',async()=>{
 const {mkdtempSync,cpSync,rmSync,readdirSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawn}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'ih-tunnel-test-'));
 for(const name of ['server.mjs','core.mjs','padron.mjs','junta.json','config.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18790',TRUST_CLOUDFLARE:'1'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((ok,ko)=>{child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:'))ok();});child.on('exit',c=>ko(Error('exit '+c)));});
  const login=(ip,body,origin)=>fetch('http://127.0.0.1:18790/api/login',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}).then(r=>r.status);
  for(let i=0;i<30;i++)await login('203.0.113.'+(i%5),{dni:'1234567'+(i%3),code:'NOPE'});
  for(let i=0;i<30;i++)await login('198.51.100.7',{dni:'87654321',code:'NOPE'});
  assert.equal(await login('198.51.100.7',{dni:'12345678',code:'DEMO-2026',reviewed:['sst','hs']}),400);
  assert.equal(await login('192.0.2.50',{dni:'12345678',code:'DEMO-2026',reviewed:['sst','hs']},'https://ejemplo-abc.trycloudflare.com'),200);
  assert.equal(await login('192.0.2.51',{dni:'12345678',code:'DEMO-2026',reviewed:['sst','hs']},'https://sitio-malicioso.example'),403);
  assert.ok(readdirSync(join(dir,'data','respaldos')).some(f=>f.endsWith('.sqlite')));
 }finally{const e=new Promise(r=>child.once('exit',r));child.kill();await e;rmSync(dir,{recursive:true,force:true});}
});

test('junta: clave por integrante, registro de ingresos y escrutinio con dos integrantes',async()=>{
 const {mkdtempSync,cpSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawn}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'ih-junta-test-'));
 for(const name of ['server.mjs','core.mjs','padron.mjs','junta.json','config.json','public'])cpSync(new URL('./'+name,import.meta.url),join(dir,name),{recursive:true});
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env:{...process.env,PORT:'18791'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((ok,ko)=>{child.stdout.on('data',d=>{if(d.toString().includes('Aplicación:'))ok();});child.on('exit',c=>ko(Error('exit '+c)));});
  const api=async(path,body,token='')=>{const r=await fetch('http://127.0.0.1:18791/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const config=await (await fetch('http://127.0.0.1:18791/api/config')).json();
  assert.deepEqual(config.board.map(m=>m.role),['Presidente','Secretaria','Vocal 1','Vocal 2']);
  assert.ok(Array.isArray(config.photos));for(const n of config.photos){const r=await fetch('http://127.0.0.1:18791/candidatas/'+n+'.jpg');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');}
  assert.notEqual((await fetch('http://127.0.0.1:18791/candidatas/..%2Fconfig.json')).status,200);
  {const r=await fetch('http://127.0.0.1:18791/candidatas/perfiles.json');assert.equal(r.status,200);assert.equal(typeof await r.json(),'object');}assert.equal(JSON.stringify(config.board).includes('key'),false);
  const pres={member:'presidente',key:'junta-demo'},sec={member:'secretaria',key:'JUNTA-DEMO'};
  assert.equal((await api('admin',{key:{member:'presidente',key:'OTRA'}})).status,401);
  const report=await api('admin',{key:pres});assert.equal(report.status,200);assert.equal(report.data.member.role,'Presidente');assert.equal(report.data.elections[0].results,null);assert.equal(report.data.escrutinio,null);
  const token=(await api('login',{dni:'12345678',code:'DEMO-2026',reviewed:['sst','hs']})).data.token;
  assert.equal((await api('vote',{election:'sst',selection:['s2']},token)).status,200);
  assert.equal((await api('escrutinio',{key:pres,second:pres})).status,400);
  assert.equal((await api('escrutinio',{key:pres,second:{member:'secretaria',key:'MAL'}})).status,401);
  const esc=await api('escrutinio',{key:pres,second:sec});assert.equal(esc.status,200);
  const sst=esc.data.elections.find(e=>e.id==='sst');assert.equal(sst.results.total,1);assert.equal(sst.results.candidates.find(c=>c.id==='s2').votes,1);
  assert.deepEqual(esc.data.openedBy.map(m=>m.role),['Presidente','Secretaria']);
  const events=(await api('admin',{key:sec})).data.events.map(e=>e.event).join('\n');
  {const later=(await api('admin',{key:{member:'vocal1',key:'JUNTA-DEMO'}})).data.escrutinio;assert.equal(later.elections.find(e=>e.id==='sst').results.total,1);assert.deepEqual(later.openedBy.map(m=>m.role),['Presidente','Secretaria']);}
  const firma=[Array.from({length:12},(_,i)=>[0.1+i*0.06,i%2?0.3:0.6])];
  assert.equal(esc.data.signatures.length,4);assert.ok(esc.data.signatures.every(m=>!m.signedAt));
  assert.equal((await api('junta-firmar',{key:{member:'vocal1',key:'MAL'},strokes:firma,accepted:true})).status,401);
  assert.equal((await api('junta-firmar',{key:pres,strokes:firma,accepted:false})).status,400);
  assert.equal((await api('junta-firmar',{key:pres,strokes:[[[0.1,0.1],[0.11,0.1]]],accepted:true})).status,400);
  for(const m of ['presidente','secretaria','vocal1'])assert.equal((await api('junta-firmar',{key:{member:m,key:'JUNTA-DEMO'},strokes:firma,accepted:true})).status,200);
  assert.match((await api('junta-firmar',{key:pres,strokes:firma,accepted:true})).data.error,/ya firmó/);
  let sigs=(await api('junta-firmas',{key:sec})).data.signatures;assert.deepEqual(sigs.map(m=>!!m.signedAt),[true,true,true,false]);
  sigs=(await api('junta-firmar',{key:{member:'vocal2',key:'JUNTA-DEMO'},strokes:firma,accepted:true})).data.signatures;assert.ok(sigs.every(m=>m.signedAt&&m.strokes.length));
  assert.match((await api('admin',{key:sec})).data.events.map(e=>e.event).join('\n'),/JUNTA_FIRMA Vocal 2/);
  assert.match(events,/JUNTA_INGRESO Presidente/);assert.match(events,/ESCRUTINIO_ABIERTO Presidente \+ Secretaria/);assert.match(events,/JUNTA_INGRESO Secretaria/);
 }finally{const e=new Promise(r=>child.once('exit',r));child.kill();await e;rmSync(dir,{recursive:true,force:true});}
});
