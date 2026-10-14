import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
/* Base de datos según el modo: prueba, simulacro (ensayo real con fecha propia) u oficial. */
export const dbName=cfg=>cfg.mode==='demo'?'demo-dni.sqlite':cfg.mode==='simulacro'?'simulacro.sqlite':'election.sqlite';
export const filePrefix=cfg=>cfg.mode==='demo'?'PRUEBA-':cfg.mode==='simulacro'?'SIMULACRO-':'';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export function openDB(path){
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS voters(code_hash TEXT PRIMARY KEY,employee TEXT UNIQUE NOT NULL,eligible TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS participation(code_hash TEXT NOT NULL REFERENCES voters(code_hash),election TEXT NOT NULL,PRIMARY KEY(code_hash,election));
 CREATE TABLE IF NOT EXISTS signatures(code_hash TEXT NOT NULL,election TEXT NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL,PRIMARY KEY(code_hash,election),FOREIGN KEY(code_hash,election) REFERENCES participation(code_hash,election));
 CREATE TABLE IF NOT EXISTS ballots(id TEXT PRIMARY KEY,election TEXT NOT NULL,selection TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,time TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS board(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,key_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS board_signatures(member TEXT PRIMARY KEY REFERENCES board(id),strokes TEXT NOT NULL,signed_at TEXT NOT NULL);`);
 /* Nombre del trabajador (del Excel del padrón), solo para el panel de la junta. */
 if(!db.prepare('PRAGMA table_info(voters)').all().some(c=>c.name==='name'))db.exec("ALTER TABLE voters ADD COLUMN name TEXT NOT NULL DEFAULT ''");
 return db;
}
export function vote(db,config,code,election,selection,now=Date.now()){
 if(now<Date.parse(config.opens)||now>=Date.parse(config.closes))throw Error('La votación está cerrada.');
 const e=config.elections.find(x=>x.id===election);
 if(!e||!Array.isArray(selection)||selection.some(s=>typeof s!=='string')||new Set(selection).size!==selection.length)throw Error('Cédula inválida.');
 if(e.ready===false)throw Error(e.pendingReason||'Cédula pendiente de validación.');
 if(selection.some(id=>!e.candidates.some(c=>c.id===id)))throw Error('Candidatura inválida.');
 if(selection.length){
  if(selection.length!==e.total)throw Error('Selecciona '+e.total+' candidaturas o vota en blanco.');
  for(const [g,n] of Object.entries(e.groups))if(selection.filter(id=>e.candidates.find(c=>c.id===id).group===g).length!==n)throw Error('La selección no cumple la composición de esta cédula.');
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  const h=hash(code),v=db.prepare('SELECT eligible FROM voters WHERE code_hash=?').get(h);
  if(!v||!JSON.parse(v.eligible).includes(election))throw Error('No estás habilitado para esta elección.');
  if(db.prepare('SELECT 1 FROM participation WHERE code_hash=? AND election=?').get(h,election))throw Error('Ya registraste tu participación.');
  db.prepare('INSERT INTO ballots VALUES(?,?,?)').run(randomUUID(),election,JSON.stringify([...selection].sort()));
  db.prepare('INSERT INTO participation VALUES(?,?)').run(h,election);
  db.exec('COMMIT');
 }catch(err){db.exec('ROLLBACK');throw err;}
}

/* Nombres y apellidos: al menos dos palabras de 2+ letras, solo letras, espacios, apóstrofo o guion. */
export function validFullName(n){if(typeof n!=='string')return false;const t=n.trim().replace(/\s+/g,' ');if(t.length>150||!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(t))return false;return t.split(' ').filter(w=>w.replace(/['-]/g,'').length>=2).length>=2;}
export const consentText='Declaro que participé en esta elección y acepto firmar electrónicamente esta constancia de participación, que no contiene mi preferencia de voto.';
/* Valida una firma dibujada (trazos normalizados 0..1) y exige un trazo mínimo. */
export function checkStrokes(strokes){
 if(!Array.isArray(strokes)||strokes.length>100||!strokes.length)throw Error('Firma inválida.');
 let points=0,length=0;
 for(const stroke of strokes){if(!Array.isArray(stroke)||stroke.length<2)throw Error('Trazo inválido.');points+=stroke.length;for(let i=0;i<stroke.length;i++){const p=stroke[i];if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw Error('Trazo inválido.');if(i)length+=Math.hypot(p[0]-stroke[i-1][0],p[1]-stroke[i-1][1]);}}
 if(points>4000||points<10||length<0.25)throw Error('Dibuja tu firma completa en el recuadro.');
 return strokes;
}
export function signParticipation(db,config,code,body){
 const h=hash(code),e=config.elections.find(e=>e.id===body.election);
 if(!e||!db.prepare('SELECT 1 FROM participation WHERE code_hash=? AND election=?').get(h,body.election))throw Error('Primero debes registrar tu participación.');
 if(body.accepted!==true)throw Error('Marca la casilla de aceptación para firmar.');
 if(!validFullName(body.name))throw Error('Escribe tus nombres y apellidos completos (al menos un nombre y un apellido, solo letras).');
 const strokes=checkStrokes(body.strokes);
 const employee=db.prepare('SELECT employee FROM voters WHERE code_hash=?').get(h).employee;
 const receipt={id:randomUUID(),company:config.company,period:config.period,demo:config.mode==='demo',employee,signerName:body.name.trim().replace(/\s+/g,' '),election:body.election,committee:e.title,signedAt:new Date().toISOString(),consent:consentText,consentVersion:1,method:'Credencial personal, firma dibujada y aceptación expresa',strokes};
 const payload=JSON.stringify(receipt),checksum=hash(payload);
 db.prepare('INSERT INTO signatures(code_hash,election,payload,checksum) VALUES(?,?,?,?)').run(h,body.election,payload,checksum);
 return {...receipt,checksum};
}
