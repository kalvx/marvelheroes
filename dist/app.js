'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => Number(n).toLocaleString('en-US');
const icons = {heroes:'◈',items:'▧',teamups:'♧',powers:'ϟ',vendors:'▱',zones:'◇',missions:'≡',crafting:'⚒',achievements:'✧',villains:'◉',enemies:'⋈',waypoints:'⌖',rooms:'▣'};
const state = {data:null,edition:null,section:'heroes',query:'',filter:'',sort:'name',page:1,size:24,view:'grid',saved:new Set(),recordMap:new Map(),pathMap:new Map()};
try { state.saved = new Set(JSON.parse(localStorage.getItem('mh-compendium-saved') || '[]')); state.view=localStorage.getItem('mh-compendium-view') || 'grid'; } catch {}
let lastSection = 'heroes', toastTimer;

function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,2500); }
function persistSaved() { try {localStorage.setItem('mh-compendium-saved',JSON.stringify([...state.saved]));}catch{} $('saved-count').textContent=state.saved.size; }
function canonical(path) { return String(path).split('#')[0].replace(/\/$/,''); }
function field(record, label) { return record.fields.find(f=>f.label.toLowerCase()===label.toLowerCase())?.value || ''; }
function saveButton(record, table=false) { const yes=state.saved.has(record.key); return `<button class="${table?'table-save':'save-button'}" data-save="${esc(record.key)}" aria-label="${yes?'Unsave':'Save'} ${esc(record.name)}" aria-pressed="${yes}">${yes?'★':'☆'}</button>`; }
function getSection() { return state.section==='saved' ? {id:'saved',title:'Saved entries',intro:'Your personal reference shelf.',records:state.data.sections.flatMap(s=>s.records).filter(r=>state.saved.has(r.key))} : state.data.sections.find(s=>s.id===state.section); }
function category(record) { if(state.section==='saved') return record.sectionTitle; return field(record,'Category') || field(record,'Group') || (record.sectionId==='items' ? field(record,'Type') : '') || field(record,'Archetype') || field(record,'Hero') || field(record,'Location') || ''; }
function normalize(text) { return String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function updateUrl(entry) { const p=new URLSearchParams(); if(state.query)p.set('q',state.query); if(state.filter)p.set('filter',state.filter); if(entry)p.set('entry',entry); const hash='#'+state.section+(p.size?'?'+p:''); history.replaceState(null,'',hash); }

function navigate() {
  if(!state.data)return;
  const raw=location.hash.slice(1) || 'heroes'; const [route,query='']=raw.split('?'); const params=new URLSearchParams(query);
  if($('detail').open) $('detail').close();
  closeNavigation();
  document.querySelectorAll('nav a').forEach(a=>{ const selected=a.getAttribute('href')==='#'+route; a.classList.toggle('active',selected); if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current'); });
  if(route.startsWith('guide/')) { showGuide(route.slice(6)); return; }
  const valid=route==='saved'||state.data.sections.some(s=>s.id===route);
  const next=valid?route:'heroes';
  if(next!==state.section){state.page=1;state.filter='';state.query='';}
  state.section=next; if(next!=='saved')lastSection=next;
  state.query=params.get('q')||''; state.filter=params.get('filter')||'';
  const section=getSection();
  $('catalog-view').hidden=false;$('guide-view').hidden=true;$('section-count').hidden=false;
  $('breadcrumb').textContent=state.section==='saved'?'SAVED ENTRIES':'DATABASE';
  $('eyebrow').textContent='YOUR GUIDE TO THE MARVEL UNIVERSE';$('page-title').firstChild.textContent=section.title.toUpperCase()+' ';$('section-count').textContent=number(section.records.length);
  $('page-intro').textContent=section.intro;$('saved-toggle').setAttribute('aria-pressed',state.section==='saved');
  $('search').value=state.query;$('search').placeholder=state.section==='heroes'?'Find a hero…':`Search ${section.title.toLowerCase()}…`;
  $('sort').querySelector('[value="cost"]').hidden=!['heroes','teamups','saved'].includes(state.section);
  if($('sort').selectedOptions[0].hidden){state.sort='name';$('sort').value='name';}
  const categories=[...new Set(section.records.map(category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('category-filter').innerHTML='<option value="">All '+(state.section==='heroes'?'archetypes':state.section==='saved'?'sections':'categories')+'</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c.replace(/\n/g,' / '))}</option>`).join('');
  if(!categories.includes(state.filter))state.filter=''; $('category-filter').value=state.filter;
  $('category-filter').parentElement.hidden=!categories.length;
  document.title=section.title+' · Marvel Heroes Compendium';
  render();
  const entry=params.get('entry'); if(entry){const record=state.recordMap.get(entry); if(record)openDetail(record);else toast('This entry could not be found.');}
}

function render() {
  const section=getSection(); if(!section)return;
  $('section-count').textContent=number(section.records.length);
  let records=section.records.filter(r=>(!state.filter||category(r)===state.filter)&&(!state.query||normalize([r.name,...r.fields.map(f=>f.value),...(r.hints||[]),...(r.objectives||[])].join(' ')).includes(normalize(state.query))));
  records.sort((a,b)=>state.sort==='cost' ? (parseFloat(field(a,'Splinters'))||Infinity)-(parseFloat(field(b,'Splinters'))||Infinity)||a.name.localeCompare(b.name) : a.name.localeCompare(b.name)*(state.sort==='name-desc'?-1:1));
  const total=records.length, pages=Math.max(1,Math.ceil(total/state.size)); state.page=Math.max(1,Math.min(state.page,pages));
  const start=(state.page-1)*state.size; const visible=records.slice(start,start+state.size);
  $('result-summary').textContent=total ? `${number(start+1)}—${number(start+visible.length)} of ${number(total)} ${section.title.toLowerCase()}` : '0 entries';
  $('reset').hidden=!state.query&&!state.filter;
  $('empty').hidden=total!==0;$('results').hidden=total===0;$('results').setAttribute('aria-busy','false');
  $('pagination')?.removeAttribute('hidden');
  $('page-info').textContent=`${state.page} / ${pages}`;$('prev').disabled=state.page===1;$('next').disabled=state.page===pages;
  $('grid-mode').setAttribute('aria-pressed',state.view==='grid');$('table-mode').setAttribute('aria-pressed',state.view==='table');
  $('results').innerHTML=state.view==='table'?renderTable(visible):visible.map((r,i)=>renderCard(r,start+i)).join('');
  installImageFallbacks();
}

function renderCard(r,index) {
  const full=!!r.art&&['heroes','teamups'].includes(r.sectionId); const image=full?r.art:r.icon;
  const archetype=field(r,'Archetype')||field(r,'Type')||field(r,'Group')||r.sectionTitle;
  const splinters=field(r,'Splinters'),g=field(r,'Price G');
  const meta=field(r,'PC Synergy')||field(r,'Location')||field(r,'Hero')||field(r,'Type')||field(r,'Level');
  return `<article class="card ${full?'':'compact'}">${saveButton(r)}<button class="card-open" data-open="${esc(r.key)}" aria-label="Open ${esc(r.name)}"><div class="card-visual ${full?'portrait':'small-icon'}"><span class="entry-number">${String(index+1).padStart(3,'0')}</span>${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async">`:`<span class="placeholder-icon" aria-hidden="true">${esc(icons[r.sectionId]||'◇')}</span>`}</div><div class="card-info"><h2>${esc(r.name)}</h2><div class="card-type">${esc(archetype.replace(/\n/g,' · '))}</div>${meta?`<div class="card-meta">${esc(meta)}</div>`:''}<div class="card-stats">${splinters?`<span title="Eternity Splinters"><span class="currency-symbol">◆</span>${esc(splinters)}</span>`:`<span class="muted">${esc(r.sectionTitle)}</span>`}${g?`<span title="G"><span class="currency-symbol g-symbol">G</span>${esc(g)}</span>`:''}<span class="entry-arrow" aria-hidden="true">↗</span></div></div></button></article>`;
}

function renderTable(records) {
  const section=getSection();
  const preferred=state.section==='heroes'?['Splinters','Price G','PC Synergy','Archetype']:state.section==='items'?['Type']:[];
  const columns=preferred.length?preferred:[...new Set(section.records.flatMap(r=>r.fields.map(f=>f.label)))].filter(c=>!['Type'].includes(c)||state.section!=='heroes').slice(0,4);
  return `<div class="table-wrap"><table class="catalog-table"><thead><tr><th scope="col">NAME</th>${columns.map(c=>`<th scope="col">${esc(c.toUpperCase())}</th>`).join('')}<th scope="col"><span class="sr-only">Save entry</span></th></tr></thead><tbody>${records.map(r=>`<tr><td><button class="table-entry" data-open="${esc(r.key)}">${r.icon?`<img src="${esc(r.icon)}" alt="" loading="lazy">`:''}<span>${esc(r.name)}</span></button></td>${columns.map(c=>`<td>${esc(field(r,c)||'—')}</td>`).join('')}<td>${saveButton(r,true)}</td></tr>`).join('')}</tbody></table></div>`;
}

function installImageFallbacks() { document.querySelectorAll('img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.onerror=null;};}); }
function save(key) {
  if(state.saved.has(key))state.saved.delete(key);else state.saved.add(key);
  persistSaved();render();
  if($('detail').open){const record=state.recordMap.get($('detail').dataset.key);if(record){fillDetail(record);addDirections(record);}}
}

function navigateEntry(record) {
  const section=state.section.startsWith('guide/')?record.sectionId:state.section;
  const p=new URLSearchParams();if(state.query)p.set('q',state.query);if(state.filter)p.set('filter',state.filter);p.set('entry',record.key);
  location.hash=section+'?'+p;
}

function readableRank(value, facts) {
  if(!value.includes('?')||!facts?.ranks?.rank1)return value;
  let index=0;return value.replace(/\?/g,()=>facts.ranks.rank1[index++]??'?');
}

function fillDetail(record) {
  const facts=state.data.details[record.tooltipId+'|'+record.tooltipFilter]||{};
  const fields=record.fields.filter(f=>!(record.sectionId==='heroes'&&f.label==='Type'));
  const extra=[['level','Level required'],['grade','Item grade'],['slot','Equipment slot'],['price','Sell value (credits)']];
  for(const [key,label] of extra)if(facts[key]&&!fields.some(f=>f.label===label))fields.push({label,value:facts[key]});
  const effects=[facts.info||facts.info_curent,facts.power,facts.cosmic,facts.bonus,facts.ench].filter(Boolean).map(v=>readableRank(v,facts));
  const related=[];for(const link of [...record.links,...(record.relatedMissions||[]).map(href=>({href}))]){const target=state.pathMap.get(canonical(link.href));if(target&&target.key!==record.key&&!related.some(r=>r.key===target.key))related.push(target);}
  let relatedPowers=[];
  if(record.sectionId==='heroes'){
    relatedPowers=state.data.sections.find(s=>s.id==='powers')?.records.filter(r=>r.links.some(l=>canonical(l.href)===canonical(record.path)))||[];
    if(!relatedPowers.length)relatedPowers=state.data.sections.find(s=>s.id==='powers')?.records.filter(r=>r.fields.some(f=>normalize(f.value)===normalize(record.name)))||[];
  }
  const art=record.art||record.icon||facts.icon;
  const saved=state.saved.has(record.key);
  $('detail-body').innerHTML=`<div class="detail-top ${art?'has-art':''}">${art?`<img class="detail-art" src="${esc(art)}" alt="">`:''}<div class="eyebrow">${esc(record.sectionTitle.toUpperCase())} / ENTRY</div><h2 id="detail-title">${esc(record.name)}</h2><div class="subtitle">${esc(field(record,'Archetype').replace(/\n/g,' · ')||facts.type_name||record.sectionTitle)}</div></div><div class="detail-content"><div class="detail-actions"><button data-save="${esc(record.key)}" class="${saved?'saved':''}">${saved?'★ Saved':'☆ Save entry'}</button><button data-copy-link>Copy link ↗</button></div>${fields.length?`<div class="detail-label">AT A GLANCE</div><dl class="fact-grid">${fields.map(f=>`<div class="fact ${f.value.length>90?'wide':''}"><dt>${esc(f.label.toUpperCase())}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>`:''}${effects.length?`<div class="detail-label">EFFECTS & ATTRIBUTES</div>${effects.map(e=>`<div class="effect">${esc(e)}</div>`).join('')}`:''}${related.length?`<div class="detail-label">RELATED ENTRIES</div><div class="related-list">${related.slice(0,18).map(r=>`<button data-related="${esc(r.key)}">${esc(r.name)} ↗</button>`).join('')}</div>`:''}${relatedPowers.length?`<div class="detail-label">HERO POWERS</div><div class="related-list">${relatedPowers.slice(0,12).map(r=>`<button data-related="${esc(r.key)}">${esc(r.name)} ↗</button>`).join('')}</div><p><a class="source-link" href="#powers?q=${encodeURIComponent(record.name)}">Browse this hero’s powers ↗</a></p>`:''}${record.sectionId==='heroes'?`<div class="guide-callout">Eligible heroes can be your one free permanent choice. Other available heroes can be tried to level 10. <a href="#guide/start" class="source-link">Unlock guide ↗</a></div>`:''}<p class="reference-note">Catalog facts are cross-referenced with AlexBond / MHBugle. Availability and values can differ between releases. See the field guides for current gameplay adjustments.</p></div>`;
  installImageFallbacks();
}

function addDirections(record){
  if(!record.hints?.length&&!record.objectives?.length)return;
  const block=document.createElement('section');
  block.innerHTML=(record.hints?.length?`<div class="detail-label">HOW TO FIND IT</div>${record.hints.map(h=>`<div class="effect">${esc(h)}</div>`).join('')}`:'')+(record.objectives?.length?`<div class="detail-label">MISSION OBJECTIVES</div><ol class="objectives">${record.objectives.map(o=>`<li>${esc(o)}</li>`).join('')}</ol>`:'');
  const content=$('detail-body').querySelector('.detail-content');content.insertBefore(block,content.children[1]||null);
}
function openDetail(record) { $('detail').dataset.key=record.key;fillDetail(record);addDirections(record);if(!$('detail').open)$('detail').showModal(); }
function closeDetail() { if($('detail').open)$('detail').close(); }

function showGuide(key) {
  $('catalog-view').hidden=true;$('guide-view').hidden=false;$('section-count').hidden=true;$('breadcrumb').textContent='FIELD GUIDE';$('eyebrow').textContent='THE CURRENT MARVEL HEROES EXPERIENCE';
  $('saved-toggle').setAttribute('aria-pressed','false');
  let title='',intro='',html='';
  const guide=state.edition.guides[key];
  if(guide){title=guide.title;intro=guide.intro;html=`<div class="guide-grid">${guide.blocks.map((b,i)=>`<article class="guide-block"><div class="number">0${i+1} / FIELD NOTES</div><h2>${esc(b.title)}</h2><p>${esc(b.text)}</p></article>`).join('')}</div>`;
    if(key==='camera'){const c=state.edition.camera;html+=`<div class="guide-measures"><div class="measure"><strong>${number(c.distance)}</strong><span>DEFAULT FOLLOW DISTANCE</span></div><div class="measure"><strong>${number(c.zoom_min)}—${number(c.zoom_max)}</strong><span>THIRD-PERSON ZOOM RANGE</span></div><div class="measure"><strong>${c.field_of_view}° / ${c.first_person_fov}°</strong><span>THIRD / FIRST-PERSON FOV</span></div></div>`;}
  }else if(key==='gameplay'){
    title='Gameplay settings';intro='The current balance, rewards and unlock experience.';
    const labels={xp:'Experience gain',loot:'General item drops',rarity:'Rare-item find',special:'Special-item find',splinters:'Eternity Splinter cooldown',xp_orbs:'XP-orb quantity',health_orbs:'Health-orb quantity',boss_difficulty:'Story boss defenses'};
    const m=state.edition.modes;
    html=`<div class="guide-block"><h2>Current gameplay presets</h2><p>These are the saved settings at the last compendium update. Character, equipment and event bonuses still apply.</p><table class="settings-table"><thead><tr><th scope="col">SETTING</th><th scope="col">PRESET</th></tr></thead><tbody>${Object.entries(labels).map(([k,l])=>`<tr><td>${esc(l)}</td><td>${esc(m[k]==='Existing'&&k==='boss_difficulty'?'Normal':m[k])}</td></tr>`).join('')}</tbody></table></div><div class="guide-grid" style="margin-top:20px"><article class="guide-block"><div class="number">01 / CURRENCY</div><h2>Splinters → G</h2><p>Convert Eternity Splinters in steps of ${state.edition.currency.conversionStep}. Each Splinter converts to ${state.edition.currency.splintersToG} G.</p><label for="currency-input">Eternity Splinters</label><input id="currency-input" type="number" min="0" max="1000000" step="${state.edition.currency.conversionStep}" value="400" style="width:100%;padding:12px;margin:10px 0;background:#041321;border:1px solid #315b73"><p id="currency-result" role="status" aria-live="polite"></p></article><article class="guide-block"><div class="number">02 / DIFFICULTY</div><h2>Increased difficulty</h2><p>This server has increased difficulty in all stages.</p></article></div>`;
  }else{
    title='Credits & sources';intro='A reference built around the Marvel Heroes experience.';
    html=`<div class="guide-grid"><article class="guide-block"><div class="number">01 / CATALOG</div><h2>AlexBond / MHBugle</h2><p>Hero, item, power, vendor and world-reference facts are drawn from the MHBugle Item Base catalog.</p><a class="source-link" href="https://itembase.mhbugle.com/heroes/" target="_blank" rel="noopener noreferrer">Visit the source catalog ↗</a><p>Catalog entries span multiple releases. A listed record does not by itself establish availability in the current edition.</p></article><article class="guide-block"><div class="number">02 / CURRENT EDITION</div><h2>Our game, our presentation</h2><p>The field guides reflect our current camera, controller features, hero-choice flow, currency conversion and saved gameplay presets. The visual theme follows the Marvel Command Center.</p><p>Imported pages contain reference facts and artwork. Account records and connection settings are excluded.</p></article><article class="guide-block"><div class="number">03 / ARTWORK</div><h2>Marvel Heroes</h2><p>Marvel names, characters and artwork belong to their respective owners. The MARVEL logo and game artwork are used to identify the game and its catalog entries.</p><small>This compendium is not affiliated with or endorsed by Marvel Entertainment or Gazillion.</small></article><article class="guide-block"><div class="number">04 / YOUR REFERENCE SHELF</div><h2>Saved on this device</h2><p>Star an entry to keep it in Saved entries. Your saved list and display preference stay in this browser. No sign-in is required.</p><p>The catalog and its artwork are bundled with the compendium, so browsing does not depend on the original catalog responding.</p></article></div>`;
  }
  $('page-title').firstChild.textContent=title.toUpperCase();$('page-intro').textContent=intro;$('guide-view').innerHTML=html;document.title=title+' · Marvel Heroes Compendium';
  if(key==='gameplay'){$('currency-input').addEventListener('input',calculateCurrency);calculateCurrency();}
}

function calculateCurrency(){ const input=$('currency-input'), n=Number(input.value),c=state.edition.currency;const valid=input.value!==''&&Number.isInteger(n)&&n>=0&&n<=1000000&&n%c.conversionStep===0; $('currency-result').textContent=valid?`${number(n)} Splinters = ${number(Math.floor(n*c.splintersToG))} G`:`Enter a multiple of ${c.conversionStep} from 0 to 1,000,000.`; }
function reset(){state.query='';state.filter='';state.page=1;$('search').value='';$('category-filter').value='';updateUrl();render();}
function closeNavigation(){ $('sidebar').classList.remove('open');$('shade').hidden=true;$('mobile-menu').setAttribute('aria-expanded','false'); }

document.addEventListener('click',async event=>{
  const saveTarget=event.target.closest('[data-save]');if(saveTarget){save(saveTarget.dataset.save);return;}
  const open=event.target.closest('[data-open]');if(open){navigateEntry(state.recordMap.get(open.dataset.open));return;}
  const related=event.target.closest('[data-related]');if(related){const r=state.recordMap.get(related.dataset.related);location.hash=r.sectionId+'?entry='+encodeURIComponent(r.key);return;}
  if(event.target.closest('[data-copy-link]')){try{await navigator.clipboard.writeText(location.href);toast('Entry link copied');}catch{toast('Copy the entry URL from your address bar.');}}
});
$('search').addEventListener('input',()=>{state.query=$('search').value;state.page=1;updateUrl();render();});
$('category-filter').addEventListener('change',()=>{state.filter=$('category-filter').value;state.page=1;updateUrl();render();});
$('sort').addEventListener('change',()=>{state.sort=$('sort').value;state.page=1;render();});
$('page-size').addEventListener('change',()=>{state.size=Number($('page-size').value);state.page=1;render();});
for(const [id,view] of [['grid-mode','grid'],['table-mode','table']])$(id).addEventListener('click',()=>{state.view=view;try{localStorage.setItem('mh-compendium-view',view);}catch{}render();});
$('prev').addEventListener('click',()=>{state.page--;render();$('results').scrollIntoView({block:'start'});});
$('next').addEventListener('click',()=>{state.page++;render();$('results').scrollIntoView({block:'start'});});
$('reset').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
$('saved-toggle').addEventListener('click',()=>location.hash=state.section==='saved'?lastSection:'saved');
$('close-detail').addEventListener('click',()=>{closeDetail();updateUrl();});
$('detail').addEventListener('cancel',()=>updateUrl());
$('detail').addEventListener('click',event=>{if(event.target===$('detail')){const r=$('detail').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right){closeDetail();updateUrl();}}});
$('mobile-menu').addEventListener('click',()=>{const open=!$('sidebar').classList.contains('open');$('sidebar').classList.toggle('open',open);$('shade').hidden=!open;$('mobile-menu').setAttribute('aria-expanded',open);});
$('shade').addEventListener('click',closeNavigation);
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!$('detail').open&&!$('catalog-view').hidden){event.preventDefault();$('search').focus();}if(event.key==='Escape')closeNavigation();});
window.addEventListener('hashchange',navigate);

async function start(){
  try{
    const responses=await Promise.all([fetch('catalog.json'),fetch('edition.json')]);
    if(responses.some(r=>!r.ok))throw new Error('The catalog files are unavailable.');
    [state.data,state.edition]=await Promise.all(responses.map(r=>r.json()));
    for(const section of state.data.sections)for(const record of section.records){record.sectionId=section.id;record.sectionTitle=section.title;record.key=section.id+'|'+(record.path||record.id);state.recordMap.set(record.key,record);if(record.path)state.pathMap.set(canonical(record.path),record);}
    state.saved=new Set([...state.saved].filter(k=>state.recordMap.has(k)));persistSaved();
    $('catalog-nav').innerHTML=state.data.sections.map(s=>`<a href="#${esc(s.id)}"><span class="nav-icon" aria-hidden="true">${icons[s.id]||'◇'}</span>${esc(s.title)}<span class="nav-count">${number(s.records.length)}</span></a>`).join('');
    $('updated-date').textContent='UPDATED '+new Intl.DateTimeFormat('en-US',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Los_Angeles'}).format(new Date(state.data.updated)).toUpperCase();
    navigate();
  }catch(error){$('error').hidden=false;$('error').textContent='The compendium could not load. Refresh the page to try again. '+error.message;$('page-intro').textContent='Catalog unavailable';$('results').setAttribute('aria-busy','false');}
}
start();
