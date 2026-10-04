import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),url='http://localhost:4191/projects/008-pdoom-video/elements.html';
const chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
const report={status:'running',startedAt:new Date().toISOString(),url,checks:[],diagnostics:{pageErrors:[],consoleErrors:[],httpErrors:[]}};
const record=()=>writeFileSync(resolve(project,'notes/elements-web-verification.json'),JSON.stringify(report,null,2)+'\n');
const hash=data=>createHash('sha256').update(data).digest('hex');
const check=async(name,fn)=>{const data=await fn();report.checks.push({name,status:'passed',...(data||{})});record();console.log('PASS '+name);};
let browser;
try{
  const manifest=JSON.parse(readFileSync(resolve(project,'web/assets/elements/manifest.json')));
  await check('Fourteen source-rendered previews have recorded hashes',async()=>{
    assert.equal(manifest.items.length,14);assert.equal(manifest.sourceHash,hash(readFileSync(resolve(project,'web/elements-scene.js'))));
    for(const item of manifest.items)assert.equal(item.sha256,hash(readFileSync(resolve(project,item.file))));
    return{items:14,gpu:manifest.gpu};
  });
  browser=await puppeteer.launch({executablePath:chrome,headless:true,protocolTimeout:0,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-webgl']});
  const page=await browser.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',error=>report.diagnostics.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.diagnostics.consoleErrors.push(message.text());});page.on('response',r=>{if(r.status()>=400)report.diagnostics.httpErrors.push({url:r.url(),status:r.status()});});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await page.goto(url,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await check('Catalog filters, details, original sources and dependency guidance',async()=>{
    assert.equal(await page.$$eval('[data-element]',cards=>cards.length),14);
    const data=await page.evaluate(()=>window.ElementCatalog);
    for(const item of data){await page.click(`[data-element="${item.id}"]`);await page.waitForFunction(id=>{const img=document.querySelector('#element-image');return img.src.endsWith(`/${id}.jpg`)&&img.complete&&img.naturalWidth===960;},{},item.id);const selected=await page.evaluate(()=>window.elementCatalogState);assert.equal(selected.selected,item.id);assert.ok(selected.item.prepare.length>10);}
    await page.click('[data-filter="character"]');assert.equal(await page.$$eval('[data-element]',c=>c.length),8);
    await page.click('[data-filter="prop"]');assert.equal(await page.$$eval('[data-element]',c=>c.length),6);
    await page.click('[data-filter="all"]');assert.equal(await page.$$eval('[data-element]',c=>c.length),14);
    const links=await page.evaluate(async()=>Promise.all([...new Set(window.ElementCatalog.map(item=>'vendor/pdoom/'+item.file))].map(async file=>({file,status:(await fetch(file)).status}))));assert.ok(links.every(item=>item.status===200));
    return{characters:8,otherElements:6,sourceLinks:links.length};
  });
  await check('Preparation instructions and model handoff cover the full pipeline',async()=>{
    assert.equal(await page.$$eval('.preparation-grid article',c=>c.length),4);assert.equal(await page.$$eval('.handoff-flow article',c=>c.length),4);
    await page.$eval('#story-request',element=>{element.value='让研究员举起右手，发现一颗星星。';element.dispatchEvent(new Event('input',{bubbles:true}));});
    const text=await page.$eval('#model-brief',e=>e.textContent);assert.ok(text.includes('让研究员举起右手'));for(const token of ['core.js','clawd.js','props.js','关键','72 帧','FFmpeg'])assert.ok(text.includes(token));
    await page.click('#copy-brief');assert.ok((await page.$eval('#copy-status',e=>e.textContent)).match(/已复制|已选中/));
    return{preparationSteps:4,drivingStages:4};
  });
  const complete=()=>page.waitForFunction(()=>window.elementDriveState?.status==='rendered');
  const engine=()=>page.frames().find(frame=>frame.url().includes('elements-studio.html'));
  const pixels=async()=>hash(await engine().evaluate(()=>document.querySelector('#out').toDataURL('image/png')));
  const change=async(selector,value)=>{await page.$eval(selector,(e,value)=>{e.value=String(value);e.dispatchEvent(new Event('change',{bubbles:true}));},value);await complete();};
  await check('Real upstream controller starts and returns a rendered frame',async()=>{
    await page.click('#start-engine');await complete();const state=await page.evaluate(()=>window.elementDriveState);assert.equal(state.input.actor,'clawd');assert.ok(state.renderMs>0);
    const info=await engine().evaluate(()=>({width:document.querySelector('#out').width,height:document.querySelector('#out').height,gpu:window.gpuInfo(),clawd:typeof clawd,researcher:typeof researcher,move:typeof move}));assert.equal(info.width,1920);assert.equal(info.height,1080);assert.equal(info.clawd,'function');assert.equal(info.researcher,'function');assert.equal(info.move,'function');return info;
  });
  await check('Pose, color, face, hat and time change actual rendered pixels',async()=>{
    const original=await pixels();await change('#drive-arm',-60);assert.notEqual(await pixels(),original);
    await change('#drive-color','#3b79b5');const changedColor=await pixels();assert.notEqual(changedColor,original);
    await change('#drive-eyes','scared');assert.equal((await page.evaluate(()=>window.elementDriveState.input)).eyes,'scared');
    await change('#drive-accessory','hard');await change('#drive-x',1250);await change('#drive-size',55);await change('#drive-motion','hop');await change('#drive-time',12);
    const first=await pixels(),s1=await page.evaluate(()=>window.elementDriveState);await change('#drive-time',18);const second=await pixels(),s2=await page.evaluate(()=>window.elementDriveState);
    assert.notEqual(first,second);assert.equal(s1.input.time,1);assert.equal(s2.input.time,1.5);assert.notDeepEqual(s1.pose,s2.pose);
    const code=await page.$eval('#drive-code',e=>e.textContent);assert.ok(code.includes('clawd('));assert.ok(code.includes('const t = 18 / 12'));assert.ok(code.includes('#3b79b5'));
    return{parameters:['arm','color','eyes','hat','x','size','motion','time'],actualFramesDiffer:true};
  });
  await check('Researcher uses its original interface and updates the model brief',async()=>{
    await change('#drive-actor','researcher');assert.equal(await page.$eval('#drive-eyes',e=>e.value),'wide');await change('#drive-accessory','bowtie');await change('#drive-eyes','star');
    const state=await page.evaluate(()=>window.elementDriveState);assert.equal(state.input.actor,'researcher');assert.equal(state.input.accessory,'bowtie');const code=await page.$eval('#drive-code',e=>e.textContent);assert.ok(code.includes('researcher('));assert.ok(code.includes('bowtie: true'));
    const brief=await page.$eval('#model-brief',e=>e.textContent);assert.ok(brief.includes('cast.js'));assert.ok(brief.includes('研究员'));
    await change('#drive-time',30);await change('#drive-motion','idle');const idle=await pixels();
    await change('#drive-motion','spin');assert.notEqual(await pixels(),idle);assert.ok((await page.$eval('#drive-code',e=>e.textContent)).includes('spin: Math.acos(m.sx)'));
    await change('#drive-motion','run');assert.notEqual(await pixels(),idle);assert.ok((await page.$eval('#drive-code',e=>e.textContent)).includes('run: m.walk'));
    return{actor:'researcher',eyes:'star',accessory:'bowtie',adaptedMotions:['spin','run']};
  });
  await check('Rendered pixels repeat for an identical parameter set',async()=>{
    const a=await pixels();await page.click('#apply-drive');await complete();const b=await pixels();assert.equal(a,b);return{identical:true};
  });
  await check('Desktop and mobile layouts include the real controller',async()=>{
    await page.click('[data-element="clawd"]');
    await page.click('.interface-manual summary');assert.equal(await page.$$eval('.interface-table tbody tr',rows=>rows.length),6);
    for(const width of [1440,375]){await page.setViewport({width,height:1000,deviceScaleFactor:1});await page.evaluate(()=>{document.querySelectorAll('img[loading]').forEach(img=>img.loading='eager');});await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(project,`assets/elements-page-${width===375?'mobile':'desktop'}.png`),fullPage:true});}
    return{viewports:[1440,375]};
  });
  await check('No browser or resource errors',async()=>{assert.deepEqual(report.diagnostics,{pageErrors:[],consoleErrors:[],httpErrors:[]});return{errors:0};});
  report.status='passed';report.completedAt=new Date().toISOString();record();
}catch(error){report.status='failed';report.error=error.message;record();throw error;}finally{await browser?.close();}
