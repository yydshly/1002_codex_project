import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://localhost:4191/projects/008-pdoom-video/example.html';
const chrome = [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
if (!chrome) throw new Error('Chrome not found.');
const report = {status:'running',startedAt:new Date().toISOString(),url,checks:[],diagnostics:{pageErrors:[],consoleErrors:[],httpErrors:[]}};
const record=()=>writeFileSync(resolve(project,'notes/example-web-verification.json'),JSON.stringify(report,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=async(name,fn)=>{const details=await fn();report.checks.push({name,status:'passed',...(details||{})});record();console.log('PASS '+name);};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
let browser;
try {
  const manifest=JSON.parse(readFileSync(resolve(project,'web/assets/example/manifest.json')));
  await check('Rendered source and actual H.264 exports',async()=>{
    assert.equal(manifest.sourceHash,hash(readFileSync(resolve(project,'web/example-scene.js'))));
    const data=[];
    for(const style of ['warm','cool','flat']) {
      const video=resolve(project,`web/assets/example/${style}.mp4`);
      const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration','-of','json',video],{encoding:'utf8',windowsHide:true}));
      assert.equal(probe.streams.length,1);const v=probe.streams[0];
      assert.equal(v.codec_type,'video');assert.equal(v.codec_name,'h264');assert.equal(v.width,1920);assert.equal(v.height,1080);assert.equal(v.r_frame_rate,'12/1');assert.equal(Number(v.nb_read_frames),72);assert.equal(Number(v.duration),6);
      assert.equal(manifest.styles[style].frameTimes.length,72);data.push({style,...v});
    }
    assert.deepEqual(manifest.styles.warm.frameTimes,manifest.styles.cool.frameTimes);
    assert.deepEqual(manifest.styles.warm.frameTimes,manifest.styles.flat.frameTimes);
    const hashes=['warm','cool','flat'].map(style=>hash(readFileSync(resolve(project,`web/assets/example/${style}/f045.jpg`))));
    assert.equal(new Set(hashes).size,3);
    return {videos:data,identicalMotionAcrossStyles:true};
  });
  browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-webgl']});
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.diagnostics.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.diagnostics.consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)report.diagnostics.httpErrors.push({url:response.url(),status:response.status()});});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.goto(url,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const imageReady=()=>page.waitForFunction(()=>{const img=document.querySelector('#example-image');return img.complete&&img.naturalWidth===960&&img.naturalHeight===540;});
  await check('Four storyboard actions map to actual frames',async()=>{
    const actions=[];
    for(let i=0;i<4;i++) {
      await page.click(`[data-shot="${i}"]`);await imageReady();
      const state=await page.evaluate(()=>({state:window.exampleState,title:document.querySelector('#action-title').textContent,selected:document.querySelector('[data-shot][aria-pressed="true"]').dataset.shot}));
      assert.equal(state.state.pose.shot,i);assert.equal(Number(state.selected),i);actions.push({title:state.title,time:state.state.time});
    }
    return {actions};
  });
  await check('Frame slider, keyboard and button-to-light timing',async()=>{
    const seek=async n=>{await page.$eval('#frame',(element,n)=>{element.value=String(n);element.dispatchEvent(new Event('input',{bubbles:true}));},n);await imageReady();return page.evaluate(()=>window.exampleState);};
    const before=await seek(38),press=await seek(39);
    assert.equal(before.pose.on,false);assert.equal(press.pose.on,true);assert.equal(press.pose.press,1);assert.equal(press.time,3.25);
    const walk=await seek(19);assert.ok(walk.pose.x>460&&walk.pose.x<1030);
    await page.focus('#frame');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>window.exampleState.index===20);
    return {beforeTime:before.time,lightOnTime:press.time,pressPercent:100,keyboardFrame:20};
  });
  await check('Three style controls preserve motion and change assets',async()=>{
    await page.click('[data-shot="3"]');
    const original=await page.evaluate(()=>window.exampleState.pose);
    for(const style of ['warm','cool','flat']) {
      await page.click(`[data-style="${style}"]`);await imageReady();
      const state=await page.evaluate(()=>({pose:window.exampleState.pose,style:window.exampleState.style,src:document.querySelector('#example-image').src,brush:document.querySelector('#brush-title').textContent,download:document.querySelector('#download').href}));
      assert.deepEqual(state.pose,original);assert.equal(state.style,style);assert.ok(state.src.includes(`/${style}/`));assert.ok(state.download.endsWith(`/${style}.mp4`));
      assert.ok(state.brush.includes(style==='flat'?'平涂':'水彩'));
    }
    return {identicalPose:true};
  });
  await check('Each actual MP4 plays and pauses at its current frame',async()=>{
    const videos=[];
    for(const style of ['warm','cool','flat']) {
      await page.click(`[data-style="${style}"]`);await page.click('#restart');await page.click('#play');
      await page.waitForFunction(()=>document.querySelector('#example-video').currentTime>.3);
      const dimensions=await page.$eval('#example-video',v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime,hidden:v.hidden}));
      assert.equal(dimensions.width,1920);assert.equal(dimensions.height,1080);assert.equal(dimensions.duration,6);assert.equal(dimensions.hidden,false);
      await page.click('#play');await imageReady();
      const paused=await page.evaluate(()=>({paused:document.querySelector('#example-video').paused,imgHidden:document.querySelector('#example-image').hidden,playing:window.exampleState.playing,index:window.exampleState.index}));
      assert.equal(paused.paused,true);assert.equal(paused.imgHidden,false);assert.equal(paused.playing,false);assert.ok(paused.index>0);videos.push({style,...dimensions});
    }
    return {videos};
  });
  await check('Four actual painting layers load and differ',async()=>{
    const hashes=[];
    for(const layer of ['outline','flat','brush','paper']) {
      await page.click(`[data-layer="${layer}"]`);
      await page.waitForFunction(layer=>{const img=document.querySelector('#layer-image');return img.src.endsWith(`layer-${layer}.jpg`)&&img.complete&&img.naturalWidth===960;},{},layer);
      hashes.push(hash(readFileSync(resolve(project,`web/assets/example/layer-${layer}.jpg`))));
    }
    assert.equal(new Set(hashes).size,4);return {distinctImages:4,fixedTime:3.75};
  });
  await check('Desktop and 375px layout, with working source links',async()=>{
    await page.click('[data-style="warm"]');await page.click('#restart');await page.click('[data-layer="paper"]');
    for(const viewport of [{width:1440,height:1000},{width:375,height:1000}]) {
      await page.setViewport({...viewport,deviceScaleFactor:1});await wait(150);await imageReady();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false);
      await page.screenshot({path:resolve(project,`assets/example-page-${viewport.width===375?'mobile':'desktop'}.png`),fullPage:true});
    }
    const links=await page.evaluate(async()=>{const targets=['example-scene.js','example-studio.html','vendor/pdoom/core.js','vendor/pdoom/clawd.js'];return Promise.all(targets.map(async file=>({file,status:(await fetch(file)).status})));});
    assert.ok(links.every(link=>link.status===200));return {viewports:[1440,375],links};
  });
  await check('Original-code studio redraws the new scene',async()=>{
    const studio=new URL('example-studio.html?t=3.75&style=cool',url);
    await page.goto(studio.href,{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('重绘完成'),{timeout:60000});
    const state=await page.evaluate(()=>({pose:window.scenarioLastPose,width:document.querySelector('#out').width,height:document.querySelector('#out').height,status:document.querySelector('#status').textContent,gpu:window.gpuInfo()}));
    assert.equal(state.width,1920);assert.equal(state.height,1080);assert.equal(state.pose.t,3.75);assert.equal(state.pose.on,true);
    return state;
  });
  await check('No browser or resource errors',async()=>{assert.deepEqual(report.diagnostics,{pageErrors:[],consoleErrors:[],httpErrors:[]});return {errors:0};});
  report.status='passed';report.completedAt=new Date().toISOString();record();
}catch(error){report.status='failed';report.error=error.message;record();throw error;}finally{await browser?.close();}
