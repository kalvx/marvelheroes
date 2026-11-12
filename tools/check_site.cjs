/* Focused DOM checks of real page behavior. This is not visual/browser QA. */
const {JSDOM,VirtualConsole}=require('../.build-state/node_modules/jsdom');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const errors=[];
const output=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(dist,'index.html'),'utf8'),{url:'http://127.0.0.1:8765/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
const w=dom.window,d=w.document;
w.fetch=async name=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(dist,name),'utf8'))});
// jsdom does not implement these browser rendering/native dialog primitives.
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const tick=()=>new Promise(resolve=>w.setTimeout(resolve,12));
const el=id=>d.getElementById(id);
const click=selector=>{const target=d.querySelector(selector);assert.ok(target,selector);target.click();};
async function hash(value){w.location.hash=value;await tick();}
async function search(value){el('search').value=value;el('search').dispatchEvent(new w.Event('input',{bubbles:true}));await tick();}
function pass(message){output.push(message);}

(async()=>{
  w.eval(fs.readFileSync(path.join(dist,'app.js'),'utf8'));
  await tick();
  assert.equal(el('error').hidden,true);
  assert.equal(d.querySelectorAll('#catalog-nav a').length,13);
  assert.equal(d.querySelectorAll('#results .card').length,24);
  pass('Initial catalog: 13 sections; first page renders 24 cards');

  await search('Captain America');
  assert.equal(d.querySelectorAll('#results .card').length,1);
  click('[data-open]');await tick();
  assert.equal(el('detail').open,true);
  assert.equal(el('detail-title').textContent,'Captain America');
  assert.match(el('detail-body').textContent,/400/);
  pass('Hero search and detail link open the matching record');

  click('#detail [data-save]');
  assert.equal(el('saved-count').textContent,'1');
  click('#close-detail');
  assert.equal(el('detail').open,false);
  click('#saved-toggle');await tick();
  assert.equal(d.querySelectorAll('#results .card').length,1);
  click('#results [data-save]');
  assert.equal(el('saved-count').textContent,'0');
  assert.equal(el('section-count').textContent,'0');
  assert.equal(el('empty').hidden,false);
  pass('Saved entries add, browse, remove and update counts');

  await hash('heroes');await search('zz-no-such-hero-zz');
  assert.equal(el('empty').hidden,false);
  click('#empty-reset');
  assert.equal(el('search').value,'');
  assert.equal(d.querySelectorAll('#results .card').length,24);
  click('#table-mode');
  assert.equal(d.querySelectorAll('.catalog-table tbody tr').length,24);
  pass('Zero-results reset and table view work');

  await hash('items');
  click('#next');
  assert.equal(el('page-info').textContent,'2 / 115');
  el('page-size').value='96';el('page-size').dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelectorAll('.catalog-table tbody tr').length,96);
  pass('Large catalog pagination and page-size controls work');

  await hash('zones?q=MGH%20Warehouse');
  click('[data-open]');await tick();
  assert.equal(el('detail-title').textContent,'MGH Warehouse');
  assert.match(el('detail-body').textContent,/South and East.*Lower East Side/s);
  assert.match(el('detail-body').textContent,/Poison on the Streets/);
  click('#close-detail');
  pass('MGH Warehouse includes directions and a related mission');

  await hash('guide/camera');
  assert.match(el('guide-view').textContent,/V or F6/);
  assert.match(el('guide-view').textContent,/third person, overhead and first person/);
  await hash('guide/gameplay');
  assert.match(el('currency-result').textContent,/400 Splinters = 900 G/);
  el('currency-input').value='3';el('currency-input').dispatchEvent(new w.Event('input'));
  assert.match(el('currency-result').textContent,/multiple of 4/);
  pass('Camera guide and currency calculator use the current edition settings');

  const catalog=JSON.parse(fs.readFileSync(path.join(dist,'catalog.json'),'utf8'));
  assert.equal(catalog.details['1|'].name,'Ash Rune');
  assert.equal(catalog.details['1|p:1'].name,'Enervating Slash');
  let recordCount=0,images=0;
  for(const section of catalog.sections)for(const record of section.records){
    recordCount++;
    for(const image of [record.icon,record.art].filter(Boolean)){assert.ok(fs.existsSync(path.join(dist,image)),image);assert.ok(!image.startsWith('http'));images++;}
    if(record.tooltipId)assert.ok(catalog.details[record.tooltipId+'|'+record.tooltipFilter],record.name);
  }
  for(const facts of Object.values(catalog.details))if(facts.icon)assert.ok(fs.existsSync(path.join(dist,facts.icon)),facts.icon);
  assert.equal(recordCount,8188);
  const publicText=['app.js','catalog.json','edition.json','index.html'].map(f=>fs.readFileSync(path.join(dist,f),'utf8')).join('\n');
  assert.doesNotMatch(publicText,/private server|ai players|autonomous players|valkrum rising|ffxi-vr|Account\.db|127\.0\.0\.1|password|api[_-]?key/i);
  assert.equal(errors.length,0,errors.join('\n'));
  pass('All 8,188 records resolve; tooltip namespaces remain separate; artwork is local; public content constraints pass');
  const report={passed:true,checks:output,records:recordCount,referenceImages:images,visualQA:'Browser appearance is reviewed separately from these automated checks.',errors};
  fs.mkdirSync(path.join(root,'checks'),{recursive:true});fs.writeFileSync(path.join(root,'checks','site-checks.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
