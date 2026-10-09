import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDB,hash} from './core.mjs';
import {newBoardKey,boardKey} from './padron.mjs';
/* Genera una clave para cada integrante de la junta (junta.json) o solo para uno: node claves-junta.mjs [id]. */
const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
const members=JSON.parse(readFileSync(new URL('./junta.json',import.meta.url)));
const only=process.argv[2],demo=cfg.mode==='demo';
if(only&&!members.some(m=>m.id===only))throw Error('No existe "'+only+'" en junta.json. Opciones: '+members.map(m=>m.id).join(', '));
if(members.length<2)throw Error('junta.json debe tener al menos 2 integrantes.');
if(!demo&&Date.now()>=Date.parse(cfg.closes))throw Error('La votación ya cerró.');
const db=openDB(fileURLToPath(new URL(demo?'./data/demo-dni.sqlite':'./data/election.sqlite',import.meta.url)));
const out=members.filter(m=>!only||m.id===only).map(m=>({...m,key:newBoardKey()}));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let logo='';try{logo='<img src="data:image/png;base64,'+readFileSync(new URL('./public/logo.png',import.meta.url)).toString('base64')+'" alt="">';}catch{}
const html='<!doctype html><html lang="es"><meta charset="utf-8"><title>Claves de la junta</title><style>@page{size:A4;margin:12mm}body{font:13px Arial,sans-serif;color:#302333;margin:0}.g{display:grid;grid-template-columns:1fr 1fr;gap:0}.c{border:1px dashed #b9a6b6;padding:8mm;min-height:80mm;display:flex;flex-direction:column;gap:2mm}.c img{height:10mm;width:auto;align-self:flex-start}.t{color:#861079;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.r{font-size:11px;color:#746d76;text-transform:uppercase;letter-spacing:.08em;margin-top:3mm}.n{font-size:16px;font-weight:bold}.k{font:bold 22px "Courier New",monospace;letter-spacing:.1em;color:#46133f;margin:3mm 0}.w{margin-top:auto;font-size:10px;color:#9b2c2c;font-weight:bold}.d{position:relative}.d:after{content:"PRUEBA · NO VÁLIDA";position:absolute;top:6mm;right:6mm;border:1.5px solid #b45309;color:#b45309;font-size:9px;font-weight:bold;padding:1mm 2mm;transform:rotate(4deg)}</style><div class="g">'+out.map(m=>'<div class="c'+(demo?' d':'')+'">'+logo+'<div class="t">Junta electoral · '+esc(cfg.period)+'</div><div class="r">'+esc(m.role)+'</div><div class="n">'+esc(m.name)+'</div><div>Clave personal del panel de la junta</div><div class="k">'+esc(m.key)+'</div><div>Ingresa en "Acceso de la junta", elige tu nombre y escribe esta clave. Los resultados solo se abren con dos integrantes.</div><div class="w">Personal e intransferible. No la compartas ni la envíes por mensaje.</div></div>').join('')+'</div></html>';
const stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
const dir=new URL('./credenciales/',import.meta.url);mkdirSync(dir,{recursive:true,mode:0o700});
const file=new URL((demo?'PRUEBA-':'')+'claves-junta-'+(only||'todos')+'-'+stamp+'.html',dir);
db.exec('BEGIN IMMEDIATE');
try{
 const up=db.prepare('INSERT INTO board(id,name,role,key_hash) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,key_hash=excluded.key_hash');
 for(const m of out)up.run(m.id,m.name,m.role,hash(boardKey(m.id,m.key)));
 if(!only)db.prepare('DELETE FROM board WHERE id NOT IN ('+members.map(()=>'?').join(',')+')').run(...members.map(m=>m.id));
 writeFileSync(file,html,{flag:'wx',mode:0o600});
 db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('CLAVES_JUNTA '+(only||'todos'),new Date().toISOString());
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log('Claves generadas para: '+out.map(m=>m.role).join(', ')+'.\nImprime y entrega en sobre cerrado: '+fileURLToPath(file)+'\nLas claves anteriores de esos integrantes dejaron de funcionar.');
