import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {randomInt,scryptSync} from 'node:crypto';

/* Credenciales: DNI + código personal corto y legible. */
export const CODE_ALPHABET='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const normalizeDni=s=>String(s??'').replace(/\D/g,'');
export const normalizeCode=s=>String(s??'').toUpperCase().replace(/[^0-9A-Z]/g,'');
export function newCode(){let c='';for(let i=0;i<8;i++)c+=CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];return c.slice(0,4)+'-'+c.slice(4);}
/* Clave derivada lenta: la base no permite recuperar DNI ni código probando combinaciones rápido. */
export function credential(dni,code){return scryptSync(normalizeDni(dni)+':'+normalizeCode(code),'image-health-elecciones-v1',32).toString('hex');}

/* Claves de la junta: una por integrante, 12 caracteres legibles. */
export function newBoardKey(){const c=newCode().replace('-','')+newCode().replace('-','').slice(0,4);return c.slice(0,4)+'-'+c.slice(4,8)+'-'+c.slice(8);}
export function boardKey(id,key){return scryptSync('junta:'+id+':'+normalizeCode(key),'image-health-elecciones-v1',32).toString('hex');}

/* Lector mínimo de .xlsx (ZIP + XML) sin dependencias. */
function unzip(buf){
 let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65558);i--)if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('El archivo no es un Excel (.xlsx) válido.');
 const files={},count=buf.readUInt16LE(eocd+10);let p=buf.readUInt32LE(eocd+16);
 for(let n=0;n<count;n++){
  if(buf.readUInt32LE(p)!==0x02014b50)throw Error('El archivo Excel está dañado.');
  const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extraLen=buf.readUInt16LE(p+30),commentLen=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
  const name=buf.toString('utf8',p+46,p+46+nameLen);
  const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
  files[name]=()=>method===0?data:method===8?inflateRawSync(data):(()=>{throw Error('Compresión de Excel no soportada.');})();
  p+=46+nameLen+extraLen+commentLen;
 }
 return files;
}
const xmlText=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const colIndex=ref=>{let n=0;for(const ch of ref.replace(/\d/g,''))n=n*26+ch.charCodeAt(0)-64;return n-1;};
export function readXlsx(buf){
 const files=unzip(buf),get=n=>files[n]&&files[n]().toString('utf8');
 const shared=[...(get('xl/sharedStrings.xml')||'').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
 const sheetName=Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/)))[0];
 if(!sheetName)throw Error('El Excel no tiene hojas.');
 const rows=[];
 for(const r of get(sheetName).matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)){
  const row=[],rn=+((r[1].match(/\br="(\d+)"/)||[])[1]||rows.length+1);
  for(const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const attrs=c[1],inner=c[2]||'',ref=(attrs.match(/\br="([A-Z]+\d+)"/)||[])[1],type=(attrs.match(/\bt="([^"]+)"/)||[])[1];
   const v=(inner.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
   let val=type==='s'?shared[+v]:type==='inlineStr'?xmlText((inner.match(/<is>([\s\S]*?)<\/is>/)||['',''])[1]):type==='str'?xmlText(v||''):v!==undefined&&(!type||type==='n')?Number(v):v!==undefined?xmlText(v):'';
   row[ref?colIndex(ref):row.length]=val??'';
  }
  rows[rn-1]=Array.from(row,x=>x??'');
 }
 return rows;
}
export function readCsv(text){
 const sep=text.split('\n')[0].includes(';')?';':',';
 return text.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(sep).map(x=>x.trim().replace(/^"|"$/g,'')));
}

/* Convierte la tabla del padrón en filas validadas. */
const yes=v=>/^(s[ií]|x|1|true|verdadero)$/i.test(String(v).trim());
const no=v=>/^(no|0|false|falso|)$/i.test(String(v).trim());
export function parsePadron(table,elections){
 const errors=[],head=(table[0]||[]).map(h=>String(h).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,''));
 const iDni=head.indexOf('DNI'),iName=head.findIndex(h=>/NOMBRE|APELLIDO/.test(h));
 const cols=elections.map(e=>({id:e.id,i:head.indexOf(e.id.toUpperCase())}));
 if(iDni<0)errors.push('Falta la columna DNI en la primera fila.');
 for(const c of cols)if(c.i<0)errors.push('Falta la columna '+c.id.toUpperCase()+' en la primera fila.');
 if(errors.length)return {rows:[],errors};
 const rows=[],seen=new Map();
 table.slice(1).forEach((r,k)=>{
  const line=k+2;if(!r||r.every(x=>String(x).trim()===''))return;
  const cell=r[iDni];let raw=typeof cell==='number'&&Number.isInteger(cell)&&cell>0&&cell<1e8?String(cell).padStart(8,'0'):String(cell??'').trim();
  const dni=normalizeDni(raw);
  if(!/^\d{8}$/.test(dni)||dni!==raw.replace(/\s/g,''))return errors.push('Fila '+line+': DNI "'+raw+'" no tiene 8 dígitos.');
  if(seen.has(dni))return errors.push('Fila '+line+': DNI '+dni+' repetido (ya está en la fila '+seen.get(dni)+').');
  seen.set(dni,line);
  const eligible=[];
  for(const c of cols){const v=r[c.i]??'';if(yes(v))eligible.push(c.id);else if(!no(v))errors.push('Fila '+line+': en la columna '+c.id.toUpperCase()+' escribe SÍ o NO (dice "'+v+'").');}
  if(!eligible.length)return errors.push('Fila '+line+': DNI '+dni+' no está habilitado en ningún comité.');
  rows.push({employee:dni,eligible,name:iName>=0?String(r[iName]??'').trim():''});
 });
 if(!rows.length&&!errors.length)errors.push('El padrón no tiene trabajadores.');
 return {rows,errors};
}
export function loadPadron(file,elections){
 const buf=readFileSync(file),ext=file.toLowerCase().split('.').pop();
 if(ext==='json'){const data=JSON.parse(buf);return parsePadron([['DNI',...elections.map(e=>e.id.toUpperCase())],...data.map(r=>[r.employee,...elections.map(e=>r.eligible.includes(e.id)?'SI':'NO')])],elections);}
 return parsePadron(ext==='csv'?readCsv(buf.toString('utf8')):readXlsx(buf),elections);
}

/* Escritor mínimo de .xlsx (sin compresión), para la plantilla del padrón. */
import {crc32} from 'node:zlib';
const xmlEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colName=i=>{let s='';i++;while(i){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
export function writeXlsx(rows){
 const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="9" width="9" customWidth="1"/></cols><sheetData>'+rows.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>'<c r="'+colName(j)+(i+1)+'" t="inlineStr"><is><t>'+xmlEsc(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
 const parts={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Padron" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':sheet
 };
 const locals=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(parts)){
  const data=Buffer.from(text,'utf8'),nm=Buffer.from(name),crc=crc32(data);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(nm.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nm.length,28);c.writeUInt32LE(offset,42);
  locals.push(h,nm,data);central.push(c,nm);offset+=30+nm.length+data.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,end]);
}
