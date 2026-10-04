import puppeteer from 'puppeteer-core';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(project,'web/assets/elements');
const chrome=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>resolve(base,'Google/Chrome/Application/chrome.exe')).find(existsSync);
if(!chrome)throw new Error('Chrome not found');
const report={status:'running',startedAt:new Date().toISOString(),source:'web/elements-scene.js',reused:'Unmodified shared files and five original chapter-exported characters',items:[]};
const record=()=>writeFileSync(resolve(project,'notes/elements-render-results.json'),JSON.stringify(report,null,2)+'\n');
let browser;
try{
  browser=await puppeteer.launch({executablePath:chrome,headless:true,protocolTimeout:0,args:['--allow-file-access-from-files','--ignore-gpu-blocklist','--enable-webgl','--use-angle=d3d11','--disable-renderer-backgrounding'],timeout:120000});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(resolve(project,'web/elements-studio.html')).href+'?render',{waitUntil:'load'});
  await page.waitForFunction(()=>window.ready&&window.elementSceneReady,{timeout:60000});
  report.gpu=await page.evaluate(()=>window.gpuInfo());if(/swiftshader|software|llvmpipe/i.test(report.gpu))throw new Error('Hardware renderer required');
  report.sourceHash=createHash('sha256').update(readFileSync(resolve(project,'web/elements-scene.js'))).digest('hex');
  const items=await page.evaluate(()=>window.ElementCatalog);mkdirSync(output,{recursive:true});record();
  for(const item of items){
    const result=await page.evaluate(async id=>{const frame=await renderElement(id),canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;canvas.getContext('2d').drawImage(document.querySelector('#out'),0,0,960,540);return{url:canvas.toDataURL('image/jpeg',.88),renderMs:frame.renderMs};},item.id);
    if(errors.length)throw new Error(errors.join('; '));
    const data=Buffer.from(result.url.slice(result.url.indexOf(',')+1),'base64');writeFileSync(resolve(output,item.id+'.jpg'),data);
    report.items.push({id:item.id,file:'web/assets/elements/'+item.id+'.jpg',width:960,height:540,renderMs:Math.round(result.renderMs),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});record();console.log(item.id+': '+Math.round(result.renderMs)+' ms');
  }
  report.status='passed';report.completedAt=new Date().toISOString();record();
  writeFileSync(resolve(output,'manifest.json'),JSON.stringify({sourceHash:report.sourceHash,gpu:report.gpu,generatedAt:report.completedAt,items:report.items},null,2)+'\n');
}catch(error){report.status='failed';report.error=error.message;record();throw error;}finally{await browser?.close();}
