import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
if(!chrome)throw new Error('Chrome not found');
const hash=data=>createHash('sha256').update(data).digest('hex');
const report={status:'running',generatedAt:new Date().toISOString(),method:'Native HTML/CSS diagram exported by Chromium; existing source-rendered images embedded unchanged',source:'overview.html',sourceHash:hash(readFileSync(resolve(project,'web/overview.html'))),styleHash:hash(readFileSync(resolve(project,'web/overview.css'))),upstreamCommit:'fa546a38092e75f2b079e6a86d6abc54dd525d17'};
let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1664,height:1000,deviceScaleFactor:2});
  await page.goto(pathToFileURL(resolve(project,'web/overview.html')).href,{waitUntil:'networkidle0'});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#overview-board img')].map(img=>img.decode()));});
  assert.deepEqual(errors,[]);
  const dimensions=await page.$eval('#overview-board',element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,overflow:element.scrollWidth>element.clientWidth+1}));
  assert.equal(dimensions.overflow,false);
  const files=await page.$$eval('#overview-board img',images=>[...new Set(images.map(image=>image.getAttribute('src')))]);
  report.inputs=files.map(file=>({file,sha256:hash(readFileSync(resolve(project,'web',file)))}));
  report.file='assets/pdoom-understanding.png';
  const bytes=await (await page.$('#overview-board')).screenshot({path:resolve(project,'web',report.file),type:'png'});
  const png=Buffer.from(bytes);
  writeFileSync(resolve(project,'assets/pdoom-understanding.png'),png);
  Object.assign(report,{status:'passed',width:png.readUInt32BE(16),height:png.readUInt32BE(20),bytes:bytes.length,sha256:hash(bytes),completedAt:new Date().toISOString()});
  console.log(`Exported ${report.width} x ${report.height}; ${report.inputs.length} actual rendered inputs; ${(bytes.length/1024/1024).toFixed(2)} MiB`);
}catch(error){report.status='failed';report.error=error.message;throw error;}finally{
  writeFileSync(resolve(project,'web/assets/overview-manifest.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();
}
