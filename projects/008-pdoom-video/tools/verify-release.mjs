import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(project,'../..');
const site=new URL(process.argv[2]||'http://localhost:4191/');
assert.ok(['http:','https:'].includes(site.protocol));assert.ok(site.pathname.endsWith('/'));
const projectUrl=new URL('projects/008-pdoom-video/',site);
const output=resolve(project,'tools/.render-temp');mkdirSync(output,{recursive:true});
const report={status:'running',site:site.href,project:projectUrl.href,startedAt:new Date().toISOString(),checks:[],errors:[]};
const save=()=>writeFileSync(resolve(output,'release-verification.json'),JSON.stringify(report,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=async(name,fn)=>{const result=await fn();report.checks.push({name,status:'passed',...result});save();console.log('PASS '+name);};
const catalog=JSON.parse(readFileSync(resolve(workspace,'projects/catalog.json'))),entry=catalog.projects.find(item=>item.id==='008');
const chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-webgl']});
  const page=await browser.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  await page.setViewport({width:1440,height:1000});
  await check('Published index has the full eight-part summary and the exact requested guide image',async()=>{
    const response=await page.goto(site.href,{waitUntil:'networkidle0'});assert.equal(response.status(),200);
    const info=await page.evaluate(async()=>{
      const card=[...document.querySelectorAll('.project-card')].find(c=>c.querySelector('.card-meta')?.textContent.includes('PROJECT 008'));if(!card)throw new Error('Project 008 is missing from this site');
      const img=card.querySelector('.cover img');img.loading='eager';await img.decode();
      const bytes=await (await fetch(img.src)).arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);
      return{sections:[...card.querySelectorAll('.summary-section')].map(s=>({title:s.querySelector('dt').textContent,text:s.querySelector('dd').textContent})),image:img.src,width:img.naturalWidth,height:img.naturalHeight,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')};
    });
    assert.deepEqual(info.sections,entry.summarySections);assert.ok(info.image.endsWith('/assets/008-pdoom-video.png'));assert.equal(info.width,3200);assert.equal(info.height,5830);assert.equal(info.sha256,hash(readFileSync(resolve(project,'web/assets/pdoom-understanding.png'))));
    return{summarySections:info.sections.length,imageWidth:info.width,imageHeight:info.height,imageHash:info.sha256};
  });
  await check('All PDoomVideo page routes and the full image are available',async()=>{
    const paths=['index.html','overview.html','elements.html','example.html','source-studio.html','assets/pdoom-understanding.png','vendor/pdoom/core.js'];
    const responses=await page.evaluate(async urls=>Promise.all(urls.map(async url=>({url,status:(await fetch(url)).status}))),paths.map(path=>new URL(path,projectUrl).href));assert.ok(responses.every(r=>r.status===200));return{routes:paths.length};
  });
  await check('Overview reads correctly and its real six-second video plays',async()=>{
    await page.goto(new URL('overview.html',projectUrl).href,{waitUntil:'networkidle0'});await page.waitForFunction(()=>[...document.querySelectorAll('#overview-board img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.$$eval('.board-section',s=>s.length),6);
    await page.$eval('#overview-video',async v=>{await v.play();});await page.waitForFunction(()=>document.querySelector('#overview-video').currentTime>.2);
    const video=await page.$eval('#overview-video',v=>{v.pause();return{duration:v.duration,width:v.videoWidth,height:v.videoHeight};});assert.equal(video.duration,6);assert.equal(video.width,1920);assert.equal(video.height,1080);
    for(const width of [1440,375]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
    return{sections:6,viewports:[1440,375],video};
  });
  await check('Published element catalog really runs and recolors the upstream character',async()=>{
    await page.goto(new URL('elements.html',projectUrl).href,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.dataset.ready==='true');assert.equal(await page.$$eval('[data-element]',s=>s.length),14);
    await page.click('#start-engine');await page.waitForFunction(()=>window.elementDriveState?.status==='rendered');
    const frame=page.frames().find(f=>f.url().includes('elements-studio.html'));
    const before=hash(await frame.evaluate(()=>document.querySelector('#out').toDataURL('image/png')));
    await page.$eval('#drive-color',input=>{input.value='#3b79b5';input.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForFunction(()=>window.elementDriveState?.status==='rendered'&&window.elementDriveState.input.color==='#3b79b5');
    assert.notEqual(hash(await frame.evaluate(()=>document.querySelector('#out').toDataURL('image/png'))),before);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    return{catalogItems:14,actualUpstreamDrawing:true,colorChangesPixels:true};
  });
  await check('No page, console or resource errors during deployed interactions',async()=>{assert.deepEqual(report.errors,[]);return{errors:0};});
  report.status='passed';report.completedAt=new Date().toISOString();save();console.log('Passed '+report.checks.length+' release checks.');
}catch(error){report.status='failed';report.error=error.message;save();throw error;}finally{await browser?.close();}
