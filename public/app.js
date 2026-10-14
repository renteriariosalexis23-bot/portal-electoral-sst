const $=s=>document.querySelector(s),content=$('#content');let cfg,token='',status;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(s=''){$('#notice').textContent=s;}
async function api(path,data={}){if(path==='login')data={...data,reviewed:[...reviewedCommittees]};const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function login(){$('#acceso').classList.remove('voting-focus');content.innerHTML='<h2>Ingresa a la votación</h2><p>Escribe tu DNI y el código personal de tu tarjeta.</p><form id="login"><label for="dni">DNI</label><input id="dni" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{8}" title="8 dígitos" placeholder="8 dígitos" required><label for="code">Código personal</label><input id="code" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ejemplo: K7QM-4XPA" required><div class="actions"><button class="primary">Ingresar a la votación</button></div></form>'+(cfg.mode==='demo'?'<p class="muted">Prueba con DNI 12345678 y código DEMO-2026. Cada cédula admite un solo envío.</p>':'<p class="muted">Tu código está en la tarjeta que te entregó la junta electoral.</p>');$('#dni').oninput=()=>{$('#dni').value=$('#dni').value.replace(/\D/g,'').slice(0,8);};$('#login').onsubmit=async e=>{e.preventDefault();try{token=(await api('login',{dni:$('#dni').value.trim(),code:$('#code').value.trim()})).token;notice();await dashboard();}catch(e){notice(e.message);}};}
async function logout(){reviewedCommittees.clear();refreshLearningGate();try{await api('logout');}finally{token='';notice();login();}}
async function dashboard(){$('#acceso').classList.remove('voting-focus');status=await api('status');content.innerHTML='<h2>Tus elecciones</h2><p>Cada comité tiene una cédula independiente.</p>'+cfg.elections.filter(e=>status.eligible.includes(e.id)).map(e=>'<div class="card"><h3>'+esc(e.title)+'</h3><p>'+(status.voted.includes(e.id)?'Participación registrada':'Pendiente de participación')+'</p><button class="primary" data-election="'+esc(e.id)+'" '+(status.voted.includes(e.id)?'disabled':'')+'>Abrir cédula</button></div>').join('')+'<button id="logout">Cerrar sesión</button>';document.querySelectorAll('[data-election]').forEach(b=>b.onclick=()=>ballot(cfg.elections.find(e=>e.id===b.dataset.election)));$('#logout').onclick=logout;}
function ballot(e,previous=[]){$('#acceso').classList.add('voting-focus');notice(e.ready===false?e.pendingReason:'');content.innerHTML='<h2>'+esc(e.title)+'</h2><p>Selecciona '+e.total+' candidatura o elige voto en blanco.</p><p class="muted">'+Object.entries(e.groups).map(([g,n])=>esc(g)+': '+n).join(' · ')+'</p><form id="ballot">'+e.candidates.map(c=>'<label class="candidate"><input name="candidate" type="radio" value="'+esc(c.id)+'"><span>'+'<b class="candidate-name">'+esc(c.number?String(c.number).padStart(2,'0')+' · ':'')+esc(c.name)+'</b>'+(c.role?'<small class="candidate-detail">'+esc(c.role)+'</small>':'')+(c.site?'<small class="candidate-detail">'+esc(c.site)+'</small>':'')+(c.group?' · '+esc(c.group):'')+'</span></label>').join('')+'<label class="candidate"><input id="blank" name="candidate" value="" type="radio">Voto en blanco</label><div class="actions"><button class="primary" type="submit">Revisar y confirmar →</button><button type="button" id="back">Volver</button></div></form>';if(e.ready===false)document.querySelectorAll('#ballot input, #ballot button.primary').forEach(el=>el.disabled=true);decorateBallot(e,previous);$('#back').onclick=()=>dashboard().catch(e=>notice(e.message));$('#blank').onchange=()=>{};$('#ballot').onsubmit=event=>{event.preventDefault();const selection=[...document.querySelectorAll('[name=candidate]:not(#blank):checked')].map(c=>c.value);if(!$('#blank').checked&&selection.length!==e.total){$('#action-hint').textContent='Selecciona '+e.total+' candidaturas o marca voto en blanco para continuar.';return;}for(const [group,count] of Object.entries(e.groups)){if(selection.length&&selection.filter(id=>e.candidates.find(c=>c.id===id).group===group).length!==count)return notice('Revisa la composición requerida para esta cédula.');}review(e,selection);};}
function review(e,selection){notice();content.innerHTML='<h2>Confirma tu voto</h2><p>'+esc(e.title)+'</p><div class="card">'+(selection.length?selection.map(id=>esc(e.candidates.find(c=>c.id===id).name)).join('<br>'):'Voto en blanco')+'</div><p>Una vez registrado, no podrás cambiarlo. La confirmación registra tu participación sin mostrar tu elección.</p><div class="actions"><button class="primary" id="send">Confirmar y registrar</button><button id="edit">Volver a la cédula</button></div>';content.insertAdjacentHTML('afterbegin',steps(2));$('#edit').onclick=()=>ballot(e,selection);$('#send').onclick=async()=>{$('#send').disabled=true;$('#edit').disabled=true;$('#send').classList.add('is-loading');$('#send').textContent='Registrando voto…';content.setAttribute('aria-busy','true');try{await api('vote',{election:e.id,selection});showSuccess(e);}catch(error){notice(error.message+' Si hubo una interrupción, vuelve a ingresar para consultar tu participación antes de reintentar.');$('#send').disabled=false;$('#edit').disabled=false;$('#send').classList.remove('is-loading');$('#send').textContent='Confirmar y registrar';}finally{content.removeAttribute('aria-busy');}};}
$('#admin').onclick=async()=>{if(token)await logout();notice();content.innerHTML='<h2>Panel de la junta electoral</h2><form id="adminform"><label for="key">Clave de administración</label><input id="key" type="password" required autocomplete="off"><div class="actions"><button class="primary">Consultar participación</button><button type="button" id="return">Volver</button></div></form><div id="report"></div>';$('#return').onclick=login;$('#adminform').onsubmit=async e=>{e.preventDefault();try{const report=await api('admin',{key:$('#key').value});$('#key').value='';$('#report').innerHTML='<h3>Participación por comité</h3>'+report.elections.map(r=>'<div class="card"><strong>'+esc(r.title)+'</strong><p>'+r.participation+' participaciones de '+r.eligible+' personas habilitadas.</p>'+(r.results?'<pre>'+esc(JSON.stringify(r.results,null,2))+'</pre>':'<p class="muted">Escrutinio disponible después del cierre oficial.</p>')+'</div>').join('')+'<button id="export">Descargar reporte JSON</button>';$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='reporte-electoral.json';a.click();URL.revokeObjectURL(url);};}catch(e){notice(e.message);}};};
fetch('/api/config').then(r=>r.json()).then(c=>{cfg=c;$('#demo').hidden=c.mode!=='demo';login();}).catch(()=>notice('No se pudo conectar con el servidor.'));

function steps(active){return '<ol class="vote-steps" aria-label="Pasos de votación">'+['Elige','Revisa','Confirma'].map((label,i)=>'<li class="'+(i+1===active?'current':i+1<active?'complete':'')+'"><span>'+(i+1<active?'✓':i+1)+'</span>'+label+'</li>').join('')+'</ol>';}
function decorateBallot(e,previous){
 content.insertAdjacentHTML('afterbegin',steps(1));const form=$('#ballot');const options=document.createElement('div');options.className='candidate-options';options.setAttribute('role','group');options.setAttribute('aria-label','Candidaturas y voto en blanco');form.querySelectorAll('.candidate').forEach(el=>options.append(el));form.prepend(options);form.querySelector('.actions').insertAdjacentHTML('afterbegin','<span class="action-hint" id="action-hint" aria-live="polite"></span>');
 form.insertAdjacentHTML('afterbegin','<div class="selection-meter" role="status" aria-live="polite"><span id="selection-count"></span><progress id="selection-progress" max="'+e.total+'" value="0" aria-label="Candidaturas seleccionadas"></progress></div>');
 for(const input of form.querySelectorAll('[name=candidate]:not(#blank)'))input.checked=previous.includes(input.value);
 function update(){const blank=$('#blank').checked,inputs=[...form.querySelectorAll('[name=candidate]:not(#blank)')],n=inputs.filter(i=>i.checked).length;
 $('#selection-count').textContent=e.ready===false?'Cédula pendiente de validación':blank?'Voto en blanco seleccionado':n+' de '+e.total+' candidatura seleccionada';
 $('#selection-progress').value=blank?e.total:n;$('#action-hint').textContent=e.ready===false?'Pendiente de validación por la junta.':blank||n===e.total?'Selección lista. Continúa para confirmar.':'Falta seleccionar '+(e.total-n)+' candidatura'+(e.total-n===1?'':'s')+' o marcar voto en blanco.';
 for(const input of inputs)input.disabled=e.ready===false;}
 form.addEventListener('change',update);update();
}
function showSuccess(e){
 notice();content.innerHTML=steps(3)+'<div class="vote-success"><div class="success-seal" aria-hidden="true">✓</div><div class="eyebrow">PARTICIPACIÓN REGISTRADA</div><h2>¡Gracias por participar!</h2><p>Tu voto para el comité de '+esc(e.title)+' fue registrado.</p><p class="muted">Esta confirmación no muestra tus preferencias.</p><div class="actions"><button class="primary" id="continue-voting">Ver mis elecciones →</button><button id="finish-session">Cerrar sesión</button></div></div>';
 $('#continue-voting').onclick=()=>dashboard().catch(error=>notice(error.message));$('#finish-session').onclick=logout;
}
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
new MutationObserver(records=>{if(!records.some(r=>r.target===content))return;const heading=content.querySelector('h2');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});if($('#acceso').classList.contains('voting-focus'))$('#acceso').scrollIntoView({block:'start',behavior:'instant'});}if(!reducedMotion.matches)content.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});}).observe(content,{childList:true});

if('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
 const sections=document.querySelectorAll('.access-info,.committee,.board-member,.section-heading');
 const reveal=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');entry.target.classList.remove('reveal-pending');reveal.unobserve(entry.target);}},{threshold:0.08});
 sections.forEach(el=>{el.classList.add('reveal-item','reveal-pending');reveal.observe(el);});
}

$('#admin').onclick=async()=>{
 if(token)await logout();notice();$('#acceso').classList.add('voting-focus');
 content.innerHTML='<div class="eyebrow">JUNTA ELECTORAL</div><h2>Control de participación</h2><p>Consulta quién participó en cada comité. Las preferencias de voto son secretas.</p><form id="adminform"><label for="member">Integrante de la junta</label><select id="member" required><option value="">Elige tu nombre</option>'+(cfg.board||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.role)+' · '+esc(m.name)+'</option>').join('')+'</select><label for="key">Clave personal</label><input id="key" type="password" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><div class="actions"><button class="primary">Ingresar al panel</button><button type="button" id="return">Volver</button></div></form>'+(cfg.mode==='demo'?'<p class="muted">Prueba: elige cualquier integrante y usa la clave JUNTA-DEMO.</p>':'');
 $('#return').onclick=login;
 $('#adminform').onsubmit=async event=>{event.preventDefault();const key={member:$('#member').value,key:$('#key').value.trim()};try{const report=await api('admin',{key});renderAdmin(report,key);}catch(error){notice(error.message);}};
};
function renderAdmin(report,key){
 notice();content.innerHTML='<div class="admin-heading"><div><div class="eyebrow">JUNTA ELECTORAL · 2026–2028</div><h2>Control de participación</h2><p>Actualizado: '+esc(new Date().toLocaleTimeString('es-PE',{timeZone:'America/Lima'}))+' · Hora de Perú</p></div><div class="actions"><button id="refresh-admin">Actualizar</button><button id="exit-admin">Salir del panel</button></div></div>'+
 (report.demo?'<p class="admin-demo">'+(report.voters.some(v=>v.employee==='12345678')?'Padrón de demostración: el DNI 12345678 es la cuenta de prueba. Los trabajadores reales aparecerán al cargar el padrón.':'Ensayo con el padrón real: estos votos no cuentan. Para la elección, usa PASAR-A-OFICIAL.')+'</p>':'')+
 '<div class="admin-stats">'+report.elections.map(e=>{const pct=e.eligible?Math.round(100*e.participation/e.eligible):0;return '<article class="admin-stat"><h3>'+esc(e.title)+'</h3><div class="admin-number">'+pct+'<small>% de participación</small></div><progress max="100" value="'+pct+'" aria-label="Porcentaje de participación"></progress><div class="stat-details"><span><b>'+e.participation+'</b> Ya votaron</span><span><b>'+(e.eligible-e.participation)+'</b> Falta votar</span><span><b>'+e.eligible+'</b> Habilitados</span></div></article>';}).join('')+'</div>'+
 '<div class="admin-toolbar"><h3>¿Quién ya votó?</h3><button id="export-participation">Descargar CSV</button></div><div class="admin-filters"><label>Buscar por DNI o nombre<input id="worker-search" type="search" placeholder="DNI o nombre"></label><label>Mostrar<select id="worker-filter"><option value="all">Todos</option><option value="pending">Con votaciones pendientes</option><option value="done">Participación completa</option></select></label></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>DNI</th><th>Nombre</th>'+report.elections.map(e=>'<th>'+esc(e.title)+'</th>').join('')+'</tr></thead><tbody id="worker-rows"></tbody></table></div><p class="muted">Solo se muestra si participó. No se relaciona a los trabajadores con las papeletas.</p>'+
 '<section class="escrutinio" id="escrutinio"></section>';
 $('.admin-filters').insertAdjacentHTML('beforeend','<label>Comité<select id="committee-filter"><option value="all">Ambos comités</option>'+report.elections.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('')+'</select></label>');
 enhancePanel(report);signatureAdmin(report,key);
 const state=(v,id)=>!v.eligible.includes(id)?'No le corresponde':v.voted.includes(id)?'Ya votó':'Falta votar';
 function rows(){const plain=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(),query=plain($('#worker-search').value.trim()),filter=$('#worker-filter').value;const shown=report.voters.filter(v=>plain(v.employee+' '+(v.name||'')).includes(query)).filter(v=>{const committee=$('#committee-filter').value;if(committee!=='all'&&!v.eligible.includes(committee))return false;const pending=committee==='all'?v.eligible.some(id=>!v.voted.includes(id)):!v.voted.includes(committee);return filter==='all'||(filter==='pending'?pending:!pending);});$('#worker-rows').innerHTML=shown.map(v=>'<tr><td><strong>'+esc(v.employee)+'</strong></td><td>'+(v.name?esc(v.name):'<span class="muted">—</span>')+'</td>'+report.elections.map(e=>'<td><span class="participation-pill '+(state(v,e.id)==='Ya votó'?'done':'pending')+'">'+esc(state(v,e.id))+'</span></td>').join('')+'</tr>').join('')||'<tr><td colspan="'+(report.elections.length+2)+'">No hay trabajadores que coincidan con el filtro.</td></tr>';}
 $('#worker-search').oninput=rows;$('#worker-filter').onchange=()=>{rows();document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===$('#worker-filter').value)));};$('#committee-filter').onchange=rows;rows();
 $('#exit-admin').onclick=()=>{key='';login();};
 $('#refresh-admin').onclick=async()=>{try{renderAdmin(await api('admin',{key}),key);}catch(error){notice(error.message);}};
 $('#export-participation').onclick=()=>{const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'"+String(v).charAt(0)).replaceAll('"','""')+'"';const csv=[['DNI','Nombre',...report.elections.map(e=>e.title)],...report.voters.map(v=>[v.employee,v.name||'',...report.elections.map(e=>state(v,e.id))])].map(row=>row.map(cell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='participacion-electoral.csv';a.click();URL.revokeObjectURL(url);};
}

function enhancePanel(report){
 const heading=$('.admin-heading');
 heading.insertAdjacentHTML('beforebegin','<div class="panel-banner"><img src="/equipo.jpg" alt="Imagen referencial de trabajo en equipo"><div><span>IMAGE & HEALTH</span><strong>Una jornada para<br>participar y construir.</strong><small>Junta electoral · 02 noviembre 2026</small></div></div>');
 document.querySelectorAll('.admin-stat').forEach((card,index)=>{
  const e=report.elections[index],pct=e.eligible?Math.round(100*e.participation/e.eligible):0;
  card.insertAdjacentHTML('afterbegin','<div class="stat-photo"><img src="'+(e.id==='sst'?'/sst.jpg':'/hs.jpg')+'" alt="Imagen referencial"><span>'+ (e.id==='sst'?'SEGURIDAD Y SALUD':'RESPETO EN EL TRABAJO')+'</span></div>');
  const number=card.querySelector('.admin-number');
  number.innerHTML='<svg class="participation-ring" viewBox="0 0 120 120" role="img" aria-label="'+pct+' por ciento de participación"><circle class="ring-track" cx="60" cy="60" r="49"/><circle class="ring-value" cx="60" cy="60" r="49" pathLength="100" stroke-dasharray="'+pct+' 100" transform="rotate(-90 60 60)"/><text x="60" y="65" text-anchor="middle">'+pct+'%</text></svg><div><strong>'+e.participation+' de '+e.eligible+'</strong><small>personas participaron</small></div>';
  card.querySelector('progress').remove();
  card.insertAdjacentHTML('beforeend','<button class="inspect-committee" data-committee="'+esc(e.id)+'">Ver participación de este comité <span>→</span></button>');
 });
 const completed=report.voters.filter(v=>v.eligible.length&&v.eligible.every(id=>v.voted.includes(id))).length;
 $('.admin-filters').insertAdjacentHTML('beforebegin','<div class="quick-filters" aria-label="Filtros rápidos"><button data-filter="all" aria-pressed="true">Todos <b>'+report.voters.length+'</b></button><button data-filter="done" aria-pressed="false">Votaron en todo <b>'+completed+'</b></button><button data-filter="pending" aria-pressed="false">Les falta votar <b>'+(report.voters.length-completed)+'</b></button></div>');
 document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{$('#worker-filter').value=button.dataset.filter;$('#worker-filter').dispatchEvent(new Event('change'));});
 document.querySelectorAll('[data-committee]').forEach(button=>button.onclick=()=>{$('#committee-filter').value=button.dataset.committee;$('#committee-filter').dispatchEvent(new Event('change'));$('.admin-toolbar').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});});
}

const baseDashboard=dashboard;
dashboard=async function(){await baseDashboard();content.querySelectorAll('[data-election]').forEach(button=>{const id=button.dataset.election;if(!status.voted.includes(id))return;const action=document.createElement('button');action.className='signature-action';action.textContent=status.signed.includes(id)?'Descargar constancia firmada':'Firmar mi participación';action.onclick=async()=>{try{if(status.signed.includes(id))downloadReceipt(await api('receipt',{election:id}));else signatureForm(cfg.elections.find(e=>e.id===id));}catch(err){notice(err.message);}};button.after(action);});};
const baseSuccess=showSuccess;
showSuccess=function(e){baseSuccess(e);const button=document.createElement('button');button.className='primary';button.textContent='Firmar mi participación';button.onclick=()=>signatureForm(e);$('.vote-success .actions').prepend(button);};
function signatureForm(e){
 notice();$('#acceso').classList.add('voting-focus');
 content.innerHTML='<div class="eyebrow">CONSTANCIA DE PARTICIPACIÓN</div><h2>Firma electrónica</h2><p>'+esc(e.title)+'</p><p>Tu voto ya está registrado. Esta firma solo acredita tu participación.</p><label for="signer-name">Nombre completo del firmante</label><input id="signer-name" type="text" maxlength="150" autocomplete="name"><p class="muted">Nombre declarado por el firmante. No reemplaza la verificación del padrón.</p><label id="signature-label">Dibuja tu firma con el dedo, mouse o lápiz</label><canvas id="signature-pad" width="800" height="240" aria-labelledby="signature-label">Este navegador no permite dibujar la firma.</canvas><button id="clear-signature">Limpiar firma</button><label class="signature-consent"><input id="accept-signature" type="checkbox"> <span>Declaro que participé en esta elección y acepto firmar electrónicamente esta constancia de participación, que no contiene mi preferencia de voto.</span></label><div class="actions"><button class="primary" id="save-signature">Firmar y guardar constancia</button><button id="later-signature">Firmar después</button></div>';
 const canvas=$('#signature-pad'),ctx=canvas.getContext('2d');let strokes=[],current=null,pointer=null;
 ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#302333';
 const point=event=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(event.clientY-b.top)/b.height))];};
 canvas.onpointerdown=event=>{if(pointer!==null)return;event.preventDefault();pointer=event.pointerId;canvas.setPointerCapture(pointer);current=[point(event)];};
 canvas.onpointermove=event=>{if(event.pointerId!==pointer||!current)return;if(strokes.reduce((n,s)=>n+s.length,0)+current.length>=3900)return;const p=point(event),prev=current.at(-1);ctx.beginPath();ctx.moveTo(prev[0]*800,prev[1]*240);ctx.lineTo(p[0]*800,p[1]*240);ctx.stroke();current.push(p);};
 const finish=()=>{if(current&&current.length>1)strokes.push(current);current=null;pointer=null;};
 canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 $('#clear-signature').onclick=()=>{strokes=[];current=null;pointer=null;ctx.clearRect(0,0,800,240);};
 $('#later-signature').onclick=()=>dashboard().catch(err=>notice(err.message));
 $('#save-signature').onclick=async()=>{if(!$('#accept-signature').checked)return notice('Acepta la declaración para firmar.');if(!strokes.length)return notice('Dibuja tu firma antes de guardar.');const button=$('#save-signature');button.disabled=true;$('#later-signature').disabled=true;try{const receipt=await api('sign',{election:e.id,name:$('#signer-name').value,accepted:true,strokes});content.innerHTML='<div class="vote-success"><div class="success-seal">✓</div><h2>Constancia firmada</h2><p>Tu participación y tu firma quedaron registradas.</p><div class="actions"><button class="primary" id="download-signed">Descargar constancia</button><button id="signed-return">Ver mis elecciones</button></div></div>';notice();$('#download-signed').onclick=()=>downloadReceipt(receipt);$('#signed-return').onclick=()=>dashboard().catch(err=>notice(err.message));}catch(err){notice(err.message+' Si hubo una interrupción, vuelve a Mis elecciones para comprobar si se guardó.');button.disabled=false;$('#later-signature').disabled=false;}};
}
function downloadReceipt(receipt){
 const paths=receipt.strokes.map(s=>'<polyline fill="none" stroke="#302333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="'+s.map(p=>(p[0]*800).toFixed(2)+','+(p[1]*240).toFixed(2)).join(' ')+'"/>').join('');
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><title>Constancia de participación</title><style>body{font:16px Arial;color:#302333;max-width:850px;margin:50px auto;padding:25px}h1{color:#861079}dt{font-weight:bold;margin-top:16px}dd{margin:5px 0}svg{width:100%;max-width:650px;border:1px solid #ddd}small{overflow-wrap:anywhere} @media print{body{margin:0}}</style><h1>Constancia de participación</h1><h2>'+esc(receipt.company)+'</h2>'+(receipt.demo?'<p><b>DEMOSTRACIÓN · No acredita participación en una elección oficial.</b></p>':'')+'<dl><dt>DNI</dt><dd>'+esc(receipt.employee)+'</dd><dt>Nombre declarado por el firmante</dt><dd>'+esc(receipt.signerName)+'</dd><dt>Comité</dt><dd>'+esc(receipt.committee)+'</dd><dt>Periodo</dt><dd>'+esc(receipt.period)+'</dd><dt>Fecha de firma (Perú)</dt><dd>'+esc(new Date(receipt.signedAt).toLocaleString('es-PE',{timeZone:'America/Lima'}))+'</dd></dl><p>'+esc(receipt.consent)+'</p><svg viewBox="0 0 800 240" aria-label="Firma del participante">'+paths+'</svg><p>'+esc(receipt.method)+'</p><p>Esta constancia no contiene la preferencia de voto. Firma electrónica dibujada; no es una firma digital certificada.</p><small>ID: '+esc(receipt.id)+'<br>SHA-256 del registro: '+esc(receipt.checksum)+'</small></html>';
 openDoc(membrete(html),'constancia-'+receipt.election+'-'+receipt.id+'.html');
}
function downloadSignatureList(list){
 const lima=d=>new Date(d).toLocaleString('es-PE',{timeZone:'America/Lima'});
 const svg=st=>'<svg viewBox="0 0 800 240">'+st.map(s=>'<polyline fill="none" stroke="#302333" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" points="'+s.map(p=>(p[0]*800).toFixed(1)+','+(p[1]*240).toFixed(1)).join(' ')+'"/>').join('')+'</svg>';
 const sections=list.elections.map(e=>'<section><h2>'+esc(e.title)+'</h2><p class="sum">Votaron: <b>'+e.voted+'</b> · Firmaron: <b>'+e.signatures.length+'</b>'+(e.voted>e.signatures.length?' · Firma pendiente: <b>'+(e.voted-e.signatures.length)+'</b>':'')+'</p>'+(e.signatures.length?'<table><thead><tr><th>N.°</th><th>DNI</th><th>Nombres y apellidos</th><th>Fecha y hora</th><th>Firma</th></tr></thead><tbody>'+e.signatures.map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.employee)+'</td><td>'+esc(s.signerName)+'</td><td>'+esc(lima(s.signedAt))+'</td><td class="sig">'+svg(s.strokes)+'</td></tr>').join('')+'</tbody></table>':'<p>Aún no hay firmas.</p>')+'</section>').join('');
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><title>Lista general de firmas</title><style>body{font:14px Arial;color:#302333;max-width:1000px;margin:30px auto;padding:0 20px}h1{color:#861079;margin-bottom:4px}h2{color:#861079;border-bottom:2px solid #861079;padding-bottom:4px;margin-top:34px}.meta{color:#555}.demo{background:#fff3cd;padding:8px 12px;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:middle}th{background:#f4e6f2;white-space:nowrap}td.sig{width:210px;padding:2px}td.sig svg{width:200px;height:60px;display:block}tr{page-break-inside:avoid}section+section{page-break-before:always}button{font:15px Arial;padding:10px 18px;background:#861079;color:#fff;border:0;border-radius:6px;cursor:pointer}.foot{margin-top:40px;color:#555;font-size:12px}.firmas-junta{display:grid;grid-template-columns:1fr 1fr;gap:70px 40px;margin-top:70px;page-break-inside:avoid}.firmas-junta div{font-size:12px;border-top:1px solid #302333;padding-top:6px;text-align:center}@media print{button{display:none}body{margin:0}}</style><button onclick="print()">Imprimir / Guardar como PDF</button><h1>Lista general de firmas de participación</h1><p class="meta"><b>'+esc(list.company)+'</b> · Periodo '+esc(list.period)+'<br>Generada el '+esc(lima(list.generatedAt))+'</p>'+(list.demo?'<p class="demo">DEMOSTRACIÓN · No corresponde a una elección oficial.</p>':'')+sections+'<p class="foot">Esta lista acredita la participación; no contiene la preferencia de voto de nadie. Firma electrónica dibujada por cada trabajador al votar. Cada constancia individual se puede descargar por separado desde el panel de la junta.</p><div class="firmas-junta">'+((cfg.board&&cfg.board.length)?cfg.board.map(m=>'<div><b>'+esc(m.name.toLocaleUpperCase('es'))+'</b><br>'+esc(m.role)+' de la Junta Electoral</div>').join(''):'<div>Presidente(a) de la Junta Electoral</div><div>Secretario(a) de la Junta Electoral</div>')+'</div></html>';
 openDoc(membrete(html),'lista-general-firmas.html');
}
function signatureAdmin(report,key){
 content.insertAdjacentHTML('beforeend','<section class="signature-register"><h3>Firmas de participación</h3><p>Las firmas se guardan separadas de las papeletas.</p><div class="signature-all"><button class="primary" id="download-all-signatures">Descargar lista general de firmas</button><span>Un solo documento con todos los trabajadores, su nombre, la fecha y su firma, separado por comité. Se puede imprimir o guardar como PDF.</span></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>DNI</th><th>Nombre</th><th>Comité</th><th>Constancia</th></tr></thead><tbody>'+report.voters.flatMap(v=>report.elections.filter(e=>v.voted.includes(e.id)).map(e=>'<tr><td>'+esc(v.employee)+'</td><td>'+(v.name?esc(v.name):'—')+'</td><td>'+esc(e.title)+'</td><td>'+(v.signed.includes(e.id)?'<button data-receipt-worker="'+esc(v.employee)+'" data-receipt-election="'+esc(e.id)+'">Firmada · Descargar</button>':'<span class="participation-pill pending">Firma pendiente</span>')+'</td></tr>')).join('')+'</tbody></table></div></section>');
 $('#download-all-signatures').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{downloadSignatureList(await api('admin-signatures',{key}));}catch(err){notice(err.message);}finally{b.disabled=false;}};
 content.querySelectorAll('[data-receipt-worker]').forEach(b=>b.onclick=async()=>{try{downloadReceipt(await api('admin-receipt',{key,employee:b.dataset.receiptWorker,election:b.dataset.receiptElection}));}catch(err){notice(err.message);}});
}

const committeeGuides={
 sst:{title:'Comité de Seguridad y Salud en el Trabajo',what:'Es un órgano de participación conjunta del empleador y los trabajadores que promueve la seguridad y la salud, asesora y vigila la prevención de riesgos laborales.',functions:['Aprobar y vigilar el cumplimiento del Reglamento Interno de SST y del Plan Anual de SST.','Realizar inspecciones de las instalaciones y proponer mejoras para prevenir riesgos.','Investigar las causas de accidentes, incidentes y enfermedades ocupacionales, y recomendar medidas para evitar su repetición.','Promover la capacitación y la participación de los trabajadores en la prevención.'],why:'Ayuda a identificar peligros, prevenir daños y dar seguimiento a las mejoras del entorno de trabajo. La participación de los trabajadores aporta conocimiento de lo que ocurre en cada puesto.',note:'La responsabilidad del empleador de garantizar la seguridad y salud no se transfiere al comité.',source:'https://cdn.www.gob.pe/uploads/document/file/6575074/5722542-comite-sst_2024_lelvf-rev-1.pdf',label:'MTPE · Funciones del Comité de SST (artículo 42 del Reglamento de la Ley 29783)'},
 hs:{title:'Comité de Intervención frente al Hostigamiento Sexual',what:'Es el órgano que investiga los casos de hostigamiento sexual y emite recomendaciones de sanción y otras medidas. Incluye representantes del empleador y de los trabajadores.',functions:['Investigar los hechos que Recursos Humanos o quien haga sus veces le comunica.','Recabar y evaluar los elementos de la investigación, respetando el derecho de defensa.','Emitir un informe con conclusiones y recomendaciones de sanción o archivo, según corresponda.','Recomendar medidas adicionales para evitar nuevos casos, actuando con confidencialidad y evitando la revictimización.'],why:'Permite que los trabajadores participen en la investigación y contribuye a proteger la dignidad y el respeto en el trabajo mediante un procedimiento que atienda los casos.',note:'El comité investiga y recomienda. La decisión de sanción corresponde a Recursos Humanos o quien haga sus veces. Esta página electoral no es un canal de denuncias.',source:'https://www.gob.pe/institucion/mtpe/informes-publicaciones/4622972-procedimiento-interno-de-investigacion-sobre-hostigamiento-sexual-laboral-en-el-sector-privado',label:'MTPE · Procedimiento de investigación y sanción en el sector privado'}
};
document.querySelectorAll('[data-info]').forEach(button=>button.onclick=()=>{
 const guide=committeeGuides[button.dataset.info],panel=$('#committee-info');
 document.querySelectorAll('[data-info]').forEach(b=>{const selected=b===button;b.setAttribute('aria-expanded',String(selected));b.classList.toggle('selected',selected);});
 panel.hidden=false;panel.setAttribute('aria-labelledby','guide-title');
 panel.innerHTML='<div class="guide-heading"><h3 id="guide-title">'+esc(guide.title)+'</h3><button id="close-guide" aria-label="Cerrar información del comité">Cerrar ×</button></div><div class="guide-columns"><div><h4>¿Qué es y de qué se encarga?</h4><p>'+esc(guide.what)+'</p><h4>¿Por qué es importante?</h4><p>'+esc(guide.why)+'</p></div><div><h4>Sus principales funciones</h4><ul>'+guide.functions.map(f=>'<li><span aria-hidden="true">✓</span><p>'+esc(f)+'</p></li>').join('')+'</ul></div></div><p class="guide-note">'+esc(guide.note)+'</p><a class="guide-source" href="'+guide.source+'" target="_blank" rel="noopener">'+esc(guide.label)+' ↗</a>';
 $('#close-guide').onclick=()=>{panel.hidden=true;button.focus();document.querySelectorAll('[data-info]').forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('selected');});};
 panel.focus({preventScroll:true});panel.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'nearest'});
 if(!reducedMotion.matches)panel.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:250});
});

document.querySelectorAll('[data-info]').forEach(button=>button.onclick=()=>{
 const id=button.dataset.info,g=committeeGuides[id],panel=$('#committee-info'),isSst=id==='sst';
 const titles=isSst?['Planificar la prevención','Revisar el entorno','Aprender de los incidentes','Promover la participación']:['Investigar los hechos','Evaluar la información','Emitir recomendaciones','Evitar nuevos casos'];
 const symbols=isSst?['▤','⌕','◇','◎']:['⌕','▤','✓','◎'];
 document.querySelectorAll('[data-info]').forEach(b=>{b.setAttribute('aria-expanded',String(b===button));b.classList.toggle('selected',b===button);});
 panel.hidden=false;panel.className='committee-info visual-guide '+(isSst?'guide-sst':'guide-hs');panel.setAttribute('aria-labelledby','guide-title');
 panel.innerHTML='<div class="guide-cover"><img src="'+(isSst?'/sst.jpg':'/hs.jpg')+'" alt="Fotografía referencial de '+(isSst?'profesionales de salud trabajando en equipo':'un equipo reunido')+'"><div class="guide-cover-copy"><span class="guide-kicker">'+(isSst?'PREVENCIÓN Y BIENESTAR':'DIGNIDAD Y RESPETO')+'</span><h3 id="guide-title">'+esc(g.title)+'</h3><p>'+ (isSst?'Cuidar el trabajo también es cuidar a las personas.':'Un entorno de respeto se construye con participación.')+'</p><small>Imagen referencial</small></div><button id="close-guide" aria-label="Cerrar información del comité">Cerrar ×</button></div>'+
 '<div class="guide-body"><div class="guide-overview"><div><span class="guide-kicker">CONOCE SU LABOR</span><h4>¿De qué se encarga?</h4><p>'+esc(g.what)+'</p></div><aside class="guide-purpose"><span aria-hidden="true" class="purpose-icon">'+(isSst?'✚':'◎')+'</span><h4>¿Por qué importa?</h4><p>'+esc(g.why)+'</p></aside></div><div class="guide-functions-heading"><div><span class="guide-kicker">DEL COMPROMISO A LA ACCIÓN</span><h4>Sus principales funciones</h4></div><p>Selecciona una tarjeta para conocer más.</p></div><div class="function-grid">'+g.functions.map((f,i)=>'<details class="function-card"><summary><span class="function-symbol" aria-hidden="true">'+symbols[i]+'</span><span><small>0'+(i+1)+'</small><strong>'+titles[i]+'</strong></span><b class="expand-symbol" aria-hidden="true">+</b></summary><p>'+esc(f)+'</p></details>').join('')+'</div><div class="guide-bottom"><p class="guide-note">'+esc(g.note)+'</p><a class="guide-source" href="'+g.source+'" target="_blank" rel="noopener">'+esc(g.label)+' ↗</a></div></div>';
 $('#close-guide').onclick=()=>{panel.hidden=true;button.focus();document.querySelectorAll('[data-info]').forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('selected');});};
 panel.querySelectorAll('.function-card').forEach(card=>card.addEventListener('toggle',()=>{card.querySelector('.expand-symbol').textContent=card.open?'−':'+';}));
 panel.focus({preventScroll:true});panel.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});
 if(!reducedMotion.matches)panel.animate([{opacity:0,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'ease-out'});
});

/* ===== Capa de interacción y movimiento ===== */
(()=>{
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const head=document.querySelector('header'),bar=document.createElement('div');bar.className='scroll-progress';document.body.append(bar);
 const heroImgs=document.querySelectorAll('.hero-photo>img');
 function onScroll(){const y=scrollY,max=document.documentElement.scrollHeight-innerHeight;bar.style.setProperty('transform','scaleX('+(max>0?Math.min(1,y/max):0)+')');head.classList.toggle('is-scrolled',y>10);if(!still&&y<900)heroImgs.forEach(i=>i.style.setProperty('margin-top',(y*.12)+'px'));}
 addEventListener('scroll',onScroll,{passive:true});onScroll();

 /* Cuenta regresiva hacia la apertura */
 let box=null;
 const pad=n=>String(n).padStart(2,'0');
 function tick(){
  if(typeof cfg==='undefined'||!cfg||!cfg.opens)return;
  const hero=document.querySelector('.hero');if(!hero)return;
  if(!box){box=document.createElement('div');box.className='countdown';box.setAttribute('role','timer');hero.append(box);}
  const now=Date.now(),open=Date.parse(cfg.opens),close=Date.parse(cfg.closes);
  if(now>=close){box.className='countdown is-open';box.innerHTML='<small>PROCESO ELECTORAL</small><strong>Votación cerrada</strong>';return;}
  if(now>=open){box.className='countdown is-open';box.innerHTML='<small>HASTA LAS 4:00 P. M.</small><strong>Votación abierta ahora</strong>';return;}
  const s=Math.floor((open-now)/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;
  box.className='countdown';
  box.innerHTML='<small>FALTAN PARA ABRIR LA VOTACIÓN</small><div class="countdown-grid">'+[[d,'días'],[h,'horas'],[m,'min'],[sec,'seg']].map(([v,l])=>'<div class="countdown-unit"><b>'+pad(v)+'</b><span>'+l+'</span></div>').join('')+'</div>';
 }
 setInterval(tick,1000);tick();

 /* Efecto de onda en botones */
 document.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(!b||b.disabled||still)return;const r=b.getBoundingClientRect(),o=document.createElement('span');o.className='ripple';o.style.setProperty('left',(e.clientX-r.left)+'px');o.style.setProperty('top',(e.clientY-r.top)+'px');b.append(o);setTimeout(()=>o.remove(),650);});

 /* Avatares con iniciales en la cédula */
 const tones=['#861079','#46133f','#b0489f','#6a0f60','#a3338f','#5a1450'];
 const baseBallot=ballot;
 ballot=function(e,previous){
  baseBallot(e,previous);
  document.querySelectorAll('#ballot .candidate').forEach((label,i)=>{
   const name=label.querySelector('.candidate-name');if(!name)return;
   const words=name.textContent.replace(/^\d+\s*·\s*/,'').trim().split(/\s+/);
   const av=document.createElement('i');av.className='avatar';av.setAttribute('aria-hidden','true');av.textContent=(words[0][0]+(words[1]?words[1][0]:'')).toUpperCase();av.style.setProperty('--av',tones[i%tones.length]);
   label.querySelector('span').before(av);
  });
 };

 /* Mostrar u ocultar la credencial */
 const baseLogin=login;
 login=function(){
  baseLogin();
  const input=$('#code');if(!input)return;
  const wrap=document.createElement('div');wrap.className='pw-wrap';input.before(wrap);wrap.append(input);
  const t=document.createElement('button');t.type='button';t.className='pw-toggle';t.textContent='Mostrar';t.setAttribute('aria-label','Mostrar u ocultar el código');
  t.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';t.textContent=show?'Ocultar':'Mostrar';input.focus();};
  wrap.append(t);
 };

 /* Confeti al registrar el voto */
 function confetti(){
  if(still)return;
  const c=document.createElement('canvas');c.className='confetti';c.width=innerWidth;c.height=innerHeight;document.body.append(c);
  const g=c.getContext('2d'),cols=['#861079','#d46bc4','#f4c9ee','#46133f','#e8b84a','#2f7d79'];
  const ps=Array.from({length:140},()=>({x:innerWidth/2+(Math.random()-.5)*160,y:innerHeight*.45,vx:(Math.random()-.5)*14,vy:-Math.random()*13-4,s:Math.random()*7+4,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:cols[Math.random()*cols.length|0]}));
  let f=0;
  (function step(){g.clearRect(0,0,c.width,c.height);f++;for(const p of ps){p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;g.globalAlpha=Math.max(0,1-f/130);g.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);g.restore();}
   if(f<130)requestAnimationFrame(step);else c.remove();})();
 }
 const baseSuccess2=showSuccess;
 showSuccess=function(e){baseSuccess2(e);confetti();};

 /* Panel de la junta: anillos y contadores animados */
 const baseAdmin=renderAdmin;
 renderAdmin=function(report,key){
  baseAdmin(report,key);
  if(still)return;
  document.querySelectorAll('.ring-value').forEach(r=>{const target=r.getAttribute('stroke-dasharray');r.setAttribute('stroke-dasharray','0 100');requestAnimationFrame(()=>requestAnimationFrame(()=>r.setAttribute('stroke-dasharray',target)));});
  document.querySelectorAll('.stat-details b,.admin-number strong,.quick-filters b').forEach(el=>{
   const m=el.textContent.match(/^(\d+)(.*)$/);if(!m)return;const end=+m[1],rest=m[2],t0=performance.now();
   (function run(t){const k=Math.min(1,(t-t0)/900),v=Math.round(end*(1-Math.pow(1-k,3)));el.textContent=v+rest;if(k<1)requestAnimationFrame(run);})(t0);
  });
 };
})();

/* ===== Pantalla "Tus elecciones", pasos y sesión ===== */
(()=>{
 const lock='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm-2 3.5a2 2 0 1 1 4 0V6H6V4.5Z"/></svg>';
 const meta={sst:['01 · PREVENCIÓN','/sst.jpg'],hs:['02 · RESPETO','/hs.jpg']};
 const steps=[...document.querySelectorAll('.access-info li')];
 steps.forEach((li,i)=>li.firstElementChild.dataset.n='0'+(i+1));
 const chip=document.createElement('div');chip.className='session-chip';chip.setAttribute('role','timer');
 document.querySelector('.access-info').append(chip);
 let started=0;
 function setSteps(level){steps.forEach((li,i)=>{const done=i<level,active=i===level&&level<steps.length;li.classList.toggle('done',done);li.classList.toggle('active',active);li.firstElementChild.textContent=done?'✓':li.firstElementChild.dataset.n;});}
 setInterval(()=>{if(!started){chip.classList.remove('on');return;}const left=Math.max(0,1800-Math.floor((Date.now()-started)/1000));chip.classList.add('on');chip.innerHTML='Sesión activa · expira en <b>'+String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0')+'</b>';},1000);

 const baseLogin2=login;
 login=function(){baseLogin2();started=0;chip.classList.remove('on');setSteps(0);};

 const baseDash2=dashboard;
 dashboard=async function(){
  await baseDash2();
  if(!started)started=Date.now();
  const cards=[...content.querySelectorAll('.card')].filter(c=>c.querySelector('[data-election]'));
  const total=cards.length,done=cards.filter(c=>status.voted.includes(c.querySelector('[data-election]').dataset.election)).length;
  setSteps(done===total&&total?3:done?2:1);
  const first=content.querySelector('.card');
  if(first)first.insertAdjacentHTML('beforebegin','<div class="dash-summary"><svg viewBox="0 0 66 66" role="img" aria-label="'+done+' de '+total+' cédulas completadas"><circle class="t" cx="33" cy="33" r="27"/><circle class="v" cx="33" cy="33" r="27" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 33 33)"/><text x="33" y="39" text-anchor="middle">'+done+'/'+total+'</text></svg><div><strong>'+(done===total&&total?'¡Completaste todas tus cédulas!':done+' de '+total+' cédulas completadas')+'</strong><span>'+(done===total&&total?'Gracias por participar. Cierra tu sesión al terminar.':'Te faltan '+(total-done)+'. Cada comité se vota por separado.')+'</span></div></div>');
  const ring=content.querySelector('.dash-summary .v');
  if(ring)requestAnimationFrame(()=>requestAnimationFrame(()=>ring.setAttribute('stroke-dasharray',(total?100*done/total:0)+' 100')));
  cards.forEach(card=>{
   const btn=card.querySelector('[data-election]'),id=btn.dataset.election,voted=status.voted.includes(id),g=committeeGuides[id],[tag,img]=meta[id]||['',''];
   card.classList.add('dash-card');
   const body=document.createElement('div');body.className='dash-body';
   while(card.firstChild)body.append(card.firstChild);
   const h=body.querySelector('h3'),p=body.querySelector('p');
   if(p)p.remove();
   h.after(Object.assign(document.createElement('span'),{className:'chip '+(voted?'done':'pending'),textContent:voted?'Participación registrada':'Pendiente de participación'}));
   if(g){const b=document.createElement('p');b.className='blurb';b.textContent=g.what;body.querySelector('.chip').after(b);}
   const wrap=document.createElement('div');wrap.className='actions';wrap.append(btn,...body.querySelectorAll('.signature-action'));body.append(wrap);
   btn.textContent=voted?'Cédula enviada ✓':'Abrir cédula →';
   const photo=document.createElement('div');photo.className='dash-photo';photo.innerHTML='<img src="'+img+'" alt=""><span>'+tag+'</span>';
   card.append(photo,body);
  });
  const out=content.querySelector('#logout');
  if(out)out.insertAdjacentHTML('beforebegin','<p class="secret-note">'+lock+'<span>Tu voto es secreto: el sistema registra que participaste, no por quién votaste.</span></p>');
 };
 setSteps(0);
})();

/* ===== Portada en movimiento, cifras, candidaturas y revelado ===== */
(()=>{
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 /* Transición de imágenes de portada */
 const slides=[...document.querySelectorAll('.hero-slide')],dots=[...document.querySelectorAll('.hero-dot')];let cur=0,timer=null;
 function show(n){cur=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.classList.toggle('is-active',i===cur));dots.forEach((d,i)=>{d.classList.remove('is-active');void d.offsetWidth;d.classList.toggle('is-active',i===cur);d.setAttribute('aria-pressed',String(i===cur));});}
 function auto(){clearInterval(timer);if(!still&&slides.length>1)timer=setInterval(()=>show(cur+1),7000);}
 dots.forEach((d,i)=>d.onclick=()=>{show(i);auto();});
 if(slides.length){show(0);auto();}

 /* Revelado y contadores */
 const io=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue;const el=e.target;el.classList.add('in');io.unobserve(el);
  const n=el.querySelector('[data-count]');if(n&&!still){const end=+n.dataset.count,suf=n.dataset.suffix||'',t0=performance.now();(function run(t){const k=Math.min(1,(t-t0)/1400);n.textContent=Math.round(end*(1-Math.pow(1-k,4)))+suf;if(k<1)requestAnimationFrame(run);})(t0);}}},{threshold:.2});
 function watch(sel){document.querySelectorAll(sel).forEach(el=>{if(!still)el.classList.add('rv');io.observe(el);});}
 watch('.howto-steps li');
 const steps=document.querySelector('.howto-steps');if(steps)io.observe(steps);

 /* Iniciales para la junta */
 const tones=['#861079','#46133f','#b0489f','#6a0f60','#a3338f','#5a1450'];
 function avatar(name,i){const w=name.trim().split(/\s+/),a=document.createElement('i');a.className='avatar';a.setAttribute('aria-hidden','true');a.textContent=(w[0][0]+(w[1]?w[1][0]:'')).toUpperCase();a.style.setProperty('--av',tones[i%tones.length]);return a;}
 document.querySelectorAll('.board-member').forEach((m,i)=>{const h=m.querySelector('h3');if(h)m.prepend(avatar(h.textContent,i+2));});

 /* Carrusel de candidaturas */
 const track=document.getElementById('cands-track');
 const wait=setInterval(()=>{
  if(typeof cfg==='undefined'||!cfg||!track)return;clearInterval(wait);
  const list=(cfg.elections[0]||{candidates:[]}).candidates;
  const card=(c,i)=>{const d=document.createElement('article');d.className='cand-card';d.append(avatar(c.name,i));d.insertAdjacentHTML('beforeend','<small>CANDIDATURA '+String(c.number||i+1).padStart(2,'0')+'</small><strong>'+esc(c.name)+'</strong><p>'+esc(c.role||'')+'<br>'+esc(c.site||'')+'</p>');return d;};
  list.forEach((c,i)=>track.append(card(c,i)));
  if(!still){list.forEach((c,i)=>{const d=card(c,i);d.setAttribute('aria-hidden','true');track.append(d);});track.parentElement.classList.add('cands-mask');}
 },200);
})();

/* ===== Guía interactiva: ¿qué vas a votar? ===== */
(()=>{
 const box=document.getElementById('explainer');if(!box)return;
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const icons={
  plan:'<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  people:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5"/>',
  scale:'<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7h6zM18 7l-3 7h6z"/>',
  doc:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h4"/>',
  shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>',
  aid:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>',
  learn:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>'
 };
 const ico=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[k]+'</svg>';
 const data={
  sst:{tab:'Seguridad y Salud en el Trabajo',kicker:'PREVENCIÓN Y BIENESTAR',img:'/sst.jpg',
   lead:'Cuidar el trabajo también es cuidar a las personas.',
   what:'Es un equipo formado por representantes de la empresa y de los trabajadores, en igual número. Juntos revisan que el trabajo se haga de forma segura, detectan riesgos y proponen mejoras para prevenir accidentes y enfermedades.',
   vote:'Con tu voto eliges a quien llevará la voz de los trabajadores al comité: alguien que conozca lo que pasa en cada puesto y se anime a proponer cambios.',
   functions:[['plan','Planificar la prevención','Aprueba y vigila el Reglamento Interno y el Plan Anual de Seguridad y Salud en el Trabajo.'],['eye','Revisar el entorno','Inspecciona las instalaciones y propone mejoras para reducir riesgos.'],['search','Aprender de los incidentes','Investiga las causas de accidentes, incidentes y enfermedades ocupacionales, y recomienda medidas para que no se repitan.'],['people','Promover la participación','Impulsa capacitaciones y la participación de los trabajadores en la prevención.']],
   cases:[['Un piso mojado o un estante inestable en la botica','El comité puede inspeccionar el lugar y proponer una mejora.'],['Alguien sufre un accidente o un incidente','El comité investiga las causas y recomienda medidas para evitar que se repita.'],['Faltan capacitaciones o equipos de protección','El comité vigila el plan anual y promueve capacitaciones.']],
   quiz:[['El comité reemplaza la responsabilidad de la empresa en seguridad.',false,'La empresa sigue siendo responsable de garantizar la seguridad y salud. El comité ayuda, propone y vigila.'],['El comité puede investigar las causas de un accidente de trabajo.',true,'Es una de sus funciones: investigar y recomendar medidas para que no se repita.'],['Tu voto elige a quien representará a los trabajadores.',true,'Los trabajadores eligen a sus representantes. La empresa designa a los suyos.']],
   note:'La responsabilidad de garantizar la seguridad y salud sigue siendo del empleador; no se transfiere al comité.',
   source:'https://cdn.www.gob.pe/uploads/document/file/6575074/5722542-comite-sst_2024_lelvf-rev-1.pdf',label:'MTPE · Funciones del Comité de SST'},
  hs:{tab:'Intervención frente al Hostigamiento Sexual',kicker:'DIGNIDAD Y RESPETO',img:'/hs.jpg',
   lead:'Un entorno de respeto se construye con participación.',
   what:'Es el órgano que investiga los casos de hostigamiento sexual laboral y recomienda sanciones u otras medidas. Lo integran representantes de los trabajadores y de la empresa, respetando la paridad de género.',
   vote:'Con tu voto eliges a quien representará a los trabajadores en las investigaciones: una persona confiable, que actúe con reserva y trate a todos con respeto.',
   functions:[['search','Investigar los hechos','Investiga los casos que Recursos Humanos, o quien haga sus veces, le comunica.'],['scale','Evaluar la información','Recaba y evalúa los elementos de la investigación, respetando el derecho de defensa.'],['doc','Emitir recomendaciones','Elabora un informe con conclusiones y recomendaciones de sanción o archivo.'],['shield','Evitar nuevos casos','Recomienda medidas adicionales, actúa con confidencialidad y evita la revictimización.']],
   cases:[['Una persona comunica un caso a Recursos Humanos','Recursos Humanos traslada el caso y el comité inicia la investigación con confidencialidad.'],['Durante la investigación','El comité escucha a las partes y evalúa la información, respetando el derecho de defensa.'],['Al terminar la investigación','El comité emite un informe con recomendaciones. La sanción la decide Recursos Humanos o quien haga sus veces.']],
   quiz:[['Esta página electoral sirve para presentar denuncias.',false,'No. Este portal solo sirve para votar. Las denuncias se presentan por los canales de la empresa.'],['El comité debe actuar con confidencialidad.',true,'La reserva protege a todas las personas involucradas y evita la revictimización.'],['El comité decide la sanción final.',false,'El comité investiga y recomienda. La decisión la toma Recursos Humanos o quien haga sus veces.']],
   note:'Esta página electoral no es un canal de denuncias. Si necesitas reportar un caso, usa los canales de la empresa.',
   source:'https://www.gob.pe/institucion/mtpe/informes-publicaciones/4622972-procedimiento-interno-de-investigacion-sobre-hostigamiento-sexual-laboral-en-el-sector-privado',label:'MTPE · Procedimiento de investigación en el sector privado'}
 };
 box.innerHTML='<div class="ex-tabs" role="tablist" aria-label="Comités">'+Object.entries(data).map(([id,d],i)=>'<button role="tab" id="tab-'+id+'" class="ex-tab" data-tab="'+id+'" aria-selected="'+(i===0)+'" aria-controls="ex-panel"><img src="'+d.img+'" alt=""><span><small>0'+(i+1)+' · '+d.kicker+'</small><strong>'+d.tab+'</strong></span></button>').join('')+'</div><div class="ex-panel" id="ex-panel" role="tabpanel" tabindex="-1"></div>';
 const panel=box.querySelector('.ex-panel');
 function render(id){
  const d=data[id];
  box.dataset.theme=id;
  box.querySelectorAll('.ex-tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===id)));
  panel.setAttribute('aria-labelledby','tab-'+id);
  panel.innerHTML=
   '<div class="ex-intro"><div><span class="ex-kicker">¿QUÉ ES?</span><h3>'+esc(d.lead)+'</h3><p>'+esc(d.what)+'</p></div><aside class="ex-vote"><span class="ex-kicker">TU VOTO</span><p>'+esc(d.vote)+'</p></aside></div>'+
   '<div class="ex-block"><span class="ex-kicker">¿QUÉ HACE?</span><h4>Sus funciones <small>Toca una tarjeta para ver el detalle</small></h4><div class="ex-funcs">'+d.functions.map(([ic,t,x],i)=>'<button class="ex-func" aria-pressed="false" aria-label="'+esc(t)+'. Ver detalle"><span class="ex-front"><span class="ex-ico">'+ico(ic)+'</span><b class="ex-big" aria-hidden="true">0'+(i+1)+'</b><strong>'+esc(t)+'</strong><span class="ex-more">Ver más <i aria-hidden="true">+</i></span></span><span class="ex-back"><span class="ex-ico">'+ico(ic)+'</span><strong>'+esc(t)+'</strong><span class="ex-desc">'+esc(x)+'</span><span class="ex-more">Volver <i aria-hidden="true">↺</i></span></span></button>').join('')+'</div></div>'+
   '<div class="ex-block"><span class="ex-kicker">EN TU DÍA A DÍA</span><h4>¿Cuándo actúa el comité?</h4><ol class="ex-flow">'+d.cases.map(([s,a],i)=>'<li><div class="ex-node" aria-hidden="true">'+ico((id==='sst'?['alert','aid','learn']:['chat','scale','doc'])[i])+'<span>'+(i+1)+'</span></div><div class="ex-sit"><small>'+(id==='sst'?'SITUACIÓN':'MOMENTO')+' '+(i+1)+'</small><b>'+esc(s)+'</b></div><div class="ex-act"><small>QUÉ HACE EL COMITÉ</small><p>'+esc(a)+'</p></div></li>').join('')+'</ol></div>'+
   '<div class="ex-foot"><p>'+esc(d.note)+'</p><a href="'+d.source+'" target="_blank" rel="noopener">'+esc(d.label)+' ↗</a></div>';
  panel.querySelectorAll('.ex-func').forEach(f=>f.onclick=()=>{const on=f.getAttribute('aria-pressed')!=='true';f.setAttribute('aria-pressed',String(on));});
  if(!still)panel.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:450,easing:'cubic-bezier(.2,.7,.2,1)'});
  if(!still){const items=panel.querySelectorAll('.ex-func,.ex-flow li,.ex-q');items.forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:500,delay:120+i*60,easing:'ease-out',fill:'backwards'}));}
 }
 box.querySelectorAll('.ex-tab').forEach(t=>{t.onclick=()=>render(t.dataset.tab);t.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const tabs=[...box.querySelectorAll('.ex-tab')],n=tabs[(tabs.indexOf(t)+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];n.focus();render(n.dataset.tab);}};});
 render('sst');
})();

/* ===== Cédula tipo papeleta y confirmación ===== */
(()=>{
 const pics={sst:'/sst.jpg',hs:'/hs.jpg'};
 const tones=['#861079','#46133f','#b0489f','#6a0f60','#a3338f','#5a1450'];
 const initials=n=>{const w=n.trim().split(/\s+/);return (w[0][0]+(w[1]?w[1][0]:'')).toUpperCase();};
 const baseBallot2=ballot;
 ballot=function(e,previous){
  baseBallot2(e,previous);
  content.dataset.tone=e.id;
  const form=$('#ballot');if(!form)return;
  const h2=content.querySelector('h2'),intro=h2&&h2.nextElementSibling;
  const head=document.createElement('div');head.className='ballot-head';
  head.innerHTML='<img src="'+(pics[e.id]||'/hs.jpg')+'" alt=""><div class="ballot-head-copy"><span>CÉDULA DE VOTACIÓN · '+esc(cfg.period||'')+'</span></div><div class="ballot-seal" aria-hidden="true"><b>'+(e.id==='sst'?'SST':'HS')+'</b><small>2026</small></div>';
  h2.before(head);head.querySelector('.ballot-head-copy').append(h2);
  if(intro&&intro.tagName==='P'){intro.textContent='Marca una sola opción. Puedes elegir una candidatura o votar en blanco.';head.querySelector('.ballot-head-copy').append(intro);}
  form.querySelectorAll('.candidate').forEach(label=>{
   const name=label.querySelector('.candidate-name');
   if(!name){label.classList.add('blank-option');const input=label.querySelector('input');label.textContent='';label.append(input);label.insertAdjacentHTML('beforeend','<span class="blank-icon" aria-hidden="true">○</span><span><b class="candidate-name">Voto en blanco</b><small class="candidate-detail">No eliges a ninguna candidatura. Tu participación se registra igual.</small></span>');return;}
   const m=name.textContent.match(/^(\d+)\s*·\s*(.*)$/);
   if(m){name.textContent=m[2];label.insertAdjacentHTML('afterbegin','<span class="cand-num" aria-hidden="true">'+m[1]+'</span>');}
   label.insertAdjacentHTML('beforeend','<span class="cand-check" aria-hidden="true">✓</span>');
  });
  const actions=form.querySelector('.actions');
  actions.insertAdjacentHTML('beforebegin','<div class="choice-bar" aria-live="polite"><span>Tu elección</span><strong id="choice-name">Aún no eliges</strong></div>');
  const sync=()=>{const c=form.querySelector('[name=candidate]:checked');form.classList.toggle('has-choice',!!c);const label=c&&c.closest('.candidate');const t=$('#choice-name');t.textContent=!c?'Aún no eliges':c.id==='blank'?'Voto en blanco':label.querySelector('.candidate-name').textContent;t.classList.toggle('chosen',!!c);if(c&&!matchMedia('(prefers-reduced-motion: reduce)').matches)t.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:300,easing:'ease-out'});};
  form.addEventListener('change',sync);sync();
 };
 const baseReview=review;
 review=function(e,selection){
  baseReview(e,selection);
  content.dataset.tone=e.id;
  const card=content.querySelector('.card');if(!card)return;
  card.className='review-choice';
  if(!selection.length){card.innerHTML='<span class="avatar blank-avatar" aria-hidden="true">○</span><div><small>TU ELECCIÓN</small><strong>Voto en blanco</strong><p>No eliges a ninguna candidatura.</p></div>';}
  else{const c=e.candidates.find(x=>x.id===selection[0]),i=e.candidates.indexOf(c);card.innerHTML='<span class="avatar" aria-hidden="true">'+esc(initials(c.name))+'</span><div><small>TU ELECCIÓN · CANDIDATURA '+String(c.number||i+1).padStart(2,'0')+'</small><strong>'+esc(c.name)+'</strong><p>'+esc(c.role||'')+(c.site?' · '+esc(c.site):'')+'</p></div>';card.querySelector('.avatar').style.setProperty('--av',tones[i%tones.length]);}
  const h=content.querySelector('h2');if(h)h.insertAdjacentHTML('afterend','<span class="review-committee">'+esc(e.title)+'</span>');
  const p=h&&h.nextElementSibling&&h.nextElementSibling.nextElementSibling;if(p&&p.tagName==='P'&&p.textContent===e.title)p.remove();
 };
})();



const reviewedCommittees=new Set();
function learningReady(){return reviewedCommittees.has('sst')&&reviewedCommittees.has('hs');}
function refreshLearningGate(){
 document.querySelectorAll('a[href="#acceso"],a[data-learning-link]').forEach(a=>{a.dataset.learningLink='true';a.setAttribute('aria-disabled',String(!learningReady()));a.classList.toggle('learning-locked',!learningReady());if(a.classList.contains('hero-link'))a.innerHTML=learningReady()?'Ir a votar ↗':'Comenzar →';});
}
const unrestrictedLogin=login;
login=function(){if(learningReady()){unrestrictedLogin();return;}$('#acceso').classList.remove('voting-focus');content.innerHTML='<h2>Primero, lee los comités</h2><p>Están justo arriba. Al final de cada uno pulsa <b>"He leído la información"</b>.</p><ul class="gate-list">'+[['sst','Seguridad y Salud en el Trabajo'],['hs','Hostigamiento Sexual']].map(([id,t])=>'<li class="'+(reviewedCommittees.has(id)?'ok':'')+'"><span aria-hidden="true">'+(reviewedCommittees.has(id)?'✓':'')+'</span>'+t+(reviewedCommittees.has(id)?' · leído':' · falta leer')+'</li>').join('')+'</ul><a class="hero-link" href="#comites">Ir a los comités ↑</a>';};
document.addEventListener('click',event=>{const link=event.target.closest('a[href="#acceso"]');if(link&&!learningReady()){event.preventDefault();document.getElementById('comites').scrollIntoView({behavior:'smooth'});}},true);
function addReadingConfirmation(){
 const panel=document.getElementById('ex-panel'),box=document.getElementById('explainer');if(!panel||panel.querySelector('.reading-confirmation'))return;
 const id=box.dataset.theme,done=reviewedCommittees.has(id);
 panel.insertAdjacentHTML('beforeend','<div class="reading-confirmation"><p>Antes de continuar, confirma que revisaste qué es este comité y cuáles son sus funciones.</p><button class="primary" id="confirm-reading" '+(done?'disabled':'')+'>'+(done?'✓ Lectura confirmada':'He leído la información de este comité')+'</button><p id="reading-progress" role="status">'+reviewedCommittees.size+' de 2 comités revisados</p></div>');
 const goNext=()=>{const smooth=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';if(learningReady()){$('#acceso').scrollIntoView({behavior:smooth,block:'start'});return;}const other=id==='sst'?'hs':'sst';if(box.dataset.theme!==other)document.getElementById('tab-'+other).click();box.scrollIntoView({behavior:smooth,block:'start'});};
 panel.querySelector('#confirm-reading').onclick=()=>{reviewedCommittees.add(id);refreshLearningGate();if(!token)login();panel.querySelector('#confirm-reading').disabled=true;panel.querySelector('#confirm-reading').textContent='✓ Lectura confirmada';panel.querySelector('#reading-progress').textContent=learningReady()?'Ya puedes ingresar a votar.':'Falta revisar el otro comité.';const next=document.createElement('button');next.className='primary';next.textContent=learningReady()?'Continuar a la votación →':'Conocer el otro comité →';next.onclick=goNext;panel.querySelector('.reading-confirmation').append(next);setTimeout(goNext,700);};
 refreshLearningGate();
}
const guidePanel=document.getElementById('ex-panel');
if(guidePanel){new MutationObserver(addReadingConfirmation).observe(guidePanel,{childList:true});addReadingConfirmation();}

/* ===== Tarjetas de candidatura más visuales ===== */
(()=>{
 const svg=p=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>';
 const brief=svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>');
 const pin=svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>');
 const baseBallot3=ballot;
 ballot=function(e,previous){
  baseBallot3(e,previous);
  document.querySelectorAll('#ballot .candidate').forEach(label=>{
   const blank=label.classList.contains('blank-option');
   if(!blank){
    const av=label.querySelector('.avatar'),tone=av&&av.style.getPropertyValue('--av');if(tone)label.style.setProperty('--av',tone);
    label.insertAdjacentHTML('afterbegin','<span class="cand-band" aria-hidden="true"></span>');
    const d=[...label.querySelectorAll('.candidate-detail')];
    if(d[0]){const t=d[0].textContent;d[0].className='cand-role';d[0].innerHTML=brief+'<span>'+esc(t)+'</span>';}
    if(d[1]){const t=d[1].textContent;d[1].className='cand-site';d[1].innerHTML=pin+'<span>'+esc(t)+'</span>';}
   }
   label.insertAdjacentHTML('beforeend','<span class="cand-pick" aria-hidden="true"><span class="pick-off">'+(blank?'Votar en blanco':'Elegir')+'</span><span class="pick-on">✓ Seleccionada</span></span>');
  });
 };
})();


/* ===== Junta: integrante, registro de actividad, escrutinio con dos integrantes y acta ===== */
/* Hoja membretada de la empresa en todo lo que se imprime (constancia, lista de firmas, acta). */
let membreteUrl='',mbHead='',mbFoot='';
/* En pantalla se muestra solo el encabezado arriba y el pie al final; al imprimir va la hoja completa en cada página. */
function prepMembrete(u){membreteUrl=u;const im=new Image();im.onload=()=>{const cut=(a,b)=>{const c=document.createElement('canvas'),k=im.naturalHeight/297;c.width=im.naturalWidth;c.height=Math.round((b-a)*k);c.getContext('2d').drawImage(im,0,-Math.round(a*k));return c.toDataURL('image/jpeg',0.88);};try{mbHead=cut(0,36);mbFoot=cut(266,297);}catch(e){}};im.src=u;}
function loadMembrete(path){fetch(path).then(r=>r.ok?r.blob():null).then(b=>{if(!b)return;const f=new FileReader();f.onload=()=>prepMembrete(f.result);f.readAsDataURL(b);}).catch(()=>{});}
loadMembrete('/membrete.jpg');
function membrete(html){
 if(!membreteUrl)return html;
 const i=html.indexOf('</style>')+8;if(i<8)return html;
 const css='<style>@page{size:A4;margin:0}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{max-width:none!important;margin:0!important;padding:0 20mm!important;box-sizing:border-box}'+
  '.mb-fondo{position:fixed;top:0;left:0;width:210mm;height:297mm;z-index:-1}table.mb{width:100%;border-collapse:collapse;margin:0}table.mb>thead>tr>td,table.mb>tbody>tr>td,table.mb>tfoot>tr>td{border:0!important;padding:0!important;background:none!important}table.mb>tbody>tr{break-inside:auto!important;page-break-inside:auto!important}.mb-arriba{height:40mm}.mb-print{font:15px Arial;padding:10px 18px;margin:0 0 14px;background:#861079;color:#fff;border:0;border-radius:6px;cursor:pointer}@media print{.mb-print{display:none}}.mb-abajo{height:34mm}'+
  '@media screen{html{background:#e9e4e8}body{width:210mm;min-height:297mm;margin:24px auto!important;background:'+(mbHead&&mbFoot?'url('+mbHead+') top center/210mm auto no-repeat,url('+mbFoot+') bottom center/210mm auto no-repeat,#fefdfc':'#fff url('+membreteUrl+') top center/210mm 297mm no-repeat')+';box-shadow:0 4px 24px #0002}.mb-fondo{display:none}.mb-abajo{height:38mm}}</style>';
 const end=html.lastIndexOf('</html>'),body=html.slice(i,end<0?html.length:end);
 const simBand=cfg&&cfg.mode==='simulacro'?'<p style="border:2px solid #b45309;color:#b45309;font:bold 13px Arial;text-align:center;padding:6px;margin:0 0 12px">SIMULACRO · SIN VALIDEZ OFICIAL</p>':'';
 const printBtn=body.includes('onclick="print()"')?'':'<button class="mb-print" onclick="print()">Imprimir / Guardar como PDF</button>';
 return html.slice(0,i)+css+'<img class="mb-fondo" src="'+membreteUrl+'" alt=""><table class="mb"><thead><tr><td><div class="mb-arriba"></div></td></tr></thead><tbody><tr><td>'+printBtn+simBand+body+'</td></tr></tbody><tfoot><tr><td><div class="mb-abajo"></div></td></tr></tfoot></table></html>';
}
function openDoc(html,filename){const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
(()=>{
 const fmt=d=>new Date(d).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'});
 const pct=(a,b)=>b?Math.round(1000*a/b)/10:0;
 const labels={SERVER_START:'Inicio del servidor',PADRON_IMPORT:'Carga del padrón · códigos nuevos:',PADRON_IMPORT_PRUEBA:'Carga del padrón de prueba · códigos nuevos:',CLAVES_JUNTA:'Claves de la junta generadas:',CODE_REPLACED:'Código de un trabajador reemplazado',JUNTA_INGRESO:'Ingreso al panel:',ESCRUTINIO_ABIERTO:'Escrutinio abierto por'};
 const eventLabel=ev=>{const [code,...rest]=ev.split(' ');return labels[code]?(labels[code]+(rest.length?' '+rest.join(' '):'')):ev;};
 const baseAdmin2=renderAdmin;
 let escKey=null;
 renderAdmin=function(report,key){
  baseAdmin2(report,key);escKey=key;
  const head=content.querySelector('.admin-heading p');
  if(head&&report.member)head.insertAdjacentHTML('beforebegin','<p class="admin-who">Ingresaste como <b>'+esc(report.member.role)+'</b> · '+esc(report.member.name)+'</p>');
  const box=$('#escrutinio');if(!box)return;
  const others=(cfg.board||[]).filter(m=>!key||m.id!==key.member);
  const canOpen=report.closed||report.demo;
  box.innerHTML='<div class="esc-head"><div><div class="eyebrow">ESCRUTINIO</div><h3>Resultados de la votación</h3><p>Por seguridad, los resultados solo se abren con <b>dos integrantes</b> de la junta, después del cierre.'+(report.demo?' En modo prueba puedes abrirlos ahora para ensayar.':'')+'</p></div><span class="esc-lock" aria-hidden="true">🔒</span></div>'+
   (canOpen?'<form id="esc-form" class="esc-form"><label for="esc-member">Segundo integrante</label><select id="esc-member" required><option value="">Elige al segundo integrante</option>'+others.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.role)+' · '+esc(m.name)+'</option>').join('')+'</select><label for="esc-key">Su clave personal</label><input id="esc-key" type="password" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><div class="actions"><button class="primary">Abrir escrutinio</button></div></form>':'<p class="esc-wait">Disponible desde el '+esc(fmt(cfg.closes))+' (hora de Perú).</p>')+
   '<div id="esc-results"></div>';
  /* Si el escrutinio ya se abrió, cada integrante puede firmar desde su propio equipo sin volver a abrirlo. */
  const form=$('#esc-form');
  if(report.escrutinio){if(form)form.remove();showResults(report.escrutinio);}
  else if(form)form.onsubmit=async ev=>{ev.preventDefault();try{const data=await api('escrutinio',{key,second:{member:$('#esc-member').value,key:$('#esc-key').value.trim()}});form.remove();showResults(data);}catch(err){notice(err.message);}};
  const events=(report.events||[]).slice(-40).reverse();
  content.insertAdjacentHTML('beforeend','<details class="activity"><summary>Registro de actividad <span>'+events.length+'</span></summary><ul>'+events.map(e=>'<li><time>'+esc(fmt(e.time))+'</time><span>'+esc(eventLabel(e.event))+'</span></li>').join('')+'</ul></details>');
 };
 function showResults(data){
  const box=$('#esc-results');
  {const old=$('#junta-sign');if(old&&!old.closest('#esc-results'))old.remove();}
  box.innerHTML=(data.demo?'<p class="esc-demo">Resultados de prueba · no oficiales</p>':'')+'<p class="esc-opened">Abierto por '+data.openedBy.map(m=>'<b>'+esc(m.role)+'</b> ('+esc(m.name)+')').join(' y ')+' · '+esc(fmt(data.openedAt))+'</p>'+'<p class="esc-docs-hint"></p>'+'<div class="actions esc-docs"><button class="primary" data-doc="escrutinio">Descargar acta de escrutinio</button><button class="primary" data-doc="final">Descargar acta final de la elección</button></div>'+
   data.elections.map(e=>{const r=e.results,max=Math.max(1,...r.candidates.map(c=>c.votes)),rr=reparto(e),rp={byId:Object.fromEntries(rr.rank.filter(c=>c.cargo||c.empate).map(c=>[c.id,{txt:rr.label(c),cls:c.empate?'empate':c.cargo==='Titular'?'titular':'suplente'}]))};return '<article class="esc-card"><h4>'+esc(e.title)+'</h4><p class="esc-meta">'+r.total+' votos emitidos de '+e.eligible+' habilitados · participación '+pct(e.participation,e.eligible)+'%</p><ol class="esc-bars">'+r.candidates.map(c=>'<li><span class="esc-name">'+String(c.number||'').padStart(2,'0')+' · '+esc(c.name)+(rp.byId[c.id]?'<em class="cargo '+rp.byId[c.id].cls+'">'+esc(rp.byId[c.id].txt)+'</em>':'')+'</span><span class="esc-track"><i data-w="'+(100*c.votes/max)+'"></i></span><b>'+c.votes+'</b><small>'+pct(c.votes,r.total)+'%</small></li>').join('')+'<li class="esc-blank"><span class="esc-name">Voto en blanco</span><span class="esc-track"><i data-w="'+(100*r.blank/max)+'"></i></span><b>'+r.blank+'</b><small>'+pct(r.blank,r.total)+'%</small></li></ol></article>';}).join('')+
   '<section id="junta-sign" class="junta-sign"></section><p class="esc-docs-hint"></p>'+'<div class="actions esc-docs"><button class="primary" data-doc="escrutinio">Descargar acta de escrutinio</button><button class="primary" data-doc="final">Descargar acta final de la elección</button></div>'+'<p class="muted">Las actas se imprimen en la hoja membretada y las firman los integrantes de la junta. Titulares: los 2 más votados de cada comité; suplentes: los 2 siguientes. Si hay empate en el límite, lo decide la junta.</p>';
  requestAnimationFrame(()=>requestAnimationFrame(()=>box.querySelectorAll('.esc-track i').forEach(i=>i.style.setProperty('width',i.dataset.w+'%'))));
  renderJuntaSign(data);
  box.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>!allSigned(data)?notice('Faltan firmas de la junta para descargar las actas.'):b.dataset.doc==='final'?openDoc(membrete(actaFinalHtml(data)),'acta-final-eleccion.html'):openDoc(membrete(actaHtml(data)),'acta-escrutinio.html'));
 }
 /* Firmas de cierre de la junta: obligatorias (todas) antes de descargar las actas. */
 const sigSvg=st=>'<svg viewBox="0 0 800 240" preserveAspectRatio="xMidYMid meet">'+(st||[]).map(s=>'<polyline fill="none" stroke="#1d1b3a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="'+s.map(p=>(p[0]*800).toFixed(1)+','+(p[1]*240).toFixed(1)).join(' ')+'"/>').join('')+'</svg>';
 const allSigned=data=>!!(data.signatures&&data.signatures.length&&data.signatures.every(m=>m.signedAt));
 function sigBlock(data){
  const list=(data.signatures&&data.signatures.length)?data.signatures:(data.board||[]);
  return '<div class="f">'+list.map(m=>'<div><span class="sg">'+(m.strokes?sigSvg(m.strokes):'')+'</span><span class="ln"><b>'+esc(m.name.toLocaleUpperCase('es'))+'</b><br>'+esc(m.role)+' de la Junta Electoral'+(m.signedAt?'<br><small>Firmado electrónicamente el '+esc(fmt(m.signedAt))+'</small>':'')+'</span></div>').join('')+'</div>';
 }
 const sigCss='.f{margin-top:10mm!important}.f>div{border-top:0!important;padding-top:0!important;text-align:center}.f .sg{display:block;height:17mm}.f .sg svg{height:17mm;width:100%}.f .ln{display:block;border-top:1px solid #222;padding-top:4px}.f small{color:#555;font-size:10px}';
 const isMe=m=>!!(escKey&&typeof escKey==='object'&&escKey.member===m.id);
 function renderJuntaSign(data){
  const sec=$('#junta-sign');if(!sec)return;
  const list=data.signatures||[],done=list.filter(m=>m.signedAt).length,ok=allSigned(data);
  const me=list.find(isMe);
  sec.innerHTML='<div class="js-head"><div class="eyebrow">CIERRE DEL PROCESO</div><h4>Firmas de la Junta Electoral <span class="js-count'+(ok?' ok':'')+'">'+done+' de '+list.length+'</span></h4><p>'+(ok?'✓ Firmaron todos los integrantes. Ya pueden descargar e imprimir las actas.':'Es <b>obligatorio</b> que firmen <b>todos</b> los integrantes. Cada uno firma <b>con su propia clave</b>: desde su celular o PC (entrando a “Acceso de la junta” con su clave) o aquí mismo escribiendo su clave. Las actas se descargan cuando estén todas las firmas.')+'</p>'+(me?'<p class="js-me">Entraste como <b>'+esc(me.role)+'</b>. Solo puedes firmar tú; los demás firman con su clave.</p>':'')+(ok?'':'<button class="js-refresh">↻ Actualizar firmas</button>')+'</div>'+
   '<ul class="js-list">'+list.map(m=>'<li class="'+(m.signedAt?'signed':'')+'"><div class="js-row"><div class="js-who"><b>'+esc(m.role)+'</b><span>'+esc(m.name)+'</span></div>'+(m.signedAt?'<div class="js-done"><span class="js-mini">'+sigSvg(m.strokes)+'</span><small>✓ Firmó · '+esc(fmt(m.signedAt))+'</small></div>':(isMe(m)?'<button class="primary" data-sign="'+esc(m.id)+'">Firmar (tú)</button>':'<div class="js-pend"><span>Pendiente</span><button class="js-here" data-sign="'+esc(m.id)+'">Firmar aquí con su clave</button></div>'))+'</div><div class="js-form" hidden></div></li>').join('')+'</ul>';
  document.querySelectorAll('.esc-docs [data-doc]').forEach(b=>{b.disabled=!ok;});
  document.querySelectorAll('.esc-docs-hint').forEach(p=>{p.textContent=ok?'':'🔒 Faltan '+(list.length-done)+' firma(s) de la junta para descargar las actas. Firmen en la sección “Firmas de la Junta Electoral”.';p.hidden=ok;});
  const rf=sec.querySelector('.js-refresh');if(rf)rf.onclick=async()=>{rf.disabled=true;try{data.signatures=(await api('junta-firmas',{key:escKey})).signatures;renderJuntaSign(data);}catch(err){notice(err.message);rf.disabled=false;}};
  sec.querySelectorAll('[data-sign]').forEach(b=>b.onclick=()=>openSign(data,list.find(m=>m.id===b.dataset.sign),b.closest('li')));
 }
 function openSign(data,m,li){
  document.querySelectorAll('.js-form').forEach(f=>{f.hidden=true;f.innerHTML='';});
  document.querySelectorAll('[data-sign]').forEach(x=>{x.hidden=false;});li.querySelector('[data-sign]').hidden=true;
  const own=isMe(m),form=li.querySelector('.js-form');form.hidden=false;
  form.innerHTML=(own?'':'<p class="js-warn">Solo '+esc(m.name)+' debe escribir su clave y firmar.</p><label>Clave personal de '+esc(m.role)+'<input type="password" class="js-key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"></label>')+'<label>Firma de '+esc(m.name)+' (dibújala con el dedo o el mouse)</label><canvas class="js-pad" width="800" height="240"></canvas><button type="button" class="js-clear">Limpiar firma</button><label class="signature-consent"><input type="checkbox" class="js-accept"> <span>Declaro mi conformidad con el escrutinio y los resultados, y firmo las actas como '+esc(m.role)+' de la Junta Electoral.</span></label><div class="actions"><button class="primary js-save">Guardar mi firma</button><button type="button" class="js-cancel">Cancelar</button></div>';
  const cv=form.querySelector('.js-pad'),ctx=cv.getContext('2d');let strokes=[],cur=null,pid=null;
  ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1d1b3a';
  const pt=e=>{const r=cv.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  cv.onpointerdown=e=>{if(pid!==null)return;e.preventDefault();pid=e.pointerId;cv.setPointerCapture(pid);cur=[pt(e)];};
  cv.onpointermove=e=>{if(e.pointerId!==pid||!cur)return;if(strokes.reduce((n,s)=>n+s.length,0)+cur.length>=3900)return;const p=pt(e),q=cur.at(-1);ctx.beginPath();ctx.moveTo(q[0]*800,q[1]*240);ctx.lineTo(p[0]*800,p[1]*240);ctx.stroke();cur.push(p);};
  const end=()=>{if(cur&&cur.length>1)strokes.push(cur);cur=null;pid=null;};cv.onpointerup=end;cv.onpointercancel=end;
  form.querySelector('.js-clear').onclick=()=>{strokes=[];ctx.clearRect(0,0,800,240);};
  form.querySelector('.js-cancel').onclick=()=>renderJuntaSign(data);
  const keyInput=form.querySelector('.js-key');if(keyInput)keyInput.focus();
  form.querySelector('.js-save').onclick=async e=>{
   const btn=e.currentTarget;
   if(keyInput&&!keyInput.value.trim())return notice('Escribe la clave personal de '+m.role+'.');
   if(!strokes.length)return notice('Dibuja la firma en el recuadro.');
   if(!form.querySelector('.js-accept').checked)return notice('Marca la casilla de conformidad.');
   btn.disabled=true;
   try{const r=await api('junta-firmar',{key:own?escKey:{member:m.id,key:keyInput.value.trim()},strokes,accepted:true});data.signatures=r.signatures;notice(allSigned(data)?'Firmaron todos. Ya pueden descargar las actas.':m.role+' firmó correctamente.');renderJuntaSign(data);}
   catch(err){notice(err.message);btn.disabled=false;}
  };
 }
 /* Reparto automático: los 2 más votados son titulares y los 2 siguientes suplentes (config: titulares / suplentes).
    Si hay empate justo en un límite, esos puestos no se asignan: los decide la junta. */
 function reparto(e){
  const conf=(cfg.elections||[]).find(x=>x.id===e.id)||{},T=conf.titulares??2,S=conf.suplentes??2;
  const rank=[...e.results.candidates].sort((a,b)=>b.votes-a.votes||String(a.number).localeCompare(String(b.number),undefined,{numeric:true}));
  const out=rank.map((c,i)=>({...c,cargo:i<T?'Titular':i<T+S?'Suplente':'',empate:false}));
  for(const b of [T,T+S])if(b>0&&b<out.length&&out[b-1].votes===out[b].votes){const v=out[b].votes;out.forEach(c=>{if(c.votes===v){c.empate=true;}});}
  out.forEach(c=>{if(c.empate&&!c.cargo&&!out.some(o=>o.votes===c.votes&&o.cargo))c.empate=false;});
  return {T,S,rank:out,label:c=>c.empate?'Empate: decide la junta':c.cargo||'—'};
 }
 function actaFinalHtml(data){
  const t=d=>new Date(d).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'});
  const day=new Date(cfg.closes).toLocaleDateString('es-PE',{timeZone:'America/Lima',weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Acta final de la elección</title><style>'+sigCss+'body{font:12.5px Arial,sans-serif;color:#222;line-height:1.5}h1{font-size:18px;text-align:center;margin:0 0 2px;color:#5c0f53}h2{font-size:14px;margin:18px 0 6px;color:#5c0f53}.c{text-align:center;margin:0 0 14px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#f3eaf1}td.n,th.n{text-align:right;width:24mm}.demo{border:2px solid #b45309;color:#b45309;font-weight:bold;text-align:center;padding:6px;margin:10px 0}.obs{border:1px solid #999;height:24mm;margin-top:4px}.lineas td{height:9mm}.f{display:grid;grid-template-columns:1fr 1fr;gap:20mm 14mm;margin-top:22mm;page-break-inside:avoid}.f div{border-top:1px solid #222;padding-top:4px;font-size:11.5px;text-align:center}tr.elegido td{background:#f6eef5}.nota{font-size:11.5px;color:#7a4b00}table.res th{width:16%}table.res td{text-align:center;font-weight:bold;width:9%}.lineas td{height:8mm}table,.obs{break-inside:avoid;page-break-inside:avoid}h2,p{break-after:avoid;page-break-after:avoid}section.cierre{break-inside:avoid;page-break-inside:avoid}.f{margin-top:16mm}</style>'+
   '<h1>ACTA FINAL DE LA ELECCIÓN</h1><p class="c"><b>'+esc(cfg.company)+'</b><br>Elección de representantes de los trabajadores · Periodo '+esc(cfg.period)+'</p>'+(data.demo?'<p class="demo">DOCUMENTO DE PRUEBA · SIN VALIDEZ</p>':'')+
   '<h2>1. Datos del proceso</h2><table><tbody><tr><th>Fecha</th><td>'+esc(day)+'</td></tr><tr><th>Modalidad</th><td>Semipresencial: votación electrónica en el portal de la empresa</td></tr><tr><th>Apertura de la votación</th><td>'+esc(t(cfg.opens))+' (hora de Perú)</td></tr><tr><th>Cierre de la votación</th><td>'+esc(t(cfg.closes))+' (hora de Perú), automático</td></tr><tr><th>Apertura del escrutinio</th><td>'+esc(t(data.openedAt))+', por '+data.openedBy.map(m=>esc(m.name)+' ('+esc(m.role)+')').join(' y ')+'</td></tr></tbody></table>'+
   '<p>Concluida la votación, la Junta Electoral deja constancia de que el sistema cerró la recepción de votos a la hora indicada, que el voto fue secreto (el portal registra quién participó, pero no por quién votó) y que cada participante firmó su constancia de participación.</p>'+
   data.elections.map((e,k)=>{const r=e.results,valid=r.total-r.blank,rp=reparto(e),rank=rp.rank;return '<section><h2>'+(k+2)+'. '+esc(e.title)+'</h2><table class="res"><tbody><tr><th>Habilitados</th><td>'+e.eligible+'</td><th>Votaron</th><td>'+e.participation+'</td><th>No votaron</th><td>'+Math.max(0,e.eligible-e.participation)+'</td><th>Participación</th><td>'+pct(e.participation,e.eligible)+'%</td></tr><tr><th>Votos válidos</th><td>'+valid+'</td><th>En blanco</th><td>'+r.blank+'</td><th colspan="3">Total de votos emitidos</th><td>'+r.total+'</td></tr></tbody></table>'+
    '<p><b>Resultados en orden de votación:</b></p><table><thead><tr><th>Puesto</th><th>N.º</th><th>Candidatura</th><th class="n">Votos</th><th>Resultado</th></tr></thead><tbody>'+rank.map((c,i)=>'<tr'+(c.cargo&&!c.empate?' class="elegido"':'')+'><td>'+(i+1)+'.º</td><td>'+String(c.number||'').padStart(2,'0')+'</td><td>'+esc(c.name)+'</td><td class="n">'+c.votes+'</td><td><b>'+esc(rp.label(c))+'</b></td></tr>').join('')+'</tbody></table>'+
    '<p><b>Representantes elegidos</b> (titulares: los '+rp.T+' más votados; suplentes: los '+rp.S+' siguientes):</p><table class="lineas"><thead><tr><th>Cargo</th><th>Nombres y apellidos</th><th class="n">Votos</th></tr></thead><tbody>'+[...Array(rp.T).fill('Titular'),...Array(rp.S).fill('Suplente')].map((cg,i)=>{const c=rank[i],ok=c&&!c.empate;return '<tr><td>'+cg+' '+(cg==='Titular'?i+1:i-rp.T+1)+'</td><td>'+(ok?esc(c.name):'<i>Empate: lo decide la Junta Electoral</i> ____________')+'</td><td class="n">'+(ok?c.votes:'')+'</td></tr>';}).join('')+'</tbody></table>'+(rank.some(c=>c.empate)?'<p class="nota">Hay empate en el límite entre puestos: la Junta Electoral lo resuelve según las reglas aprobadas y lo anota en observaciones.</p>':'')+'</section>';}).join('')+
   '<section class="cierre"><h2>Observaciones e incidencias</h2><div class="obs"></div><p>Siendo las ____ horas, se da por concluido el proceso electoral y firman en señal de conformidad:</p>'+sigBlock(data)+'</section></html>';
 }
 function actaHtml(data){
  const day=new Date(data.openedAt).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'long',year:'numeric'});
  return '<!doctype html><html lang="es"><meta charset="utf-8"><title>Acta de escrutinio</title><style>'+sigCss+'@page{size:A4;margin:16mm}body{font:12.5px Arial,sans-serif;color:#222;max-width:180mm;margin:20px auto;line-height:1.5}h1{font-size:18px;text-align:center;margin:0 0 2px;color:#5c0f53}h2{font-size:14px;margin:18px 0 6px;color:#5c0f53}.c{text-align:center;margin:0 0 14px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#f3eaf1}td.n{text-align:right;width:22mm}.demo{border:2px solid #b45309;color:#b45309;font-weight:bold;text-align:center;padding:6px;margin:10px 0}.obs{border:1px solid #999;height:28mm;margin-top:4px}.f{display:grid;grid-template-columns:1fr 1fr;gap:22mm 14mm;margin-top:26mm}table,.obs,.f{break-inside:avoid;page-break-inside:avoid}h2{break-after:avoid;page-break-after:avoid}.f div{border-top:1px solid #222;padding-top:4px;font-size:11.5px}</style>'+
   '<h1>ACTA DE ESCRUTINIO</h1><p class="c"><b>'+esc(cfg.company)+'</b><br>Elección de representantes de los trabajadores · Periodo '+esc(cfg.period)+'</p>'+(data.demo?'<p class="demo">DOCUMENTO DE PRUEBA · SIN VALIDEZ</p>':'')+
   '<p>El '+esc(day)+', siendo las '+esc(new Date(data.openedAt).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}))+' (hora de Perú), concluida la votación electrónica programada de '+esc(new Date(cfg.opens).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}))+' a '+esc(new Date(cfg.closes).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}))+', la junta electoral abrió el escrutinio en el portal con la participación de '+data.openedBy.map(m=>esc(m.name)+' ('+esc(m.role)+')').join(' y ')+', con los siguientes resultados:</p>'+
   data.elections.map(e=>{const r=e.results;return '<h2>'+esc(e.title)+'</h2><table><thead><tr><th>N.º</th><th>Candidatura</th><th>Votos</th></tr></thead><tbody>'+r.candidates.map(c=>'<tr><td>'+String(c.number||'').padStart(2,'0')+'</td><td>'+esc(c.name)+'</td><td class="n">'+c.votes+'</td></tr>').join('')+'<tr><td></td><td>Votos en blanco</td><td class="n">'+r.blank+'</td></tr><tr><th></th><th>Total de votos emitidos</th><th class="n">'+r.total+'</th></tr></tbody></table><p>Trabajadores habilitados: '+e.eligible+' · Participación: '+e.participation+' ('+pct(e.participation,e.eligible)+'%).</p>';}).join('')+
   '<h2>Observaciones</h2><div class="obs"></div><p>Firman en señal de conformidad:</p>'+sigBlock(data)+'</html>';
 }
})();


/* ===== Panel de la junta ordenado en pestañas ===== */
(()=>{
 const baseAdmin3=renderAdmin;
 renderAdmin=function(report,key){
  const keepTab=document.querySelector('.jtabs [aria-selected=true]');const prev=keepTab?keepTab.dataset.tab:'resumen';
  baseAdmin3(report,key);
  const pick=sel=>[...content.querySelectorAll(sel)];
  const groups={
   resumen:{label:'Resumen',help:'Cuántas personas ya votaron en cada comité. Se actualiza con el botón "Actualizar".',els:pick('.admin-demo,.admin-stats')},
   votantes:{label:'¿Quién ya votó?',help:'Busca por DNI o nombre, o usa los botones para ver a quién le falta votar. Nunca se muestra por quién votó cada persona.',els:pick('.admin-toolbar,.quick-filters,.admin-filters,.admin-table-wrap,.admin-table-wrap+p.muted').filter(el=>!el.closest('.signature-register'))},
   firmas:{label:'Constancias firmadas',help:'Trabajadores que firmaron su constancia de participación. Puedes ver cada una.',els:pick('.signature-register')},
   resultados:{label:'Resultados',help:'Se abren después del cierre con dos integrantes de la junta. Desde aquí se descarga el acta.',els:pick('#escrutinio')},
   actividad:{label:'Actividad',help:'Quién ingresó al panel y cuándo, y otros eventos del sistema.',els:pick('.activity')}
  };
  const nav=document.createElement('div');nav.className='jtabs';nav.setAttribute('role','tablist');
  const holder=document.createElement('div');holder.className='jpanels';
  for(const [id,g] of Object.entries(groups)){
   const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.dataset.tab=id;b.textContent=g.label;nav.append(b);
   const panel=document.createElement('section');panel.className='jpanel';panel.dataset.tab=id;panel.setAttribute('role','tabpanel');
   panel.innerHTML='<p class="jhelp">'+esc(g.help)+'</p>';g.els.forEach(el=>panel.append(el));holder.append(panel);
  }
  pick('.panel-banner').forEach(b=>b.remove());
  const head=content.querySelector('.admin-heading');head.after(nav);nav.after(holder);
  const act=content.querySelector('.activity');if(act)act.open=true;
  pick('.inspect-committee').forEach(b=>b.remove());
  const committee=$('#committee-filter');if(committee){committee.value='all';committee.closest('label').hidden=true;}
  const show=$('#worker-filter');if(show)show.closest('label').hidden=true;
  const select=id=>{nav.querySelectorAll('[role=tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===id)));holder.querySelectorAll('.jpanel').forEach(p=>p.hidden=p.dataset.tab!==id);};
  nav.querySelectorAll('[role=tab]').forEach(b=>b.onclick=()=>select(b.dataset.tab));
  select(groups[prev]?prev:'resumen');
 };
})();

/* ===== "¿Cuándo actúa el comité?" como recorrido interactivo ===== */
(()=>{
 const panel=document.getElementById('ex-panel');if(!panel)return;
 const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function enhance(){
  const ol=panel.querySelector('ol.ex-flow');if(!ol||panel.querySelector('.flow-x'))return;
  const steps=[...ol.children].map(li=>({icon:li.querySelector('.ex-node').innerHTML,label:li.querySelector('.ex-sit small').textContent.replace(/\s*\d+$/,''),sit:li.querySelector('.ex-sit b').textContent,act:li.querySelector('.ex-act p').textContent}));
  const box=document.createElement('div');box.className='flow-x';
  box.innerHTML='<div class="flow-nodes"><span class="flow-line"><i></i></span>'+steps.map((s,i)=>'<button type="button" class="flow-node" data-i="'+i+'" aria-label="'+esc(s.label)+' '+(i+1)+'">'+s.icon+'</button>').join('')+'</div>'+
   '<div class="flow-stage" aria-live="polite"><div class="flow-sit"><small></small><b></b></div><button type="button" class="flow-reveal"><span class="flow-q">?</span><span>¿Qué hace el comité? <em>Toca para descubrirlo</em></span></button><div class="flow-act" hidden><small>QUÉ HACE EL COMITÉ</small><p></p></div><div class="flow-nav"><button type="button" class="flow-prev">← Anterior</button><span class="flow-count"></span><button type="button" class="flow-next primary">Siguiente →</button></div></div>';
  ol.replaceWith(box);
  const nodes=[...box.querySelectorAll('.flow-node')],seen=new Set();let cur=0;
  const $$=s=>box.querySelector(s);
  function anim(el,kf){if(!still())el.animate(kf,{duration:380,easing:'cubic-bezier(.2,.7,.2,1)'});}
  function go(i){
   cur=i;const s=steps[i];
   nodes.forEach((n,k)=>{n.classList.toggle('active',k===i);n.classList.toggle('seen',seen.has(k)&&k!==i);n.setAttribute('aria-current',k===i?'step':'false');});
   $$('.flow-line i').style.setProperty('width',(steps.length>1?100*i/(steps.length-1):0)+'%');
   $$('.flow-sit small').textContent=s.label+' '+(i+1)+' de '+steps.length;$$('.flow-sit b').textContent=s.sit;
   $$('.flow-act p').textContent=s.act;$$('.flow-act').hidden=true;$$('.flow-reveal').hidden=false;
   $$('.flow-prev').disabled=i===0;$$('.flow-count').textContent=(i+1)+' / '+steps.length;
   $$('.flow-next').textContent=i===steps.length-1?'Volver al inicio ↺':'Siguiente →';
   anim($$('.flow-sit'),[{opacity:0,transform:'translateX(24px)'},{opacity:1,transform:'none'}]);
  }
  function reveal(){seen.add(cur);$$('.flow-reveal').hidden=true;$$('.flow-act').hidden=false;nodes[cur].classList.add('seen');anim($$('.flow-act'),[{opacity:0,transform:'translateY(16px) scale(.97)'},{opacity:1,transform:'none'}]);}
  nodes.forEach((n,i)=>n.onclick=()=>go(i));
  $$('.flow-reveal').onclick=reveal;
  $$('.flow-prev').onclick=()=>go(Math.max(0,cur-1));
  $$('.flow-next').onclick=()=>go(cur===steps.length-1?0:cur+1);
  go(0);
 }
 new MutationObserver(enhance).observe(panel,{childList:true});enhance();
})();

/* ===== Modo votación: al ingresar solo se ve la votación ===== */
(()=>{
 let was=false;
 const sync=()=>{
  const on=!!token||!!content.querySelector('.admin-heading');
  document.body.classList.toggle('voting-mode',on);
  if(on&&!was)scrollTo({top:0,behavior:'auto'});
  was=on;
 };
 new MutationObserver(sync).observe(content,{childList:true});sync();
})();

/* ===== Botón "Mostrar" en las claves de la junta ===== */
(()=>{
 function addToggle(input){
  if(!input||input.closest('.pw-wrap'))return;
  const wrap=document.createElement('div');wrap.className='pw-wrap';input.before(wrap);wrap.append(input);
  const t=document.createElement('button');t.type='button';t.className='pw-toggle';t.textContent='Mostrar';t.setAttribute('aria-label','Mostrar u ocultar la clave');
  t.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';t.textContent=show?'Ocultar':'Mostrar';input.focus();};
  wrap.append(t);
 }
 new MutationObserver(()=>{addToggle(document.getElementById('key'));addToggle(document.getElementById('esc-key'));}).observe(content,{childList:true,subtree:true});
})();

/* ===== Los avisos siempre se ven, aunque la página esté más abajo ===== */
(()=>{
 const baseNotice=notice;
 notice=function(s=''){baseNotice(s);if(!s)return;const el=$('#notice'),r=el.getBoundingClientRect();if(r.top<90||r.bottom>innerHeight)el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
})();

/* ===== Lectura obligatoria de cada comité ===== */
(()=>{
 const panel=document.getElementById('ex-panel'),box=document.getElementById('explainer');if(!panel||!box)return;
 const prog={},st=id=>prog[id]||(prog[id]={funcs:new Set(),cases:new Set()});
 panel.addEventListener('click',ev=>{
  const id=box.dataset.theme,f=ev.target.closest('.ex-func');
  if(f)st(id).funcs.add([...panel.querySelectorAll('.ex-func')].indexOf(f));
  if(ev.target.closest('.flow-reveal')){const a=panel.querySelector('.flow-node.active');if(a)st(id).cases.add(+a.dataset.i);}
  setTimeout(update,0);
 },true);
 function update(){
  const id=box.dataset.theme,btn=document.getElementById('confirm-reading');if(!btn)return;
  let list=panel.querySelector('.read-checklist');
  if(reviewedCommittees.has(id)){if(list)list.remove();return;}
  const nf=panel.querySelectorAll('.ex-func').length,nc=panel.querySelectorAll('.flow-node').length,s=st(id),okF=s.funcs.size>=nf,okC=s.cases.size>=nc;
  if(!list){btn.insertAdjacentHTML('beforebegin','<ul class="read-checklist" aria-live="polite"></ul>');list=panel.querySelector('.read-checklist');}
  list.innerHTML='<li class="'+(okF?'ok':'')+'"><span aria-hidden="true">'+(okF?'✓':'')+'</span>Abre las '+nf+' tarjetas de "Sus funciones" <b>'+Math.min(s.funcs.size,nf)+'/'+nf+'</b></li><li class="'+(okC?'ok':'')+'"><span aria-hidden="true">'+(okC?'✓':'')+'</span>Descubre las '+nc+' respuestas de "¿Cuándo actúa el comité?" <b>'+Math.min(s.cases.size,nc)+'/'+nc+'</b></li>';
  btn.disabled=!(okF&&okC);btn.textContent=btn.disabled?'Completa la lectura para confirmar':'He leído la información de este comité';
 }
 new MutationObserver(()=>setTimeout(update,0)).observe(panel,{childList:true});setTimeout(update,0);
})();

/* ===== Firma obligatoria con nombres y apellidos ===== */
(()=>{
 const okName=n=>{const t=String(n||'').trim().replace(/\s+/g,' ');return t.length<=150&&/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(t)&&t.split(' ').filter(w=>w.replace(/['-]/g,'').length>=2).length>=2;};
 const nameMsg='Escribe tus nombres y apellidos completos (al menos un nombre y un apellido, solo letras).';
 const baseSuccess3=showSuccess;
 showSuccess=function(e){
  baseSuccess3(e);
  ['#continue-voting','#finish-session'].forEach(s=>{const b=$(s);if(b)b.remove();});
  const sign=[...content.querySelectorAll('.vote-success .actions button')].find(b=>/Firmar/.test(b.textContent));
  if(sign)sign.textContent='Firmar mi constancia (obligatorio) →';
  const m=content.querySelector('.vote-success .muted');if(m)m.insertAdjacentHTML('afterend','<p class="must-sign">Para terminar, firma tu constancia de participación. <b>Es obligatoria.</b></p>');
 };
 const baseSig=signatureForm;
 signatureForm=function(e){
  baseSig(e);
  const later=$('#later-signature');if(later){later.hidden=true;later.setAttribute('aria-hidden','true');}
  const lab=content.querySelector('label[for=signer-name]');if(lab)lab.textContent='Nombres y apellidos completos (obligatorio)';
  const inp=$('#signer-name');if(!inp)return;
  inp.placeholder='Ejemplo: María Elena Pérez Rojas';inp.required=true;
  const hint=document.createElement('p');hint.className='name-hint';inp.after(hint);
  const check=()=>{const ok=okName(inp.value);inp.classList.toggle('is-ok',ok);hint.textContent=!inp.value.trim()?'':ok?'✓ Nombre completo':'Falta: escribe al menos un nombre y un apellido, solo con letras.';hint.classList.toggle('ok',ok);};
  inp.addEventListener('input',check);
  const save=$('#save-signature'),orig=save.onclick;
  save.onclick=ev=>{if(!okName(inp.value)){check();notice(nameMsg);inp.focus();return;}return orig(ev);};
 };
 const baseDash3=dashboard;
 dashboard=async function(){
  await baseDash3();
  const pend=(status.voted||[]).filter(id=>!(status.signed||[]).includes(id));if(!pend.length)return;
  const e=cfg.elections.find(x=>x.id===pend[0]);
  content.querySelector('h2').insertAdjacentHTML('afterend','<div class="must-sign-box" role="alert"><div><b>Falta firmar tu constancia de '+esc(e.title)+'.</b><span>Es obligatoria y debes hacerla antes de votar en el otro comité.</span></div><button class="primary" id="sign-now">Firmar ahora →</button></div>');
  $('#sign-now').onclick=()=>signatureForm(e);
  content.querySelectorAll('[data-election]').forEach(b=>{if(!status.voted.includes(b.dataset.election)){b.disabled=true;b.textContent='Primero firma tu constancia';}});
 };
})();

/* Cierre de la votación: aviso al trabajador y, en modo prueba, botón para simular el cierre. */
(()=>{
 const baseDash4=dashboard;
 dashboard=async function(){
  await baseDash4();
  if(!status||(status.phase!=='cerrada'&&status.phase!=='antes'))return;
  const closed=status.phase==='cerrada';
  const h=content.querySelector('h2');
  if(h)h.insertAdjacentHTML('afterend','<div class="closed-box" role="status"><b>'+(closed?'La votación está cerrada.':'La votación aún no empieza.')+'</b><span>'+(closed?'Terminó a las 4:00 p. m. Ya no se reciben votos. Gracias por participar.':'Se abre el lunes 2 de noviembre a las 9:00 a. m.')+(closed&&(status.voted||[]).length?' Puedes descargar tus constancias abajo.':'')+'</span></div>');
  content.querySelectorAll('[data-election]').forEach(b=>{if(!status.voted.includes(b.dataset.election)){b.disabled=true;b.textContent=closed?'Votación cerrada':'Aún no empieza';}});
 };
 const baseAdmin5=renderAdmin;
 renderAdmin=function(report,key){
  baseAdmin5(report,key);
  if(!report.demo)return;
  const head=content.querySelector('.admin-heading');if(!head)return;
  head.insertAdjacentHTML('afterend','<div class="demo-close"><div><b>Modo prueba · '+(report.closed?'votación CERRADA (simulada)':'votación abierta')+'</b><span>'+(report.closed?'Así se verá después de las 4:00 p. m.: nadie puede votar y la junta abre el escrutinio. Pulsa “Reabrir” para seguir probando.':'Simula las 4:00 p. m. para ver cómo se cierra la votación. En la elección real se cierra sola.')+'</span></div><button id="demo-close-btn" class="'+(report.closed?'':'primary')+'">'+(report.closed?'Reabrir votación (prueba)':'Simular cierre de votación')+'</button></div>');
  $('#demo-close-btn').onclick=async e=>{e.currentTarget.disabled=true;try{await api('demo-cierre',{key,closed:!report.closed});const c=await (await fetch('/api/config')).json();cfg.closes=c.closes;renderAdmin(await api('admin',{key}),key);notice(report.closed?'Votación reabierta (prueba).':'Votación cerrada (simulación). Ahora entra como trabajador para ver lo que verán ellos.');}catch(err){notice(err.message);e.currentTarget.disabled=false;}};
 };
})();

/* ===== Portada dinámica: fotos que cambian, frase que rota y cuenta regresiva animada ===== */
(()=>{
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fig=document.querySelector('.hero-photo');
 /* 1. Fotos que cambian solas con acercamiento lento */
 if(fig&&fig.querySelector('img')){
  const first=fig.querySelector('img');first.classList.add('hs-slide');
  const slides=[first,...[['/sst.jpg','Comité de Seguridad y Salud en el Trabajo'],['/hs.jpg','Comité de Intervención frente al Hostigamiento Sexual']].map(([src,alt])=>{const im=new Image();im.className='hs-slide';im.alt=alt;im.decoding='async';im.src=src;fig.append(im);return im;})];
  const dots=document.createElement('div');dots.className='hs-dots';
  slides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Ver foto '+(i+1)+' de '+slides.length);b.onclick=()=>{go(i);restart();};dots.append(b);});
  fig.append(dots);
  let cur=0,timer=null;
  function go(n){cur=(n+slides.length)%slides.length;slides.forEach((s,i)=>s.classList.toggle('hs-on',i===cur));[...dots.children].forEach((d,i)=>{d.classList.toggle('on',i===cur);d.setAttribute('aria-pressed',String(i===cur));});}
  function restart(){clearInterval(timer);if(!still)timer=setInterval(()=>go(cur+1),6000);}
  go(0);restart();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(timer);else restart();});
 }
 /* 2. Frase que rota debajo del título */
 const em=document.querySelector('.hero h1 em');
 if(em&&!still){
  const phrases=['Lo elegimos juntos.','Tu voz cuenta.','Tu voto es secreto.','Participa este 2/11.'];let k=0;
  em.classList.add('rot');
  setInterval(()=>{em.classList.add('out');setTimeout(()=>{k=(k+1)%phrases.length;em.textContent=phrases[k];em.classList.remove('out');},450);},3800);
 }
 /* 4. Cuenta regresiva: los números que cambian giran; con la votación abierta, tiempo para el cierre y botón */
 const hero=document.querySelector('.hero');if(!hero)return;
 let last=[];
 const mo=new MutationObserver(()=>{
  const box=hero.querySelector('.countdown');if(!box)return;
  const bs=[...box.querySelectorAll('.countdown-unit b')],vals=bs.map(b=>b.textContent);
  if(!still)bs.forEach((b,i)=>{if(last.length&&last[i]!==vals[i])b.classList.add('flip');});
  last=vals;
  if(box.classList.contains('is-open')&&cfg&&cfg.closes&&Date.now()<Date.parse(cfg.closes)&&!box.querySelector('.cd-vote')){
   const m=Math.max(0,Math.round((Date.parse(cfg.closes)-Date.now())/60000)),h=Math.floor(m/60);
   box.insertAdjacentHTML('beforeend','<p class="cd-left">Faltan '+(h?h+' h ':'')+(m%60)+' min para el cierre</p><a class="cd-vote" href="#acceso" data-learning-link="true">Votar ahora →</a>');
  }
 });
 mo.observe(hero,{childList:true,subtree:true});
})();

/* ===== Votación con movimiento: transiciones entre pantallas, tarjetas y selección ===== */
(()=>{
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||!content)return;
 /* Cada pantalla nueva (elecciones, cédula, revisión, constancia) entra con un deslizamiento suave y escalonado. */
 const ringIn=()=>content.querySelectorAll('.dash-summary .v,.ring-value').forEach(r=>{const t=r.getAttribute('stroke-dasharray');if(!t||r.dataset.anim===t)return;r.dataset.anim=t;r.setAttribute('stroke-dasharray','0 100');requestAnimationFrame(()=>requestAnimationFrame(()=>r.setAttribute('stroke-dasharray',t)));});
 new MutationObserver(()=>{content.classList.remove('vt');void content.offsetWidth;content.classList.add('vt');ringIn();}).observe(content,{childList:true});
 /* Onda al tocar una candidatura. */
 content.addEventListener('pointerdown',e=>{const c=e.target.closest('.candidate-options .candidate');if(!c)return;const r=c.getBoundingClientRect(),d=Math.max(r.width,r.height)*2,s=document.createElement('span');s.className='ripple';s.style.setProperty('width',d+'px');s.style.setProperty('height',d+'px');s.style.setProperty('left',(e.clientX-r.left-d/2)+'px');s.style.setProperty('top',(e.clientY-r.top-d/2)+'px');c.append(s);setTimeout(()=>s.remove(),700);});
})();

/* ===== "Tus elecciones": tarjetas de foto completa con panel translúcido ===== */
(()=>{
 const baseDash5=dashboard;
 dashboard=async function(){
  await baseDash5();
  const cards=[...content.querySelectorAll('.dash-card')];if(cards.length<1)return;
  const grid=document.createElement('div');grid.className='dash-grid';cards[0].before(grid);cards.forEach(c=>grid.append(c));
  cards.forEach((c,i)=>{const s=c.querySelector('.dash-photo span');if(s)s.textContent='COMITÉ '+String(i+1).padStart(2,'0');});
 };
})();
