import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDB,hash} from './core.mjs';
import {loadPadron,newCode,credential} from './padron.mjs';
import {cardsHtml} from './tarjetas.mjs';
const cfg=JSON.parse(readFileSync(new URL('./config.json',import.meta.url)));
const [file,flag]=process.argv.slice(2),check=flag==='--revisar';
if(!file)throw Error('Uso: node import-padron.mjs padron.xlsx            (carga y genera credenciales)\n     node import-padron.mjs padron.xlsx --revisar  (solo revisa el Excel)');
const {rows,errors}=loadPadron(file,cfg.elections);
if(errors.length){console.error('El padrón tiene '+errors.length+' error(es). No se generó ningún código:\n - '+errors.join('\n - '));process.exit(1);}
const summary=rows=>cfg.elections.map(e=>rows.filter(r=>r.eligible.includes(e.id)).length+' en '+e.id.toUpperCase()).join(', ');
if(check){console.log('Padrón correcto: '+rows.length+' trabajadores ('+summary(rows)+'). No se guardó nada.');process.exit(0);}
const demo=cfg.mode==='demo';
if(!demo&&!cfg.approved)throw Error('Primero aprueba la configuración (approved: true).');
if(!demo&&Date.now()>=Date.parse(cfg.opens))throw Error('El padrón se cierra al inicio de la elección. Para un código perdido usa reemplazar-codigo.mjs.');
if(demo)console.log('MODO PRUEBA: los códigos se guardan en la base de demostración (demo-dni.sqlite), no en la oficial.');
mkdirSync(new URL('./data/',import.meta.url),{recursive:true});
const db=openDB(fileURLToPath(new URL(demo?'./data/demo-dni.sqlite':'./data/election.sqlite',import.meta.url)));
const saved=db.prepare('SELECT value FROM config WHERE id=1').get();
if(saved&&saved.value!==JSON.stringify(cfg))throw Error('La configuración no coincide.');
const exists=db.prepare('SELECT 1 FROM voters WHERE employee=?');
const fresh=rows.filter(r=>!exists.get(r.employee)),skipped=rows.length-fresh.length;
if(!fresh.length){console.log('No hay trabajadores nuevos: los '+skipped+' del Excel ya tienen código.');process.exit(0);}
const out=fresh.map(r=>({...r,code:newCode()}));
const stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
const dir=new URL('./credenciales/',import.meta.url);mkdirSync(dir,{recursive:true,mode:0o700});
const pre=demo?'PRUEBA-':'';
const jsonFile=new URL(pre+'credenciales-'+stamp+'.json',dir),htmlFile=new URL(pre+'tarjetas-'+stamp+'.html',dir);
db.exec('BEGIN IMMEDIATE');
try{
 db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(JSON.stringify(cfg));
 const ins=db.prepare('INSERT INTO voters VALUES(?,?,?)');
 for(const r of out)ins.run(hash(credential(r.employee,r.code)),r.employee,JSON.stringify(r.eligible));
 writeFileSync(jsonFile,JSON.stringify(out.map(({employee,name,eligible,code})=>({dni:employee,name,eligible,code})),null,2),{flag:'wx',mode:0o600});
 writeFileSync(htmlFile,cardsHtml(cfg,out,fileURLToPath(new URL('./public/logo.png',import.meta.url))),{flag:'wx',mode:0o600});
 db.prepare('INSERT INTO audit(event,time) VALUES(?,?)').run((demo?'PADRON_IMPORT_PRUEBA ':'PADRON_IMPORT ')+out.length,new Date().toISOString());
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log('Padrón cargado: '+out.length+' códigos nuevos ('+summary(out)+')'+(skipped?'; '+skipped+' ya tenían código y no se tocaron':'')+'.');
console.log('Tarjetas para imprimir: '+fileURLToPath(htmlFile));
console.log('Protege la carpeta credenciales: contiene los códigos. No la subas a GitHub.');
