import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(project, 'web/assets/example');
const temp = resolve(project, 'tools/.render-temp/example');
const probe = process.argv.includes('--probe');
const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).map(base => resolve(base, 'Google/Chrome/Application/chrome.exe')).find(existsSync);
if (!chrome) throw new Error('Install Chrome or set its standard Windows location.');
const save = (path, url) => { mkdirSync(dirname(path), { recursive: true }); const data = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'); writeFileSync(path, data); return { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }; };
const run = (cmd, args) => new Promise((ok, fail) => { const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); let error='';p.stderr.on('data', chunk => { error += chunk; });p.on('error', fail);p.on('close', code => code === 0 ? ok() : fail(new Error(error || `Encoder exited ${code}`))); });
const report = { status: 'running', startedAt: new Date().toISOString(), source: 'web/example-scene.js', reused: ['web/vendor/pdoom/core.js','web/vendor/pdoom/clawd.js'], fps: 12, duration: 6, audio: false, styles: {}, layers: [] };
const reportPath = resolve(project, 'notes/example-render-results.json');
const record = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
let browser;
try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 0, args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--use-angle=d3d11', '--window-size=1920,1080', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'], timeout: 120000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(pathToFileURL(resolve(project,'web/example-studio.html')).href+'?render', { waitUntil:'load', timeout:120000 });
  try { await page.waitForFunction(()=>window.ready&&window.scenarioRender,{timeout:30000}); }
  catch(error) { const state=await page.evaluate(()=>({ready:window.ready,setup:typeof setup,draw:typeof draw,scenario:typeof scenarioRender,status:document.querySelector('#status')?.textContent}));throw new Error(`Drawing engine initialization failed: ${errors.join('; ') || error.message}; ${JSON.stringify(state)}`); }
  report.gpu = await page.evaluate(()=>{const c=document.querySelector('.p5Canvas'),g=c.getContext('webgl2')||c.getContext('webgl'),ext=g.getExtension('WEBGL_debug_renderer_info');return { renderer:ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER) };});
  if (/swiftshader|llvmpipe|software/i.test(report.gpu.renderer)) throw new Error('Hardware renderer required for this example.');
  const definition = await page.evaluate(()=>{const {pose,...data}=window.scenarioDefinition;return data;});
  report.sourceHash = createHash('sha256').update(readFileSync(resolve(project,'web/example-scene.js'))).digest('hex');
  const draw = async (t,style='warm',layer='paper') => { const frame=await page.evaluate(({t,style,layer})=>window.scenarioRender(t,style,layer),{t,style,layer});if(errors.length)throw new Error(errors.join('; '));return frame;};
  const preview = () => page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;canvas.getContext('2d').drawImage(document.querySelector('#out'),0,0,960,540);return canvas.toDataURL('image/jpeg',.85);});
  if (probe) {
    for(const t of [0,3.75]) {const f=await draw(t);save(resolve(project,`assets/example-probe-${t}.jpg`),f.url);console.log(JSON.stringify({time:t,renderMs:Math.round(f.renderMs),pose:f.pose,gpu:report.gpu}));}
  } else {
    record();
    for(const style of Object.keys(definition.styles)) {
      const started=performance.now(),frames=[];
      for(let i=0;i<72;i++) {
        const name=`f${String(i).padStart(3,'0')}.jpg`,f=await draw(i/12,style),file=save(resolve(temp,style,name),f.url),small=save(resolve(output,style,name),await preview());
        frames.push({index:i,time:i/12,renderMs:Math.round(f.renderMs*10)/10,sourceFrame:file,preview:small,pose:f.pose});
        if(i%12===0)console.log(`${style}: ${i}/72 · ${Math.round(f.renderMs)} ms/frame`);
      }
      const video=resolve(output,`${style}.mp4`);
      await run('ffmpeg',['-y','-loglevel','error','-framerate','12','-i',resolve(temp,style,'f%03d.jpg'),'-frames:v','72','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
      report.styles[style]={frames,totalMs:Math.round(performance.now()-started),video:`web/assets/example/${style}.mp4`,videoBytes:statSync(video).size};record();
    }
    for(const layer of ['outline','flat','brush','paper']) {const f=await draw(3.75,'warm',layer),file=save(resolve(output,`layer-${layer}.jpg`),await preview());report.layers.push({layer,time:3.75,renderMs:Math.round(f.renderMs),...file});record();}
    const a=await draw(3.75),b=await draw(3.75);
    const hash=url=>createHash('sha256').update(url).digest('hex');
    if(hash(a.url)!==hash(b.url))throw new Error('Identical frame time did not reproduce identical pixels.');
    report.determinism={time:3.75,identical:true};report.status='passed';report.completedAt=new Date().toISOString();record();
    const manifest={...definition,sourceHash:report.sourceHash,fps:12,frameCount:72,width:960,height:540,videoWidth:1920,videoHeight:1080,audio:false,generatedAt:report.completedAt,gpu:report.gpu,paintingTime:3.75,layers:report.layers.map(({layer,time})=>({layer,time,file:`layer-${layer}.jpg`})),styles:Object.fromEntries(Object.entries(definition.styles).map(([key,style])=>[key,{...style,frames:`${key}/f{index}.jpg`,video:`${key}.mp4`,frameTimes:report.styles[key].frames.map(({time,pose})=>({time,pose}))}]))};
    writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    console.log('Rendered 216 actual frames, three silent MP4s and four painting layers.');
  }
} catch(error) {if(!probe){report.status='failed';report.error=error.message;record();}throw error;} finally {await browser?.close();}
