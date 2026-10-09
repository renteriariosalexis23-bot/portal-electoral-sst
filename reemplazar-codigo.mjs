import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDB,hash} from './core.mjs';
import {normalizeDni,newCode,credential} from './padron.mjs';
import {cardsHtml} from './tarjetas.mjs';
/* Anula el código de un trabajador que aún no votó y genera uno nuevo. */
const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
const dni=normalizeDni(process.argv[2]),name=process.argv.slice(3).join(' ');
if(!/^\d{8}$/.test(dni))throw Error('Uso: node reemplazar-codigo.mjs DNI [nombre]');
if(cfg.mode!=='production'||!cfg.approved)throw Error('Solo disponible en modo production.');
if(Date.now()>=Date.parse(cfg.closes))throw Error('La votación ya cerró.');
const db=openDB(fileURLToPath(new URL('./data/election.sqlite',import.meta.url)));
const v=db.prepare('SELECT code_hash,eligible FROM voters WHERE employee=?').get(dni);
if(!v)throw Error('El DNI '+dni+' no está en el padrón.');
if(db.prepare('SELECT 1 FROM participation WHERE code_hash=?').get(v.code_hash))throw Error('El DNI '+dni+' ya votó en al menos un comité; su código no se puede reemplazar.');
const code=newCode(),stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
const dir=new URL('./credenciales/',import.meta.url);mkdirSync(dir,{recursive:true,mode:0o700});
const file=new URL('reemplazo-'+dni+'-'+stamp+'.html',dir);
db.exec('BEGIN IMMEDIATE');
try{
 db.prepare('UPDATE voters SET code_hash=? WHERE employee=?').run(hash(credential(dni,code)),dni);
 writeFileSync(file,cardsHtml(cfg,[{employee:dni,name,code,eligible:JSON.parse(v.eligible)}],fileURLToPath(new URL('./public/logo.png',import.meta.url))),{flag:'wx',mode:0o600});
 db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run('CODE_REPLACED',new Date().toISOString());
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log('Código anterior anulado. Nueva tarjeta: '+fileURLToPath(file));
