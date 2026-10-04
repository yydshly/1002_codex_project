import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),url='http://localhost:4191/projects/008-pdoom-video/overview.html';
const chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
const report={status:'running',url,startedAt:new Date().toISOString(),checks:[],errors:[]};
const record=()=>writeFileSync(resolve(project,'notes/overview-web-verification.json'),JSON.stringify(report,null,2)+'\n');
const hash=data=>createHash('sha256').update(data).digest('hex');
const check=async(name,fn)=>{const data=await fn();report.checks.push({name,status:'passed',...data});record();console.log('PASS '+name);};
let browser;
try{
  const manifest=JSON.parse(readFileSync(resolve(project,'web/assets/overview-manifest.json')));
  await check('Standalone overview image matches its source and real rendered inputs',async()=>{
    assert.equal(manifest.status,'passed');assert.equal(manifest.sourceHash,hash(readFileSync(resolve(project,'web/overview.html'))));assert.equal(manifest.styleHash,hash(readFileSync(resolve(project,'web/overview.css'))));
    const image=readFileSync(resolve(project,'web',manifest.file));assert.equal(manifest.sha256,hash(image));assert.equal(image.readUInt32BE(16),manifest.width);assert.equal(image.readUInt32BE(20),manifest.height);
    assert.equal(manifest.inputs.length,14);for(const item of manifest.inputs)assert.equal(item.sha256,hash(readFileSync(resolve(project,'web',item.file))));
    return{width:manifest.width,height:manifest.height,actualRenderedInputs:14};
  });
  browser=await puppeteer.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
  await page.setViewport({width:1440,height:1000});await page.goto(url,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>[...document.querySelectorAll('#overview-board img')].every(img=>img.complete&&img.naturalWidth>0));
  await check('Understanding covers effects, preparation, AI scripts, rendering, scenarios and personal value',async()=>{
    assert.equal(await page.$$eval('.board-section',s=>s.length),6);assert.equal(await page.$$eval('.pipeline-node',s=>s.length),5);
    const text=await page.$eval('#overview-board',e=>e.textContent);
    for(const token of ['绘图函数','分镜','动画脚本','renderAt(t)','p5.brush','FFmpeg','无需每帧请求模型','风格','使用场景','对你的意义','固定 MV','4.85–13.14','72 帧'])assert.ok(text.includes(token),token);
    return{sections:6,pipelineStages:5};
  });
  await check('Poster links, downloads, evidence and navigation resolve',async()=>{
    const links=await page.evaluate(async()=>Promise.all([...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>!h.startsWith('#')&&!h.startsWith('http')))].map(async href=>({href,status:(await fetch(href)).status}))));assert.ok(links.every(l=>l.status===200));
    assert.ok(await page.$eval('#image-download',a=>a.hasAttribute('download')));
    for(const route of ['elements.html','index.html']){const response=await fetch(url.replace('overview.html',route));const html=await response.text();assert.ok(html.includes('overview.html'),route);}
    return{localLinks:links.length};
  });
  await check('Embedded six-second source-based video actually plays and pauses',async()=>{
    await page.$eval('#overview-video',async v=>{v.currentTime=0;await v.play();});await page.waitForFunction(()=>document.querySelector('#overview-video').currentTime>.2);const data=await page.$eval('#overview-video',v=>{v.pause();return{duration:v.duration,width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,paused:v.paused};});assert.equal(data.duration,6);assert.equal(data.width,1920);assert.equal(data.height,1080);assert.equal(data.paused,true);return data;
  });
  await check('Desktop and mobile reading and image remain within the viewport',async()=>{
    for(const width of [1440,375]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(project,`assets/overview-page-${width===375?'mobile':'desktop'}.png`),fullPage:true});}
    return{viewports:[1440,375]};
  });
  await check('No browser or resource errors',async()=>{assert.deepEqual(report.errors,[]);return{errors:0};});
  report.status='passed';report.completedAt=new Date().toISOString();record();
}catch(error){report.status='failed';report.error=error.message;record();throw error;}finally{await browser?.close();}
