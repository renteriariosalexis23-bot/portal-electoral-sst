/* Pasa el portal de MODO PRUEBA a MODO OFICIAL: borra todo lo de prueba, usa config-oficial.json,
   carga padron.xlsx (códigos definitivos) y genera las claves de la junta. Lo llama PASAR-A-OFICIAL.cmd.
   Códigos de salida: 0 listo · 1 error · 3 ya estaba en oficial sin votos (repetir con --repetir). */
import {existsSync,readFileSync,copyFileSync,rmSync,readdirSync,mkdirSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const root=dirname(fileURLToPath(import.meta.url)),p=(...a)=>join(root,...a);
const repetir=process.argv.includes('--repetir');
const fail=m=>{console.error('\n'+m);process.exit(1);};

if(!existsSync(p('config-oficial.json')))fail('Falta config-oficial.json. Actualiza el portal (ACTUALIZAR) y vuelve a intentar.');
if(!existsSync(p('padron.xlsx')))fail('No encuentro padron.xlsx en esta carpeta. Ponlo aquí y vuelve a intentar.');
const oficial=JSON.parse(readFileSync(p('config-oficial.json'),'utf8'));
if(Date.now()>=Date.parse(oficial.opens))fail('La votación ya empezó o terminó: no se puede pasar a oficial ahora.');

/* Nunca tocar una elección oficial que ya tiene votos. */
const official=p('data','election.sqlite');
if(existsSync(official)){
 let votes=0;try{const db=new DatabaseSync(official);votes=db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='participation'").get().n?db.prepare('SELECT COUNT(*) n FROM participation').get().n:0;db.close();}catch(e){fail('No se pudo revisar la base oficial ('+e.message+'). Cierra la ventana "Portal electoral - NO CERRAR" y vuelve a intentar.');}
 if(votes)fail('La base OFICIAL ya tiene '+votes+' voto(s). No se borró nada.');
 if(!repetir){console.log('\nEl portal YA estaba en modo oficial (sin votos).');process.exit(3);}
}

/* 1. Borrar lo de prueba (y la base oficial vacía si se repite). */
const del=f=>{try{rmSync(f,{force:true});}catch(e){fail('No se pudo borrar '+f+'. Cierra la ventana "Portal electoral - NO CERRAR" y vuelve a intentar.');}};
for(const base of ['demo-dni.sqlite','simulacro.sqlite','election.sqlite'])for(const ext of ['','-wal','-shm']){const f=p('data',base+ext);if(base==='election.sqlite'&&!repetir)continue;del(f);if(existsSync(f))fail('No se pudo borrar '+f+'. Cierra la ventana "Portal electoral - NO CERRAR" y vuelve a intentar.');}
mkdirSync(p('data'),{recursive:true});
for(const old of readdirSync(p('data')).filter(f=>/^demo-.*\.sqlite/.test(f)))del(p('data',old));
if(existsSync(p('data','respaldos')))for(const f of readdirSync(p('data','respaldos')).filter(f=>f.startsWith('demo-')))del(p('data','respaldos',f));
if(existsSync(p('credenciales'))){
 const viejos=readdirSync(p('credenciales')).filter(f=>/\.(html|json)$/.test(f));
 for(const f of viejos.filter(f=>f.startsWith('PRUEBA-')||f.startsWith('SIMULACRO-')))del(p('credenciales',f));
 const anteriores=viejos.filter(f=>!f.startsWith('PRUEBA-')&&!f.startsWith('SIMULACRO-')&&existsSync(p('credenciales',f)));
 if(anteriores.length){const d=p('credenciales','anteriores-NO-VALIDAS');mkdirSync(d,{recursive:true});for(const f of anteriores)renameSync(p('credenciales',f),join(d,f));}
}
console.log('Datos de prueba borrados.');

/* 2. Configuración oficial (se guarda una copia de la de prueba). */
if(existsSync(p('config.json'))&&JSON.parse(readFileSync(p('config.json'),'utf8')).mode==='demo')copyFileSync(p('config.json'),p('config-prueba.json'));
copyFileSync(p('config-oficial.json'),p('config.json'));
console.log('Configuración oficial activada: votación del '+new Date(oficial.opens).toLocaleString('es-PE',{timeZone:'America/Lima'})+' al '+new Date(oficial.closes).toLocaleTimeString('es-PE',{timeZone:'America/Lima'})+'.');

/* 3. Padrón oficial y 4. claves de la junta. */
const run=(...args)=>{const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.status!==0){copyFileSync(p('config-prueba.json'),p('config.json'));fail('Se detuvo. Se restauró la configuración de prueba; corrige lo indicado arriba y vuelve a intentar.');}};
run('import-padron.mjs','padron.xlsx','--revisar');
run('import-padron.mjs','padron.xlsx');
run('claves-junta.mjs');
console.log('\nMODO OFICIAL LISTO.');
