import {readFileSync} from 'node:fs';
/* Genera un HTML imprimible con una tarjeta por trabajador y una lista de entrega. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cardsHtml(cfg,people,logoPath){
 let logo='';try{logo='data:image/png;base64,'+readFileSync(logoPath).toString('base64');}catch{}
 const day=new Date(cfg.opens).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'long',year:'numeric'});
 const hours=[cfg.opens,cfg.closes].map(d=>new Date(d).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'})).join(' a ');
 const portal=cfg.portalUrl?esc(cfg.portalUrl):'la dirección que indique la junta electoral';
 const card=p=>'<article class="card">'+(logo?'<img src="'+logo+'" alt="">':'<b>'+esc(cfg.company)+'</b>')+'<p class="t">Elecciones de representantes · '+esc(cfg.period)+'</p>'+(p.name?'<p class="n">'+esc(p.name)+'</p>':'')+'<dl><dt>DNI</dt><dd>'+esc(p.employee)+'</dd><dt>Código personal</dt><dd class="code">'+esc(p.code)+'</dd></dl><p class="i">Vota el '+esc(day)+', de '+esc(hours)+', en '+portal+'. Escribe tu DNI y este código.</p><p class="w">Es personal. No lo compartas ni lo fotografíes para otros.</p></article>';
 const pages=[];for(let i=0;i<people.length;i+=8)pages.push('<section class="sheet">'+people.slice(i,i+8).map(card).join('')+'</section>');
 return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Credenciales · '+esc(cfg.company)+'</title><style>'+
 '@page{size:A4;margin:10mm}body{font:12px Arial,sans-serif;color:#302333;margin:0}.sheet{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:66mm;gap:0;page-break-after:always}'+
 '.card{border:1px dashed #b9a6b6;padding:6mm 7mm;display:flex;flex-direction:column;gap:1.5mm;overflow:hidden}.card img{height:9mm;width:auto;align-self:flex-start}.t{margin:0;color:#861079;font-weight:bold;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.n{margin:1mm 0 0;font-size:13px;font-weight:bold}'+
 'dl{display:grid;grid-template-columns:auto 1fr;gap:1mm 4mm;margin:1mm 0;align-items:baseline}dt{color:#746d76;font-size:10px}dd{margin:0;font-size:15px;font-weight:bold;letter-spacing:.06em}dd.code{font:bold 22px "Courier New",monospace;letter-spacing:.12em;color:#46133f}'+
 '.i{margin:0;font-size:10px;line-height:1.35}.w{margin:auto 0 0;font-size:9.5px;color:#9b2c2c;font-weight:bold}'+
 'h1{font-size:16px;margin:0 0 4mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:3mm 2mm;text-align:left;font-size:11px}th{background:#f3eaf1}td.f{width:45mm}'+
 '@media screen{body{background:#eee;padding:20px}.sheet,.list{background:#fff;max-width:190mm;margin:0 auto 20px;padding:10mm;box-shadow:0 2px 10px #0002}}</style>'+
 pages.join('')+'<section class="list"><h1>Cargo de entrega de credenciales · '+esc(cfg.company)+' · '+esc(cfg.period)+'</h1><p>Cada trabajador firma al recibir su credencial en sobre cerrado.</p><table><thead><tr><th>#</th><th>DNI</th><th>Nombre</th><th>Fecha</th><th>Firma</th></tr></thead><tbody>'+people.map((p,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(p.employee)+'</td><td>'+esc(p.name)+'</td><td></td><td class="f"></td></tr>').join('')+'</tbody></table></section></html>';
}
