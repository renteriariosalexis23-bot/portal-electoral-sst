import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {openDB,hash} from './core.mjs';
const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
if(cfg.mode!=='production'||!cfg.approved)throw Error('Primero aprueba y configura el modo production.');
if(Date.now()>=Date.parse(cfg.opens))throw Error('El padrón se cierra al inicio de la elección.');
if(!process.argv[2]||!process.argv[3])throw Error('Uso: node import-padron.mjs padron.json credenciales.json');
const rows=JSON.parse(readFileSync(process.argv[2]));if(!Array.isArray(rows)||!rows.length)throw Error('Padrón vacío.');
for(const r of rows)if(typeof r.employee!=='string'||!r.employee.trim()||!Array.isArray(r.eligible)||!r.eligible.length||r.eligible.some(id=>!cfg.elections.some(e=>e.id===id)))throw Error('Fila inválida.');
mkdirSync(new URL('./data/',import.meta.url),{recursive:true});
const db=openDB(fileURLToPath(new URL('./data/election.sqlite',import.meta.url)));
const saved=db.prepare('SELECT value FROM config WHERE id=1').get();
if(saved&&saved.value!==JSON.stringify(cfg))throw Error('La configuración no coincide.');
const out=rows.map(r=>({...r,code:randomBytes(24).toString('base64url')}));
db.exec('BEGIN IMMEDIATE');
try{
 db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(cfg));
 for(const r of out)db.prepare('INSERT INTO voters VALUES(?,?,?)').run(hash(r.code),r.employee,JSON.stringify(r.eligible));
 writeFileSync(process.argv[3],JSON.stringify(out,null,2),{flag:'wx',mode:0o600});
 db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('PADRON_IMPORT',new Date().toISOString());
 db.exec('COMMIT');console.log('Padrón cargado. Entrega cada credencial individualmente y protege el archivo de salida.');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
