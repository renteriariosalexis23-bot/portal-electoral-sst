import {spawn,execFile} from 'node:child_process';
import {createWriteStream,writeFileSync,mkdirSync} from 'node:fs';
/* Abre el túnel temporal de Cloudflare, muestra la dirección en grande, la copia y la abre en el navegador. */
const port=process.env.PORT||'8787';
mkdirSync(new URL('./data/',import.meta.url),{recursive:true});
const log=createWriteStream(new URL('./data/cloudflared.log',import.meta.url),{flags:'a'});
const banner=(lines)=>{const w=Math.max(...lines.map(l=>l.length))+6;console.log('\n'+'#'.repeat(w));for(const l of lines)console.log('#  '+l.padEnd(w-6)+'  #');console.log('#'.repeat(w)+'\n');};
console.log('Conectando con Cloudflare... (puede tardar hasta 30 segundos)');
const child=spawn('cloudflared',['tunnel','--url','http://127.0.0.1:'+port],{stdio:['ignore','pipe','pipe']});
let url='',connected=false,buf='';
function onData(d){
 const s=d.toString();log.write(s);buf+=s;
 const lines=buf.split(/\r?\n/);buf=lines.pop();
 for(const line of lines){
  const m=line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if(m&&!url){
   url=m[0];
   try{writeFileSync(new URL('./DIRECCION-ACTUAL.txt',import.meta.url),url+'\r\n');}catch{}
   banner(['DIRECCION DEL PORTAL (compartela con los trabajadores):','',url,'','Ya esta copiada: pegala con Ctrl+V en WhatsApp o correo.','Tambien quedo guardada en DIRECCION-ACTUAL.txt','NO cierres esta ventana ni la del portal.']);
   if(process.platform==='win32'){
    try{const c=spawn('clip',[],{stdio:['pipe','ignore','ignore']});c.stdin.end(url);}catch{}
    setTimeout(()=>{try{execFile('cmd',['/c','start','',url]);}catch{}},8000);
   }
  }
  if(!connected&&/Registered tunnel connection/.test(line)){connected=true;console.log('Conectado con Cloudflare. En unos segundos la direccion abrira en el navegador.');}
  if(/\bERR\b/.test(line)&&!/failed to sufficiently increase receive buffer size/.test(line))console.log('Aviso de Cloudflare: '+line.replace(/^\S+\s+ERR\s*/,'').slice(0,160));
 }
}
child.stdout.on('data',onData);child.stderr.on('data',onData);
child.on('error',e=>{console.error(e.code==='ENOENT'?'No encuentro cloudflared. Instalalo con: winget install --id Cloudflare.cloudflared':'Error al iniciar cloudflared: '+e.message);process.exitCode=1;});
child.on('exit',code=>{console.log('\nEl tunel se cerro (codigo '+code+'). El portal ya NO esta en internet. Vuelve a abrir INICIAR-PUBLICO.cmd.');log.end();});
process.on('SIGINT',()=>child.kill());
