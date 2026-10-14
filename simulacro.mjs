/* SIMULACRO: ensayo idéntico al oficial (claves reales de la junta, códigos, cierre automático) pero hoy,
   con base propia (data/simulacro.sqlite). No toca la elección oficial. Lo llama SIMULACRO.cmd:
   node simulacro.mjs HH:MM   (hora de cierre de hoy, hora de Perú) */
import {existsSync,readFileSync,writeFileSync,copyFileSync,rmSync,readdirSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),p=(...a)=>join(root,...a);
const fail=m=>{console.error('\n'+m);process.exit(1);};

const hhmm=String(process.argv[2]||'').trim();
if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(hhmm))fail('Escribe la hora de cierre como 16:00 (formato 24 horas).');
if(!existsSync(p('config-oficial.json')))fail('Falta config-oficial.json. Actualiza el portal (ACTUALIZAR) y vuelve a intentar.');
if(!existsSync(p('padron.xlsx')))fail('No encuentro padron.xlsx en esta carpeta. Ponlo aquí y vuelve a intentar.');
if(existsSync(p('data','election.sqlite')))fail('El portal ya está en MODO OFICIAL. El simulacro solo se hace antes de pasar a oficial.');

const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Lima'});
const closes=today+'T'+hhmm.padStart(5,'0')+':00-05:00',opens=new Date(Date.now()-60000).toISOString();
if(Date.parse(closes)<=Date.now()+10*60000)fail('La hora de cierre debe ser al menos 10 minutos después de ahora.');

/* Borrar un simulacro anterior. */
for(const ext of ['','-wal','-shm']){const f=p('data','simulacro.sqlite'+ext);try{rmSync(f,{force:true});}catch{}if(existsSync(f))fail('No se pudo borrar el simulacro anterior. Cierra la ventana "Portal electoral - NO CERRAR" y vuelve a intentar.');}
mkdirSync(p('data'),{recursive:true});
if(existsSync(p('credenciales')))for(const f of readdirSync(p('credenciales')).filter(f=>f.startsWith('SIMULACRO-')))rmSync(p('credenciales',f),{force:true});

/* Configuración: la oficial, con fecha de hoy y modo simulacro. Se guarda la de prueba para volver. */
const cur=existsSync(p('config.json'))?JSON.parse(readFileSync(p('config.json'),'utf8')):null;
if(cur&&cur.mode==='demo')copyFileSync(p('config.json'),p('config-prueba.json'));
const sim={...JSON.parse(readFileSync(p('config-oficial.json'),'utf8')),mode:'simulacro',approved:true,opens,closes};
writeFileSync(p('config.json'),JSON.stringify(sim,null,2)+'\n');
console.log('SIMULACRO: votación abierta desde ahora hasta las '+hhmm+' de hoy (hora de Perú).');

const run=(...args)=>{const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.status!==0){if(existsSync(p('config-prueba.json')))copyFileSync(p('config-prueba.json'),p('config.json'));fail('Se detuvo. Se restauró la configuración de prueba; corrige lo indicado arriba y vuelve a intentar.');}};
run('import-padron.mjs','padron.xlsx','--revisar');
run('import-padron.mjs','padron.xlsx');
run('claves-junta.mjs');
console.log('\nSIMULACRO LISTO.');
